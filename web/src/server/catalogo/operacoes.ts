import 'server-only';
import type { ItemCatalogo } from '@/compartilhado/api-tipos';
import { LIMITES } from '@/compartilhado/limites';
import { registrarAuditoriaTx } from '../auditoria/registrar';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { lerDocBau, mapaDaCategoria, quantidadeNoBau, refBau, refCatalogo } from '../dominio/refs';
import type { CategoriaCatalogo, DocBau, TipoBau, UsuarioRef, UsuarioSessao } from '../dominio/tipos';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento, EventoDominio } from '../webhooks/eventos';
import { chaveDeNome } from '../validacao/texto';
import { ehIdDeFormatoValido, ehIdSeguro, gerarIdItem, validarNomeItem } from '../validacao/item';
import { lerCatalogoTx } from './leitura';
import { ESTOQUE_INICIAL } from './estoque-inicial';
import { CATALOGO_PADRAO } from './padrao';
import { garantirCatalogo } from './semente';

const TIPOS: readonly TipoBau[] = ['membros', 'gerencia'];

function refUsuario(u: UsuarioRef): UsuarioRef {
  if (typeof u?.id !== 'string' || !u.id || typeof u.nome !== 'string' || !u.nome) throw new ErroApp('INTERNO');
  return { id: u.id, nome: u.nome };
}

/**
 * Inclui o item em uma categoria (WEB-035). O id é único por categoria; a chave do baú é categoriaId + itemId.
 * Duplicado = mesmo id gerado, ou id/nome equivalente a um item que já existe.
 */
export async function adicionarItemAoCatalogo(
  categoriaId: string,
  nome: unknown,
  usuario: UsuarioRef,
): Promise<{ categoriaId: string; item: ItemCatalogo }> {
  const quem = refUsuario(usuario);
  if (!ehIdSeguro(categoriaId)) throw new ErroApp('VALIDACAO', 'Categoria inválida.');
  const valido = validarNomeItem(nome);
  if (!valido.ok) throw new ErroApp('VALIDACAO', valido.erro);
  const item: ItemCatalogo = { id: valido.id, nome: valido.nome };

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoTx(tx, db);
    const categoria = catalogo.categorias.find((c) => c.id === categoriaId);
    if (!categoria) throw new ErroApp('NAO_ENCONTRADO', 'Categoria não encontrada.');
    if (categoria.itens.some((i) => i.id === item.id || gerarIdItem(i.nome) === item.id || chaveDeNome(i.nome) === chaveDeNome(item.nome))) {
      throw new ErroApp('DUPLICADO', 'Já existe um item com esse nome nesta categoria.');
    }
    if (categoria.itens.length >= LIMITES.ITENS_POR_CATEGORIA_MAX) {
      throw new ErroApp('LIMITE_CATEGORIA', `Cada categoria aceita no máximo ${LIMITES.ITENS_POR_CATEGORIA_MAX} itens.`);
    }

    const categorias = catalogo.categorias.map((c) => (c.id === categoriaId ? { ...c, itens: [...c.itens, item] } : c));
    const agora = new Date().toISOString();
    tx.set(refCatalogo(db), { categorias, atualizadoEm: agora });
    registrarAuditoriaTx(tx, db, {
      acao: 'catalogo.adicionar_item',
      usuario: quem,
      alvo: { categoriaId, itemId: item.id, nomeItem: item.nome },
      resumo: `Adicionou "${item.nome}" em ${categoria.nome}.`,
      antes: null,
      depois: { categoriaId, item },
    });
    return { categoriaId, item };
  });
}

function semItem(bau: DocBau, categoriaId: string, itemId: string): DocBau['itens'] {
  const itens = { ...bau.itens };
  const categoria = { ...(mapaDaCategoria(itens, categoriaId) ?? {}) };
  delete categoria[itemId];
  if (Object.keys(categoria).length === 0) delete itens[categoriaId];
  else itens[categoriaId] = categoria;
  return itens;
}

/**
 * Remove o item do catálogo e dos dois baús em UMA transação (WEB-036), com auditoria.
 * Exclusiva do dono: a função confere o nível da sessão além da rota (defesa em profundidade).
 */
export type ResultadoRemocao = { item: ItemCatalogo; removidoDe: Record<TipoBau, number>; auditoriaId: string };

