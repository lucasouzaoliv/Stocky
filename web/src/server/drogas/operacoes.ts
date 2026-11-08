import 'server-only';
import type { DadosDTO, EstadoDrogaDTO, LinhaRankingDTO, LinhaVendaDTO, PendenciaDTO, ResultadoDrogaDTO } from '@/compartilhado/api-tipos';
import {
  DROGA,
  calcularVenda,
  ehMotivoGuardar,
  ehMotivoRetirada,
  motivoCobra,
  ROTULO_MOTIVO,
  type AcaoDroga,
  type MotivoRetirada,
} from '@/compartilhado/drogas';
import { formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { lerCatalogoTx } from '../catalogo/leitura';
import { garantirCatalogo } from '../catalogo/semente';
import { exigirTipoBau, lerDocBau, lerDocSaldo, quantidadeNoBau, refBau, refLogs, refSaldo } from '../dominio/refs';
import type { Db, DocumentReference } from '../firebase';
import { getDb } from '../firebase';
import type { TipoBau, UsuarioRef } from '../dominio/tipos';
import { ErroApp } from '../erros';
import { sanearTexto, temCaractereVisivel } from '../validacao/texto';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento } from '../webhooks/eventos';

const refPendencia = (db: Db, usuarioId: string): DocumentReference => db.collection('pendencias').doc(usuarioId);
const refMovs = (db: Db) => db.collection('drogas_movs');

const LEITURA_MAX = 1000;
const TOP = 10;

function inteiro(v: unknown): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
}
function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

interface DocPendencia {
  devido: number;
  desde: string | null;
}
function lerPendenciaDoc(dados: unknown): DocPendencia {
  const d = (typeof dados === 'object' && dados !== null ? dados : {}) as Record<string, unknown>;
  return { devido: inteiro(d.devido), desde: typeof d.desde === 'string' ? d.desde : null };
}

export interface PedidoDroga {
  tipo: unknown;
  acao: unknown;
  quantidade: unknown;
  motivo: unknown;
  deposito?: unknown;
  /** Para quem foi vendido. Obrigatório quando o motivo é uma venda. */
  comprador?: unknown;
}

function lerComprador(v: unknown, obrigatorio: boolean): string {
  const bruto = typeof v === 'string' ? sanearTexto(v) : '';
  if (!temCaractereVisivel(bruto)) {
    if (obrigatorio) throw new ErroApp('VALIDACAO', 'Informe para quem foi vendido.');
    return '';
  }
  if (Array.from(bruto).length > LIMITES.ANOTACAO_MAX) {
    throw new ErroApp('VALIDACAO', `O nome do comprador pode ter no máximo ${LIMITES.ANOTACAO_MAX} caracteres.`);
  }
  return bruto;
}

