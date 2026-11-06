import 'server-only';
import type { LogDTO, SaldoDTO } from '@/compartilhado/api-tipos';
import { getDb } from '../firebase';
import { lerDocSaldo, refLogs, refSaldo } from '../dominio/refs';
import type { AcaoCaixa, TipoCaixa } from '../dominio/tipos';
import { lerPaginaPorData, type Pagina, type Paginacao } from '../paginacao';

export async function lerSaldo(): Promise<SaldoDTO> {
  const snap = await refSaldo(getDb()).get();
  const { sujo, limpo } = lerDocSaldo(snap.data());
  return { sujo, limpo };
}

function paraLogCaixa(id: string, d: Record<string, unknown>): LogDTO {
  const u = (d.usuario ?? {}) as { id?: unknown; nome?: unknown };
  return {
    id,
    acao: d.acao as AcaoCaixa,
    tipo: d.tipo as TipoCaixa,
    valor: Number(d.valor),
    anotacao: String(d.anotacao ?? ''),
    saldoResultante: Number(d.saldoResultante),
    usuario: { id: String(u.id ?? ''), nome: String(u.nome ?? '') },
    data: String(d.data ?? ''),
  };
}

export async function lerHistoricoCaixa(p: Paginacao): Promise<Pagina<LogDTO>> {
  return await lerPaginaPorData(refLogs(getDb(), 'caixa'), p, paraLogCaixa);
}