export async function removerItemDoCatalogoComEvento(
  categoriaId: string,
  itemId: string,
  usuario: UsuarioSessao,
): Promise<ComEvento<ResultadoRemocao>> {
  const quem = refUsuario(usuario);
  if (usuario.nivel !== 3) throw new ErroApp('SEM_PERMISSAO');
  if (!ehIdDeFormatoValido(categoriaId) || !ehIdDeFormatoValido(itemId)) throw new ErroApp('VALIDACAO', 'Item inválido.');

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoTx(tx, db);
    const [membros, gerencia] = await Promise.all(TIPOS.map((t) => tx.get(refBau(db, t))));
    if (!membros?.exists || !gerencia?.exists) throw new ErroApp('INTERNO');
    const baus: Record<TipoBau, DocBau> = { membros: lerDocBau(membros.data()), gerencia: lerDocBau(gerencia.data()) };

    const categoria = catalogo.categorias.find((c) => c.id === categoriaId);
    if (!categoria) throw new ErroApp('NAO_ENCONTRADO', 'Categoria não encontrada.');
    const item = categoria.itens.find((i) => i.id === itemId);
    if (!item) throw new ErroApp('NAO_ENCONTRADO', 'Item não encontrado nesta categoria.');

    const agora = new Date().toISOString();
    const removidoDe = {
      membros: quantidadeNoBau(baus.membros.itens, categoriaId, itemId),
      gerencia: quantidadeNoBau(baus.gerencia.itens, categoriaId, itemId),
    };
    const categorias = catalogo.categorias.map((c) =>
      c.id === categoriaId ? { ...c, itens: c.itens.filter((i) => i.id !== itemId) } : c,
    );
    tx.set(refCatalogo(db), { categorias, atualizadoEm: agora });
    for (const tipo of TIPOS) {
      tx.set(refBau(db, tipo), {
        versao: baus[tipo].versao + 1,
        itens: semItem(baus[tipo], categoriaId, itemId),
        atualizadoEm: agora,
      });
    }

    const auditoriaId = registrarAuditoriaTx(tx, db, {
      acao: 'catalogo.remover_item',
      usuario: quem,
      alvo: { categoriaId, itemId, nomeItem: item.nome },
      resumo: `Removeu "${item.nome}" de ${categoria.nome} (membros: ${removidoDe.membros}, gerência: ${removidoDe.gerencia}).`,
      antes: { ...removidoDe },
      depois: null,
    });
    const eventos: EventoDominio[] = [];
    for (const tipo of TIPOS) {
      if (removidoDe[tipo] <= 0) continue;
      const { log } = registrarLogTxCompleto(tx, db, tipo, {
        acao: 'catalogo_remover',
        usuario: quem,
        versao: baus[tipo].versao + 1,
        categoriaId,
        itemId,
        nomeItem: item.nome,
        nomeCategoria: categoria.nome,
        quantidade: removidoDe[tipo],
        saldoResultante: 0,
        resumo: `Item removido do catálogo: ${item.nome}.`,
        auditoriaId,
      });
      eventos.push({ tipo: 'bau.aviso', baus: [tipo], log });
    }
    return { dto: { item: { id: item.id, nome: item.nome }, removidoDe, auditoriaId }, eventos };
  });
}

export async function removerItemDoCatalogo(
  categoriaId: string,
  itemId: string,
  usuario: UsuarioSessao,
): Promise<ResultadoRemocao> {
  return (await removerItemDoCatalogoComEvento(categoriaId, itemId, usuario)).dto;
}

export type ResultadoAtualizacao = { removidos: number; adicionados: number; auditoriaId: string };

/**
 * Troca o catálogo pelo padrão atual (`CATALOGO_PADRAO`) em UMA transação e grava nos dois baús o
 * estoque contado (`ESTOQUE_INICIAL`) no lugar do que havia; a versão dos baús sobe e a auditoria
 * é gravada junto. Gerência e dono.
 */
export async function atualizarCatalogoParaPadrao(usuario: UsuarioSessao): Promise<ResultadoAtualizacao> {
  const quem = refUsuario(usuario);
  if (usuario.nivel < 2) throw new ErroApp('SEM_PERMISSAO');

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const atual = await lerCatalogoTx(tx, db);
    const [membros, gerencia] = await Promise.all(TIPOS.map((t) => tx.get(refBau(db, t))));
    if (!membros?.exists || !gerencia?.exists) throw new ErroApp('INTERNO');
    const baus: Record<TipoBau, DocBau> = { membros: lerDocBau(membros.data()), gerencia: lerDocBau(gerencia.data()) };

    const novas = structuredClone(CATALOGO_PADRAO) as CategoriaCatalogo[];
    const ids = (cs: readonly CategoriaCatalogo[]) => new Set(cs.flatMap((c) => c.itens.map((i) => `${c.id}/${i.id}`)));
    const antigos = ids(atual.categorias);
    const novos = ids(novas);
    const removidos = [...antigos].filter((k) => !novos.has(k)).length;
    const adicionados = [...novos].filter((k) => !antigos.has(k)).length;

    const agora = new Date().toISOString();
    tx.set(refCatalogo(db), { categorias: novas, atualizadoEm: agora });
    for (const tipo of TIPOS) {
      const itens = structuredClone(ESTOQUE_INICIAL[tipo]) as DocBau['itens'];
      tx.set(refBau(db, tipo), { versao: baus[tipo].versao + 1, itens, atualizadoEm: agora });
    }
    const auditoriaId = registrarAuditoriaTx(tx, db, {
      acao: 'catalogo.remover_item',
      usuario: quem,
      alvo: { categoriaId: 'catalogo', itemId: 'padrao', nomeItem: 'Catálogo padrão' },
      resumo: `Atualizou o catálogo (${removidos} removidos, ${adicionados} novos) e o estoque dos baús.`,
      antes: { itens: antigos.size },
      depois: { itens: novos.size },
    });
    return { removidos, adicionados, auditoriaId };
  });
}
