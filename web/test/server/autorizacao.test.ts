import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARCA_ROTA,
  comAutorizacao,
  nivelDoBau,
  rotaPublica,
  type ContextoRota,
} from '@/server/auth/autorizacao';
import { getDb, setDb } from '@/server/firebase';
import { responderOk } from '@/server/http';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { APP, montarPedido, type PerfilTeste } from '../helpers/pedidos';
import { criarRequisicao } from '../helpers/requisicao';
import { cookieSessaoTeste } from '../helpers/sessao-teste';
import { criarTokenSessao, nomeCookieSessao } from '@/server/auth/sessao';

let fake: FakeFirestore;
const handler = vi.fn();

async function tocarBanco(ctx: ContextoRota<Record<string, string>>): Promise<Response> {
  handler(ctx);
  await getDb().collection('x').doc('y').get();
  return responderOk({ id: ctx.usuario?.id ?? null });
}

beforeEach(() => {
  aplicarEnvTeste();
  fake = criarFakeFirestore();
  setDb(comoDb(fake));
  handler.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  limparEnvTeste();
  resetLimitadores();
});

describe('WEB-022 comAutorizacao', () => {
  it('AC1: sem cookie, cookie adulterado, expirado → 401; o handler e o Firestore não são tocados', async () => {
    const rota = comAutorizacao({ nivel: 1 }, tocarBanco);
    for (const perfil of ['anonimo', 'adulterado'] as PerfilTeste[]) {
      const res = await rota(await montarPedido({ perfil }));
      expect(res.status, String(perfil)).toBe(401);
      expect((await res.json()).codigo).toBe('SEM_SESSAO');
    }
    const velho = await criarTokenSessao({ userId: '444444444444444441', nome: 'T', nivel: 3, ini: Date.now() - 6.9 * 864e5 });
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 864e5 });
    const expirado = await rota(
      criarRequisicao(`${APP}/api/teste`, { cookies: { [nomeCookieSessao()]: velho } }),
    );
    expect(expirado.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC1: sessão que precisa revalidar → 401 REVALIDAR com detalhes {} e nada executa', async () => {
    const rota = comAutorizacao({ nivel: 1 }, tocarBanco);
    const cookies = await cookieSessaoTeste({ nivel: 3 });
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 16 * 60_000 });
    const res = await rota(criarRequisicao(`${APP}/api/teste`, { cookies }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, codigo: 'REVALIDAR', detalhes: {} });
    expect(handler).not.toHaveBeenCalled();
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC1/AC2: tabela nível da sessão × nível exigido', async () => {
    for (const exigido of [1, 2, 3] as const) {
      const rota = comAutorizacao({ nivel: exigido }, tocarBanco);
      for (const nivel of [1, 2, 3] as const) {
        const antes = fake.chamadas.length;
        const res = await rota(await montarPedido({ perfil: nivel }));
        const esperado = nivel >= exigido ? 200 : 403;
        expect(res.status, `nível ${nivel} em rota ${exigido}`).toBe(esperado);
        if (esperado === 403) {
          expect((await res.json()).codigo).toBe('SEM_PERMISSAO');
          expect(fake.chamadas.length).toBe(antes);
        }
      }
    }
  });

  it('AC3: rota de baú — gerencia exige gerente; tipo desconhecido é 400 sem executar', async () => {
    const rota = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async (ctx) => {
      handler(ctx);
      await getDb().collection('x').doc('y').get();
      return responderOk({});
    });
    const com = (perfil: PerfilTeste, tipo: string) =>
      montarPedido({ perfil }).then((r) => rota(r, { params: Promise.resolve({ tipo }) }));
    expect((await com(1, 'membros')).status).toBe(200);
    expect((await com(1, 'gerencia')).status).toBe(403);
    expect((await com(2, 'gerencia')).status).toBe(200);
    handler.mockClear();
    fake.chamadas.length = 0;
    for (const perfil of [1, 3] as const) {
      for (const tipo of ['xyz', '', 'MEMBROS', '__proto__']) {
        const res = await com(perfil, tipo);
        expect(res.status, tipo).toBe(400);
        expect((await res.json()).codigo).toBe('VALIDACAO');
      }
    }
    expect(handler).not.toHaveBeenCalled();
    expect(fake.chamadas).toHaveLength(0);
    expect((await com('anonimo', 'xyz')).status).toBe(401);
    expect(nivelDoBau({ tipo: 'membros' })).toBe(1);
    expect(nivelDoBau({ tipo: 'gerencia' })).toBe(2);
  });

  it('AC4: exceção no handler vira 500 genérico, sem vazar detalhe', async () => {
    const rota = comAutorizacao({ nivel: 1 }, async () => {
      throw new Error('senha=hunter2 em /srv/segredo.ts');
    });
    const res = await rota(await montarPedido({ perfil: 1 }));
    expect(res.status).toBe(500);
    const texto = await res.text();
    expect(JSON.parse(texto)).toEqual({ ok: false, erro: 'Ocorreu um erro. Tente de novo em instantes.', codigo: 'INTERNO' });
    expect(texto).not.toMatch(/hunter2|segredo|stack/);
  });

  it('AC5: o handler recebe id/nome/nível da sessão e nunca o userId do corpo ou da URL', async () => {
    let visto: ContextoRota<Record<string, never>> | undefined;
    const rota = comAutorizacao({ nivel: 1 }, async (ctx) => {
      visto = ctx;
      return responderOk({});
    });
    const req = await montarPedido({
      perfil: 2,
      metodo: 'POST',
      caminho: '/api/teste?userId=999999999999999999&nivel=3',
      corpo: { userId: '999999999999999999', nivel: 3, usuario: { id: '999999999999999999' } },
    });
    expect((await rota(req)).status).toBe(200);
    expect(visto?.usuario).toEqual({ id: '444444444444444441', nome: 'Teste', nivel: 2 });
    expect(visto?.corpo).toMatchObject({ userId: '999999999999999999' });
  });

  it('AC6: a rota exportada carrega a marca com a declaração; fail-closed sem nível', () => {
    const a = comAutorizacao({ nivel: 2 }, tocarBanco);
    expect(a[MARCA_ROTA]).toEqual({ publica: false, nivel: 2, corpoMax: 10_240 });
    expect(comAutorizacao({ nivel: nivelDoBau }, tocarBanco)[MARCA_ROTA]).toMatchObject({ nivel: 'por-parametro' });
    expect(comAutorizacao({ nivel: 'opcional', corpoMax: 5 }, tocarBanco)[MARCA_ROTA]).toMatchObject({ nivel: 'opcional', corpoMax: 5 });
    expect(rotaPublica(async () => new Response())[MARCA_ROTA]).toEqual({ publica: true });
    expect(() => comAutorizacao({} as never, tocarBanco)).toThrow(/nível/);
    expect(() => comAutorizacao({ nivel: 0 as never }, tocarBanco)).toThrow();
    expect(() => comAutorizacao({ nivel: 1, corpoMax: 0 }, tocarBanco)).toThrow();
  });

  it('nível por função inválido (fail-closed) vira 500 sem executar', async () => {
    const rota = comAutorizacao({ nivel: (() => 0) as never }, tocarBanco);
    expect((await rota(await montarPedido({ perfil: 3 }))).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it('mutação: CSRF vem antes do corpo e do handler; corpo grande é 413 e JSON ruim é 400', async () => {
    const rota = comAutorizacao({ nivel: 1, corpoMax: 50 }, tocarBanco);
    const semToken = await rota(await montarPedido({ perfil: 3, metodo: 'POST', csrf: 'ausente' }));
    expect(semToken.status).toBe(403);
    const grande = await rota(await montarPedido({ perfil: 3, metodo: 'POST', corpo: { a: 'x'.repeat(100) } }));
    expect(grande.status).toBe(413);
    const ruim = await montarPedido({ perfil: 3, metodo: 'POST' });
    const reqRuim = new Request(ruim.url, { method: 'POST', headers: ruim.headers, body: '{nao-json' });
    expect((await rota(reqRuim)).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.chamadas).toHaveLength(0);
  });

  it('GET não lê corpo (corpo undefined); DELETE sem corpo passa com token', async () => {
    let corpo: unknown = 'x';
    const rota = comAutorizacao({ nivel: 1 }, async (c) => {
      corpo = c.corpo;
      return responderOk({});
    });
    expect((await rota(await montarPedido({ perfil: 1 }))).status).toBe(200);
    expect(corpo).toBeUndefined();
    const del = await montarPedido({ perfil: 3, metodo: 'DELETE' });
    const semCorpo = new Request(del.url, { method: 'DELETE', headers: (() => { const h = new Headers(del.headers); h.delete('content-type'); return h; })() });
    expect((await rota(semCorpo)).status).toBe(200);
    expect(corpo).toBeUndefined();
  });

  it('opcional: sem sessão segue com usuario null; negados nunca passam de 401/403 nos demais casos', async () => {
    let usuario: unknown = 'x';
    const rota = comAutorizacao({ nivel: 'opcional' }, async (c) => {
      usuario = c.usuario;
      return responderOk({});
    });
    expect((await rota(await montarPedido({ perfil: 'anonimo', metodo: 'POST' }))).status).toBe(200);
    expect(usuario).toBeNull();
    expect((await rota(await montarPedido({ perfil: 'anonimo', metodo: 'POST', origin: null }))).status).toBe(403);
    expect((await rota(await montarPedido({ perfil: 1, metodo: 'POST', csrf: 'errado' }))).status).toBe(403);
    expect((await rota(await montarPedido({ perfil: 1, metodo: 'POST' }))).status).toBe(200);
  });
});

describe('WEB-022 rotaPublica', () => {
  it('executa o handler, converte exceção em 500 genérico e recusa métodos de mutação', async () => {
    const ok = rotaPublica(async () => new Response('oi'));
    expect(await (await ok(criarRequisicao(`${APP}/api/x`))).text()).toBe('oi');
    const ruim = rotaPublica(async () => {
      throw new Error('interno');
    });
    expect((await ruim(criarRequisicao(`${APP}/api/x`))).status).toBe(500);
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await ok(criarRequisicao(`${APP}/api/x`, { metodo }))).status, metodo).toBe(405);
    }
  });
});
