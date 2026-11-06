import 'server-only';
import type { AuditoriaDetalheDTO, AuditoriaResumoDTO } from '@/compartilhado/api-tipos';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { refAuditoria } from '../dominio/refs';
import type { AcaoAuditoria } from '../dominio/tipos';
import { lerPaginaPorData, type Pagina, type Paginacao } from '../paginacao';
import { ehIdDocumento } from '../validacao/item';

export const ACOES_AUDITORIA: readonly AcaoAuditoria[] = [
  'catalogo.adicionar_item',
  'catalogo.remover_item',
  'bau.zerar',
  'bau.ajuste_massa',
];

/** `null` (sem filtro) passa; ação desconhecida é 400 e nunca chega à consulta. */
export function exigirAcaoAuditoria(v: string | null): AcaoAuditoria | null {
  if (v === null) return null;
  const acao = ACOES_AUDITORIA.find((a) => a === v);
  if (!acao) throw new ErroApp('VALIDACAO', 'Ação de auditoria inválida.');
  return acao;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

function resumoDe(id: string, d: Record<string, unknown>): AuditoriaResumoDTO {
  const u = (typeof d.usuario === 'object' && d.usuario !== null ? d.usuario : {}) as { id?: unknown; nome?: unknown };
  return {
    id,
    acao: d.acao as AcaoAuditoria,
    usuario: { id: texto(u.id), nome: texto(u.nome) },
    data: texto(d.data),
    resumo: texto(d.resumo),
  };
}

/**
 * Lista só o resumo (nunca `antes`/`depois`, que podem ser enormes). O filtro por ação usa
 * o índice composto `acao ASC, data DESC` de `firestore.indexes.json` (ADR-18).
 */
export async function lerAuditoria(p: Paginacao & { acao: AcaoAuditoria | null }): Promise<Pagina<AuditoriaResumoDTO>> {
  const acao = exigirAcaoAuditoria(p.acao);
  return await lerPaginaPorData(
    refAuditoria(getDb()),
    { limite: p.limite, cursor: p.cursor },
    resumoDe,
    acao ? { campo: 'acao', valor: acao } : undefined,
  );
}

export async function lerAuditoriaPorId(id: unknown): Promise<AuditoriaDetalheDTO> {
  if (!ehIdDocumento(id)) throw new ErroApp('VALIDACAO', 'Identificador inválido.');
  const snap = await refAuditoria(getDb()).doc(id).get();
  if (!snap.exists) throw new ErroApp('NAO_ENCONTRADO', 'Registro de auditoria não encontrado.');
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return { ...resumoDe(snap.id, d), alvo: d.alvo ?? null, antes: d.antes ?? null, depois: d.depois ?? null };
}
