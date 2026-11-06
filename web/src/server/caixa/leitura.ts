import 'server-only';
import type { LogDTO, SaldoDTO } from '@/compartilhado/api-tipos';
import { getDb } from '../firebase';
import { lerDocSaldo, refSaldo } from '../dominio/refs';
import { lerLogs } from '../logs/leitura';
import type { Pagina, Paginacao } from '../paginacao';

export async function lerSaldo(): Promise<SaldoDTO> {
  const snap = await refSaldo(getDb()).get();
  const { sujo, limpo } = lerDocSaldo(snap.data());
  return { sujo, limpo };
}

export async function lerHistoricoCaixa(p: Paginacao): Promise<Pagina<LogDTO>> {
  return await lerLogs('caixa', p);
}
