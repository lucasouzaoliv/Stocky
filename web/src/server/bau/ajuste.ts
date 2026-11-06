import 'server-only';
import type { ConfirmacaoAjusteDTO, PreviaAjusteDTO } from '@/compartilhado/api-tipos';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { registrarAuditoriaTx } from '../auditoria/registrar';
import { ErroApp, type DetalhesErro } from '../erros';
import { getDb } from '../firebase';
import { lerCatalogoDoc, lerCatalogoTx } from '../catalogo/leitura';
import { garantirCatalogo } from '../catalogo/semente';
import { exigirTipoBau, lerDocBau, refBau, refCatalogo } from '../dominio/refs';
import type { DocBau, DocCatalogo, UsuarioRef } from '../dominio/tipos';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento } from '../webhooks/eventos';
import { ehIdSeguro } from '../validacao/item';

export interface LinhaAjuste {
  categoriaId: unknown;
  itemId: unknown;
  quantidade: unknown;
}

interface LinhaValida {
  indice: number;
  categoriaId: string;
  itemId: string;
  quantidade: number;
}

type LinhaInvalida = NonNullable<DetalhesErro['linhas']>[number];

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function recusar(mensagem: string, linhas?: LinhaInvalida[]): never {
  throw new ErroApp('VALIDACAO', mensagem, linhas ? { linhas } : undefined);
}

function exigirLista(linhas: unknown): asserts linhas is unknown[] {
  if (!Array.isArray(linhas) || linhas.length === 0) recusar('Informe ao menos um item para ajustar.');
  if (linhas.length > LIMITES.AJUSTE_LINHAS_MAX) {
    recusar(`O ajuste aceita no máximo ${LIMITES.AJUSTE_LINHAS_MAX} linhas.`);
  }
}

/**
 * Entrada por ids (nunca texto livre, D1). Valida a forma de todas as linhas e junta TODAS as inválidas.
 * Com `catalogo`, confere também se o item existe na categoria.
 */
function analisarLinhas(linhas: unknown, catalogo: DocCatalogo | null): LinhaValida[] {
  exigirLista(linhas);
  const validas: LinhaValida[] = [];
  const invalidas: LinhaInvalida[] = [];
  const vistos = new Set<string>();

  linhas.forEach((bruta: unknown, indice) => {
    if (!ehObjeto(bruta)) {
      invalidas.push({ indice, motivo: 'Linha inválida.' });
      return;
    }
    const { categoriaId, itemId } = bruta;
    if (!ehIdSeguro(categoriaId) || !ehIdSeguro(itemId)) {
      invalidas.push({ indice, motivo: 'Item inválido.' });
      return;
    }
    const q = parseInteiro(bruta.quantidade, { min: 0, max: LIMITES.QUANTIDADE_MAX });
    if (!q.ok) {
      invalidas.push({ indice, categoriaId, itemId, motivo: q.erro });
      return;
    }
    const chave = `${categoriaId}/${itemId}`;
    if (vistos.has(chave)) {
      invalidas.push({ indice, categoriaId, itemId, motivo: 'Item repetido no ajuste.' });
      return;
    }
    vistos.add(chave);
    if (catalogo && !catalogo.categorias.find((c) => c.id === categoriaId)?.itens.some((i) => i.id === itemId)) {
      invalidas.push({ indice, categoriaId, itemId, motivo: 'Item não encontrado no catálogo.' });
      return;
    }
    validas.push({ indice, categoriaId, itemId, quantidade: q.valor });
  });

  if (invalidas.length > 0) {
    invalidas.sort((a, b) => a.indice - b.indice);
    recusar('Há linhas inválidas no ajuste. Corrija e tente de novo.', invalidas);
  }
  return validas;
}

function nomeDoItem(catalogo: DocCatalogo, categoriaId: string, itemId: string): string {
  return catalogo.categorias.find((c) => c.id === categoriaId)?.itens.find((i) => i.id === itemId)?.nome ?? itemId;
}

/** Somente leitura (WEB-040): `antes` atual, `depois` pedido e a versão do baú lida junto com o estoque. */
export async function preverAjuste(tipoBruto: unknown, linhas: unknown): Promise<PreviaAjusteDTO> {
  const tipo = exigirTipoBau(tipoBruto);
  exigirLista(linhas);
  await garantirCatalogo();
  const db = getDb();
  const [snapCatalogo, snapBau] = await Promise.all([refCatalogo(db).get(), refBau(db, tipo).get()]);
  if (!snapCatalogo.exists || !snapBau.exists) throw new ErroApp('INTERNO');
  const catalogo = lerCatalogoDoc(snapCatalogo.data());
  const pedidas = analisarLinhas(linhas, catalogo);
  const bau = lerDocBau(snapBau.data());

  const resultado = pedidas.map((l) => ({
    categoriaId: l.categoriaId,
    itemId: l.itemId,
    nome: nomeDoItem(catalogo, l.categoriaId, l.itemId),
    antes: bau.itens[l.categoriaId]?.[l.itemId] ?? 0,
    depois: l.quantidade,
  }));
  return { tipo, versao: bau.versao, alterados: resultado.filter((l) => l.antes !== l.depois).length, linhas: resultado };
}

