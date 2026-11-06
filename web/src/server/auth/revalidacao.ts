import 'server-only';
import { REVALIDACAO_MS } from '@/compartilhado/limites';
import type { Sessao } from './sessao';

export function precisaRevalidar(s: Pick<Sessao, 'cv'>, agoraMs: number): boolean {
  return agoraMs - s.cv > REVALIDACAO_MS;
}
