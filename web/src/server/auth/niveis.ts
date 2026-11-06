import 'server-only';
import type { Nivel } from '../dominio/tipos';
import type { Env } from '../env';

export function nivelDeCargos(roles: unknown, cargos: Env['discord']['cargos']): Nivel {
  if (!Array.isArray(roles)) return 0;
  const meus = new Set(roles.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim()));
  const tem = (lista: readonly string[]) => lista.some((id) => id !== '' && meus.has(id));
  if (tem(cargos.dono)) return 3;
  if (tem(cargos.gerente)) return 2;
  if (tem(cargos.membro)) return 1;
  return 0;
}