function lerDeposito(v: unknown): number {
  if (v === undefined || v === null || v === '' || v === 0 || v === '0') return 0;
  const r = parseInteiro(v, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
  if (!r.ok) throw new ErroApp('VALIDACAO', r.erro);
  return r.valor;
}

/**
 * Retira ou guarda Saco de Meta. Na MESMA transação: estoque do baú, log do baú, entrada no caixa (se o usuário
 * informou o dinheiro depositado), pendência do usuário e o registro usado na aba Dados.
 * Retirada para venda cria cobrança: o usuário fica em pendência até depositar o valor.
 */
export async function movimentarDroga(p: PedidoDroga, usuario: UsuarioRef): Promise<ComEvento<ResultadoDrogaDTO>> {
  const tipo: TipoBau = exigirTipoBau(p.tipo);
  if (p.acao !== 'retirar' && p.acao !== 'guardar') throw new ErroApp('VALIDACAO', 'Ação inválida.');
  const acao: AcaoDroga = p.acao;
  const q = parseInteiro(p.quantidade, { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
  if (!q.ok) throw new ErroApp('VALIDACAO', q.erro);
  if (acao === 'retirar' ? !ehMotivoRetirada(p.motivo) : !ehMotivoGuardar(p.motivo)) {
    throw new ErroApp('VALIDACAO', 'Escolha o motivo.');
  }
  const motivo = p.motivo as string;
  const deposito = lerDeposito(p.deposito);
  const quem: UsuarioRef = { id: usuario.id, nome: usuario.nome };
  const ehVenda = acao === 'retirar' && motivoCobra(motivo as MotivoRetirada);
  const comprador = acao === 'retirar' ? lerComprador(p.comprador, ehVenda) : '';
  const venda = ehVenda ? calcularVenda(motivo as MotivoRetirada, q.valor) : null;
  const esperado = venda?.total ?? 0;

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoTx(tx, db);
    const categoria = catalogo.categorias.find((c) => c.id === DROGA.categoriaId);
    const item = categoria?.itens.find((i) => i.id === DROGA.itemId);
    if (!categoria || !item) throw new ErroApp('NAO_ENCONTRADO', 'Item não encontrado no catálogo.');
    const snapBau = await tx.get(refBau(db, tipo));
    if (!snapBau.exists) throw new ErroApp('INTERNO');
    const saldo = lerDocSaldo((await tx.get(refSaldo(db))).data());
    const pend = lerPendenciaDoc((await tx.get(refPendencia(db, quem.id))).data());

    const bau = lerDocBau(snapBau.data());
    const atual = quantidadeNoBau(bau.itens, DROGA.categoriaId, DROGA.itemId);
    let novo: number;
    if (acao === 'guardar') {
      novo = atual + q.valor;
      if (!Number.isSafeInteger(novo)) throw new ErroApp('VALIDACAO', 'A quantidade passaria do limite permitido para o baú.');
    } else {
      if (atual === 0) throw new ErroApp('NAO_ENCONTRADO', 'O item não está no baú.');
      if (q.valor > atual) throw new ErroApp('ESTOQUE_INSUFICIENTE', `Estoque insuficiente. Disponível: ${formatarNumero(atual)}.`);
      novo = atual - q.valor;
    }

    const agora = new Date().toISOString();
    const devidoComVenda = pend.devido + esperado;
    const devido = Math.max(0, devidoComVenda - deposito);

    const mapa = { ...(bau.itens[DROGA.categoriaId] ?? {}) };
    if (novo === 0) delete mapa[DROGA.itemId];
    else mapa[DROGA.itemId] = novo;
    const itens = { ...bau.itens };
    if (Object.keys(mapa).length === 0) delete itens[DROGA.categoriaId];
    else itens[DROGA.categoriaId] = mapa;

    const versao = bau.versao + 1;
    tx.set(refBau(db, tipo), { versao, itens, atualizadoEm: agora });
    const { log } = registrarLogTxCompleto(tx, db, tipo, {
      acao: acao === 'guardar' ? 'adicionar' : 'remover',
      usuario: quem,
      versao,
      categoriaId: DROGA.categoriaId,
      itemId: DROGA.itemId,
      nomeItem: item.nome,
      nomeCategoria: categoria.nome,
      quantidade: q.valor,
      saldoResultante: novo,
      resumo: `Motivo: ${ROTULO_MOTIVO[motivo] ?? motivo}${comprador ? ` · Vendido para: ${comprador}` : ''}`,
      auditoriaId: null,
    });
    const eventos: ComEvento<ResultadoDrogaDTO>['eventos'] = [{ tipo: 'bau.movimento', bau: tipo, log }];

    if (deposito > 0) {
      const novoLimpo = saldo.limpo + deposito;
      if (!Number.isSafeInteger(novoLimpo)) throw new ErroApp('VALIDACAO', 'O saldo passaria do limite permitido.');
      tx.set(refSaldo(db), { sujo: saldo.sujo, limpo: novoLimpo, versao: saldo.versao + 1, atualizadoEm: agora });
      const { log: logCaixa } = registrarLogTxCompleto(tx, db, 'caixa', {
        acao: 'entrada',
        tipo: 'limpo',
        valor: deposito,
        anotacao: `Depósito da venda de ${DROGA.nome}`,
        saldoResultante: novoLimpo,
        usuario: quem,
      });
      eventos.push({ tipo: 'caixa.movimento', log: logCaixa });
    }

    tx.set(refPendencia(db, quem.id), {
      usuarioId: quem.id,
      nome: quem.nome,
      devido,
      desde: devido === 0 ? null : pend.devido > 0 && pend.desde ? pend.desde : agora,
      atualizadoEm: agora,
    });
    tx.create(refMovs(db).doc(), {
      data: agora,
      usuario: quem,
      bau: tipo,
      tipo: acao === 'retirar' ? 'retirada' : 'guardar',
      motivo,
      quantidade: q.valor,
      esperado,
      deposito,
      comprador,
    });
    if (acao === 'retirar' && devido > 0) {
      eventos.push({ tipo: 'droga.pendencia', usuario: quem, devido, quantidade: q.valor, motivo, comprador, jaPendente: pend.devido > 0 });
    }
    return { dto: { estoque: novo, versao, esperado, devido }, eventos };
  });
}

/** Depósito de dinheiro da venda: entra no caixa (dinheiro limpo) e abate a pendência do usuário. */
export async function depositarVenda(valorCru: unknown, usuario: UsuarioRef): Promise<ComEvento<{ devido: number }>> {
  const v = parseInteiro(valorCru, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
  if (!v.ok) throw new ErroApp('VALIDACAO', v.erro);
  const quem: UsuarioRef = { id: usuario.id, nome: usuario.nome };
  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const saldo = lerDocSaldo((await tx.get(refSaldo(db))).data());
    const pend = lerPendenciaDoc((await tx.get(refPendencia(db, quem.id))).data());
    const agora = new Date().toISOString();
    const novoLimpo = saldo.limpo + v.valor;
    if (!Number.isSafeInteger(novoLimpo)) throw new ErroApp('VALIDACAO', 'O saldo passaria do limite permitido.');
    const devido = Math.max(0, pend.devido - v.valor);
    tx.set(refSaldo(db), { sujo: saldo.sujo, limpo: novoLimpo, versao: saldo.versao + 1, atualizadoEm: agora });
    const { log } = registrarLogTxCompleto(tx, db, 'caixa', {
      acao: 'entrada',
      tipo: 'limpo',
      valor: v.valor,
      anotacao: `Depósito da venda de ${DROGA.nome}`,
      saldoResultante: novoLimpo,
      usuario: quem,
    });
    tx.set(refPendencia(db, quem.id), {
      usuarioId: quem.id,
      nome: quem.nome,
      devido,
      desde: devido === 0 ? null : pend.desde ?? agora,
      atualizadoEm: agora,
    });
    tx.create(refMovs(db).doc(), { data: agora, usuario: quem, bau: null, tipo: 'deposito', motivo: 'deposito', quantidade: 0, esperado: 0, deposito: v.valor });
    return { dto: { devido }, eventos: [{ tipo: 'caixa.movimento', log }] };
  });
}

