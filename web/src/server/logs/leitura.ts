import 'server-only';
import type { LogDTO } from '@/compartilhado/api-tipos';
import { getDb } from '../firebase';
import { exigirEscopoLog, refLogs } from '../dominio/refs';
import type { AcaoCaixa, AcaoLogBau, TipoCaixa } from '../dominio/tipos';
import { lerPaginaPorData, type Pagina, type Paginacao } from '../paginacao';

type Dados = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function usuarioDe(d: Dados): { id: string; nome: string } {
  const u = (typeof d.usuario === 'object' && d.usuario !== null ? d.usuario : {}) as { id?: unknown; nome?: unknown };
  return { id: texto(u.id), nome: texto(u.nome) };
}

function paraLogCaixa(id: string, d: Dados): LogDTO {
  return {
    id,
    acao: d.acao as AcaoCaixa,
    tipo: d.tipo as TipoCaixa,
    valor: Number(d.valor),
    anotacao: texto(d.anotacao),
    saldoResultante: Number(d.saldoResultante),
    usuario: usuarioDe(d),
    data: texto(d.data),
  };
}

/** Os nomes de item e de categoria vêm do que foi gravado no log: não dependem do catálogo atual (WEB-043 AC3). */
function paraLogBau(id: string, d: Dados): LogDTO {
  return {
    id,
    acao: d.acao as AcaoLogBau,
    usuario: usuarioDe(d),
    data: texto(d.data),
    versao: numeroOuNulo(d.versao) ?? 0,
    categoriaId: textoOuNulo(d.categoriaId),
    itemId: textoOuNulo(d.itemId),
    nomeItem: textoOuNulo(d.nomeItem),
    nomeCategoria: textoOuNulo(d.nomeCategoria),
    quantidade: numeroOuNulo(d.quantidade),
    saldoResultante: numeroOuNulo(d.saldoResultante),
    resumo: textoOuNulo(d.resumo),
    auditoriaId: textoOuNulo(d.auditoriaId),
  };
}

/** Logs de um escopo (`membros`, `gerencia` ou `caixa`), mais novos primeiro, com cursor. Somente leitura. */
export async function lerLogs(escopo: unknown, p: Paginacao): Promise<Pagina<LogDTO>> {
  const e = exigirEscopoLog(escopo);
  return await lerPaginaPorData(refLogs(getDb(), e), p, e === 'caixa' ? paraLogCaixa : paraLogBau);
}
