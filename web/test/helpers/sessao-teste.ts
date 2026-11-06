import { nomeCookieSessao, criarTokenSessao } from '@/server/auth/sessao';
import type { NivelAcesso } from '@/server/dominio/tipos';

export async function tokenSessaoTeste(
  o: { userId?: string; nome?: string; nivel?: NivelAcesso; ini?: number } = {},
): Promise<string> {
  return await criarTokenSessao({
    userId: o.userId ?? '444444444444444441',
    nome: o.nome ?? 'Teste',
    nivel: o.nivel ?? 1,
    ini: o.ini,
  });
}

export async function cookieSessaoTeste(o: Parameters<typeof tokenSessaoTeste>[0] = {}): Promise<Record<string, string>> {
  return { [nomeCookieSessao()]: await tokenSessaoTeste(o) };
}