/** Estoque de Saco de Meta no baú e a pendência do próprio usuário. */
export async function lerEstadoDroga(tipoCru: unknown, usuarioId: string): Promise<EstadoDrogaDTO> {
  const tipo = exigirTipoBau(tipoCru);
  await garantirCatalogo();
  const db = getDb();
  const [snapBau, snapPend] = await Promise.all([refBau(db, tipo).get(), refPendencia(db, usuarioId).get()]);
  const bau = lerDocBau(snapBau.data());
  return {
    tipo,
    versao: bau.versao,
    estoque: quantidadeNoBau(bau.itens, DROGA.categoriaId, DROGA.itemId),
    minhaPendencia: lerPendenciaDoc(snapPend.data()).devido,
  };
}

export async function listarPendencias(): Promise<PendenciaDTO[]> {
  const db = getDb();
  const res = await db.collection('pendencias').limit(500).get();
  return res.docs
    .map((d) => {
      const x = d.data() as Record<string, unknown>;
      return { usuarioId: d.id, nome: texto(x.nome) || d.id, devido: inteiro(x.devido), desde: typeof x.desde === 'string' ? x.desde : null };
    })
    .filter((p) => p.devido > 0)
    .sort((a, b) => b.devido - a.devido);
}

function somar(mapa: Map<string, { nome: string; valor: number }>, id: string, nome: string, n: number): void {
  if (!id || n <= 0) return;
  const atual = mapa.get(id) ?? { nome, valor: 0 };
  atual.valor += n;
  atual.nome = nome || atual.nome;
  mapa.set(id, atual);
}
function ranking(mapa: Map<string, { nome: string; valor: number }>): LinhaRankingDTO[] {
  return [...mapa.entries()]
    .map(([usuarioId, v]) => ({ usuarioId, nome: v.nome, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP);
}

/** Aba Dados: rankings calculados sobre os últimos registros (limite de leitura) de droga e de caixa. */
export async function lerDados(): Promise<DadosDTO> {
  const db = getDb();
  const [movs, caixa, pendentes] = await Promise.all([
    refMovs(db).orderBy('data', 'desc').limit(LEITURA_MAX).get(),
    refLogs(db, 'caixa').orderBy('data', 'desc').limit(LEITURA_MAX).get(),
    listarPendencias(),
  ]);

  const retDroga = new Map<string, { nome: string; valor: number }>();
  const vendido = new Map<string, { nome: string; valor: number }>();
  const depositado = new Map<string, { nome: string; valor: number }>();
  for (const d of movs.docs) {
    const x = d.data() as Record<string, unknown>;
    const u = (typeof x.usuario === 'object' && x.usuario !== null ? x.usuario : {}) as Record<string, unknown>;
    const id = texto(u.id);
    const nome = texto(u.nome) || id;
    if (x.tipo === 'retirada') {
      somar(retDroga, id, nome, inteiro(x.quantidade));
      somar(vendido, id, nome, inteiro(x.esperado));
    }
    somar(depositado, id, nome, inteiro(x.deposito));
  }

  const depCaixa = new Map<string, { nome: string; valor: number }>();
  const retCaixa = new Map<string, { nome: string; valor: number }>();
  for (const d of caixa.docs) {
    const x = d.data() as Record<string, unknown>;
    const u = (typeof x.usuario === 'object' && x.usuario !== null ? x.usuario : {}) as Record<string, unknown>;
    const id = texto(u.id);
    somar(x.acao === 'entrada' ? depCaixa : retCaixa, id, texto(u.nome) || id, inteiro(x.valor));
  }

  const vendas: LinhaVendaDTO[] = [...vendido.entries()]
    .map(([usuarioId, v]) => {
      const dep = depositado.get(usuarioId)?.valor ?? 0;
      return { usuarioId, nome: v.nome, vendido: v.valor, depositado: dep, falta: Math.max(0, v.valor - dep) };
    })
    .sort((a, b) => b.vendido - a.vendido)
    .slice(0, TOP);

  return {
    amostra: { droga: movs.size, caixa: caixa.size },
    retiradasDroga: ranking(retDroga),
    depositosCaixa: ranking(depCaixa),
    retiradasCaixa: ranking(retCaixa),
    vendas,
    pendentes: pendentes.slice(0, 50),
  };
}
