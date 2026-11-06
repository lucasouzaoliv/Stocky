import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetContexto, setFetch } from '@/server/contexto';
import { obterMembro, trocarCodigo } from '@/server/discord/api';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarFakeFetch, respostaJson } from '../helpers/fake-fetch';

let espiao: Array<{ mock: { calls: unknown[][] } }>;
const saidas = () => espiao.flatMap((s) => s.mock.calls.map((c: unknown[]) => c.join(' '))).join('\n');

beforeEach(() => {
  aplicarEnvTeste();
  espiao = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')].map((s) =>
    s.mockImplementation(() => undefined),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  resetContexto();
  limparEnvTeste();
});

const membroOk = {
  user: { id: '444444444444444441', username: 'fulano', global_name: 'Fulano G', avatar: 'abc' },
  nick: null,
  roles: ['333333333333333331'],
};

describe('WEB-017 cliente Discord', () => {
  it('AC1: troca de código envia form-urlencoded com grant_type, code, redirect_uri e credenciais', async () => {
    const f = criarFakeFetch(() => respostaJson({ access_token: 'token-falso-abc', token_type: 'Bearer' }));
    setFetch(f.fetch);
    expect(await trocarCodigo('codigo-falso')).toEqual({ accessToken: 'token-falso-abc' });
    const [c] = f.chamadas;
    expect(c!.url).toBe('https://discord.com/api/v10/oauth2/token');
    expect(c!.metodo).toBe('POST');
    expect(c!.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    const corpo = new URLSearchParams(c!.corpo);
    expect(Object.fromEntries(corpo)).toEqual({
      grant_type: 'authorization_code',
      code: 'codigo-falso',
      redirect_uri: 'https://stocky-teste.vercel.app/api/auth/callback',
      client_id: ENV_TESTE.DISCORD_CLIENT_ID,
      client_secret: ENV_TESTE.DISCORD_CLIENT_SECRET,
    });
    expect(c!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('AC2: obterMembro devolve userId, roles, nome (global_name) e avatar, com Bearer e guild do env', async () => {
    const f = criarFakeFetch(() => respostaJson(membroOk));
    setFetch(f.fetch);
    expect(await obterMembro('tok')).toEqual({
      tipo: 'membro',
      userId: '444444444444444441',
      roles: ['333333333333333331'],
      nome: 'Fulano G',
      avatar: 'abc',
    });
    expect(f.chamadas[0]!.url).toBe(`https://discord.com/api/v10/users/@me/guilds/${ENV_TESTE.DISCORD_GUILD_ID}/member`);
    expect(f.chamadas[0]!.headers.get('authorization')).toBe('Bearer tok');
    expect(f.chamadas[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('nome: nick vence, depois global_name, depois username; limite de 32 caracteres', async () => {
    const com = async (m: object) => {
      setFetch(criarFakeFetch(() => respostaJson({ ...membroOk, ...m })).fetch);
      return ((await obterMembro('t')) as { nome: string }).nome;
    };
    expect(await com({ nick: 'Apelido' })).toBe('Apelido');
    expect(await com({ nick: '  ', user: { id: '1', username: 'u' } })).toBe('u');
    expect(await com({ nick: 'x'.repeat(40) })).toHaveLength(32);
  });

  it('AC2: 404 vira naoMembro, não erro', async () => {
    setFetch(criarFakeFetch(() => respostaJson({ code: 10007, message: 'Unknown Member' }, 404)).fetch);
    expect(await obterMembro('tok')).toEqual({ tipo: 'naoMembro' });
  });

  it('AC3: 4xx, 5xx, JSON inválido, forma inesperada, timeout e rede caída viram ErroApp INTERNO genérico', async () => {
    const cenarios: Array<() => Response | Error> = [
      () => respostaJson({ error: 'invalid_grant' }, 400),
      () => respostaJson({ message: '401: Unauthorized' }, 401),
      () => respostaJson({}, 500),
      () => new Response('<html>nao json', { status: 200 }),
      () => respostaJson({ user: { id: 1 }, roles: 'x' }),
      () => respostaJson({ user: { id: '1' }, roles: [1] }),
      () => respostaJson(['lista']),
      () => new DOMException('timeout', 'TimeoutError'),
      () => new TypeError('fetch failed'),
    ];
    for (const c of cenarios) {
      setFetch(criarFakeFetch(() => c()).fetch);
      await expect(obterMembro('tok-secreto-xyz')).rejects.toMatchObject({ codigo: 'INTERNO', status: 500 });
      await expect(trocarCodigo('codigo-secreto-xyz')).rejects.toMatchObject({ codigo: 'INTERNO' });
    }
  });

  it('AC3/AC4: erro nunca repete corpo do Discord, código nem token (mensagem e log)', async () => {
    setFetch(criarFakeFetch(() => respostaJson({ error: 'CORPO-SECRETO-DISCORD', access_token: 'tok-vazado' }, 400)).fetch);
    const erro = await trocarCodigo('codigo-secreto-xyz').catch((e: Error) => e);
    expect(String(erro)).not.toMatch(/CORPO-SECRETO|codigo-secreto|tok-vazado/);
    setFetch(criarFakeFetch(() => new Error('falha com tok-secreto-xyz e codigo-secreto-xyz')).fetch);
    await trocarCodigo('codigo-secreto-xyz').catch(() => undefined);
    await obterMembro('tok-secreto-xyz').catch(() => undefined);
    const log = saidas();
    expect(log).not.toMatch(/tok-secreto-xyz|codigo-secreto-xyz|CORPO-SECRETO|tok-vazado/);
    expect(log).not.toContain(ENV_TESTE.DISCORD_CLIENT_SECRET!);
  });

  it('token resposta sem access_token é erro', async () => {
    setFetch(criarFakeFetch(() => respostaJson({ token_type: 'Bearer' })).fetch);
    await expect(trocarCodigo('c')).rejects.toMatchObject({ codigo: 'INTERNO' });
  });
});