function versaoValida(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new ErroApp('VALIDACAO', 'Versão do baú inválida. Refaça o ajuste.');
  }
  return v;
}

function aplicar(bau: DocBau, mudancas: LinhaValida[]): DocBau['itens'] {
  const itens: DocBau['itens'] = {};
  for (const [categoriaId, mapa] of Object.entries(bau.itens)) itens[categoriaId] = { ...mapa };
  for (const m of mudancas) {
    if (m.quantidade === 0) {
      delete itens[m.categoriaId]?.[m.itemId];
      if (itens[m.categoriaId] && Object.keys(itens[m.categoriaId]!).length === 0) delete itens[m.categoriaId];
    } else {
      itens[m.categoriaId] = { ...(itens[m.categoriaId] ?? {}), [m.itemId]: m.quantidade };
    }
  }
  return itens;
}

/**
 * Confirma o ajuste em UMA transação com controle de versão otimista (WEB-041, corrige D3):
 * a versão é conferida DENTRO da transação; se o baú mudou desde a prévia, nada é gravado.
 */
export async function confirmarAjusteComEvento(
  tipoBruto: unknown,
  versaoVista: unknown,
  linhas: unknown,
  usuario: UsuarioRef,
): Promise<ComEvento<ConfirmacaoAjusteDTO>> {
  const tipo = exigirTipoBau(tipoBruto);
  if (typeof usuario?.id !== 'string' || !usuario.id || typeof usuario.nome !== 'string' || !usuario.nome) {
    throw new ErroApp('INTERNO');
  }
  const quem = { id: usuario.id, nome: usuario.nome };
  const versao = versaoValida(versaoVista);
  analisarLinhas(linhas, null);

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoTx(tx, db);
    const snap = await tx.get(refBau(db, tipo));
    if (!snap.exists) throw new ErroApp('INTERNO');
    const bau = lerDocBau(snap.data());

    if (bau.versao !== versao) {
      throw new ErroApp('VERSAO_DESATUALIZADA', 'O baú mudou desde o resumo. Refaça o ajuste.');
    }
    const pedidas = analisarLinhas(linhas, catalogo);

    const mudancas = pedidas.filter((l) => (bau.itens[l.categoriaId]?.[l.itemId] ?? 0) !== l.quantidade);
    if (mudancas.length === 0) return { dto: { alterados: 0, versao: bau.versao, auditoriaId: null }, eventos: [] };

    const antes: Record<string, Record<string, number>> = {};
    const depois: Record<string, Record<string, number>> = {};
    for (const m of mudancas) {
      (antes[m.categoriaId] ??= {})[m.itemId] = bau.itens[m.categoriaId]?.[m.itemId] ?? 0;
      (depois[m.categoriaId] ??= {})[m.itemId] = m.quantidade;
    }
    const novaVersao = bau.versao + 1;
    tx.set(refBau(db, tipo), {
      versao: novaVersao,
      itens: aplicar(bau, mudancas),
      atualizadoEm: new Date().toISOString(),
    });
    const nomeBau = tipo === 'membros' ? 'Baú dos Membros' : 'Baú da Gerência';
    const resumo = `Ajuste em massa no ${nomeBau}: ${mudancas.length} ${mudancas.length === 1 ? 'item alterado' : 'itens alterados'}.`;
    const auditoriaId = registrarAuditoriaTx(tx, db, {
      acao: 'bau.ajuste_massa',
      usuario: quem,
      alvo: { tipo },
      resumo,
      antes,
      depois,
    });
    const { log } = registrarLogTxCompleto(tx, db, tipo, {
      acao: 'ajuste',
      usuario: quem,
      versao: novaVersao,
      categoriaId: null,
      itemId: null,
      nomeItem: null,
      nomeCategoria: null,
      quantidade: null,
      saldoResultante: null,
      resumo,
      auditoriaId,
    });
    return {
      dto: { alterados: mudancas.length, versao: novaVersao, auditoriaId },
      eventos: [{ tipo: 'bau.aviso', baus: [tipo], log }],
    };
  });
}

export async function confirmarAjuste(
  tipoBruto: unknown,
  versaoVista: unknown,
  linhas: unknown,
  usuario: UsuarioRef,
): Promise<ConfirmacaoAjusteDTO> {
  return (await confirmarAjusteComEvento(tipoBruto, versaoVista, linhas, usuario)).dto;
}
