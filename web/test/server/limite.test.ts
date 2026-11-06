import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as callback } from '@/app/api/auth/callback/route';
import { GET as login } from '@/app/api/auth/login/route';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { responderOk } from '@/server/http';
import {
  LIMITE_IP_AUTH,
  LIMITE_USUARIO,
  criarLimitadorMemoria,
  ipDaRequisicao,
  resetLimitadores,
  setLimitador,
} from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { APP, montarPedido } from '../helpers/pedidos';
import { criarRequisicao } from '../helpers/requisicao';

beforeEach(() => aplicarEnvTeste());
afterEach(() => {
  vi.useRealTimers();
  limparEnvTeste();
});

describe('WEB-024 limitador em memória', () => {
  it('padrões: 60/min por usuário e 10/min por IP nas rotas de auth', () => {
    expect(LIMITE_USUARIO).toEqual({ max: 60, janelaMs: 60_000 });
    expect(LIMITE_IP_AUTH).toEqual({ max: 10, janelaMs: 60_000 });
  });

  it('AC1: a requisição N+1 é negada com retryAfterS ≥ 1; N e janela são configuráveis', () => {
    const l = criarLimitadorMemoria({ max: 3, janelaMs: 10_000 });
    for (let i = 0; i < 3; i++) expect(l.consumir('a', 1000 + i)).toEqual({ ok: true });
    expect(l.consumir('a', 1500)).toEqual({ ok: false, retryAfterS: 10 });
    expect(l.consumir('a', 10_500)).toEqual({ ok: false, retryAfterS: 1 });
  });

  it('AC2: chaves independentes', () => {
    const l = criarLimitadorMemoria({ max: 1, janelaMs: 1000 });
    expect(l.consumir('a', 0).ok).toBe(true);
    expect(l.consumir('a', 1).ok).toBe(false);
    expect(l.consumir('b', 1).ok).toBe(true);
  });

  it('AC3: passada a janela o acesso volta (janela deslizante)', () => {
    const l = criarLimitadorMemoria({ max: 2, janelaMs: 1000 });
    l.consumir('a', 0);
    l.consumir('a', 600);
    expect(l.consumir('a', 900).ok).toBe(false);
    expect(l.consumir('a', 1001).ok).toBe(true);
    expect(l.consumir('a', 1002).ok).toBe(false);
  });

  it('negadas não prolongam o bloqueio', () => {
    const l = criarLimitadorMemoria({ max: 1, janelaMs: 1000 });
    l.consumir('a', 0);
    for (let t = 1; t < 900; t += 100) l.consumir('a', t);
    expect(l.consumir('a', 1001).ok).toBe(true);
  });

  it('rejeita configuração inválida e não cresce sem limite de chaves', () => {
    expect(() => criarLimitadorMemoria({ max: 0, janelaMs: 1000 })).toThrow();
    expect(() => criarLimitadorMemoria({ max: 1, janelaMs: 1.5 })).toThrow();
    const l = criarLimitadorMemoria({ max: 1, janelaMs: 1000 });
    for (let i = 0; i < 10_050; i++) l.consumir(`k${i}`, 0);
    expect(l.consumir('novo', 5000).ok).toBe(true);
  });

  it('ipDaRequisicao usa o primeiro x-forwarded-for; sem ele ou inválido, "desconhecido"', () => {
    const com = (v?: string) => criarRequisicao(`${APP}/x`, { headers: v ? { 'x-forwarded-for': v } : {} });
    expect(ipDaRequisicao(com('1.2.3.4, 9.9.9.9'))).toBe('1.2.3.4');
    expect(ipDaRequisicao(com())).toBe('desconhecido');
    expect(ipDaRequisicao(com('x'.repeat(100)))).toBe('desconhecido');
  });
});

describe('WEB-024 limite nas rotas protegidas', () => {
  const chamadas = vi.fn();
  const rota = comAutorizacao({ nivel: 1 }, async () => {
    chamadas();
    return responderOk({});
  });
  beforeEach(() => {
    chamadas.mockClear();
    resetLimitadores();
    setLimitador('usuario', criarLimitadorMemoria({ max: 3, janelaMs: 60_000 }));
  });
  afterEach(() => resetLimitadores());

  it('AC1/AC4: acima do limite devolve 429 com Retry-After e o handler não roda', async () => {
    for (let i = 0; i < 3; i++) expect((await rota(await montarPedido({ perfil: 1 }))).status).toBe(200);
    const res = await rota(await montarPedido({ perfil: 1 }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    const corpo = await res.json();
    expect(corpo).toMatchObject({ ok: false, codigo: 'LIMITE_REQUISICOES' });
    expect(corpo.detalhes.retryAfter).toBeGreaterThanOrEqual(1);
    expect(chamadas).toHaveBeenCalledTimes(3);
  });

  it('AC2: o usuário A estourar não afeta o usuário B', async () => {
    for (let i = 0; i < 4; i++) await rota(await montarPedido({ perfil: 1, userId: '555555555555555551' }));
    expect((await rota(await montarPedido({ perfil: 1, userId: '555555555555555551' }))).status).toBe(429);
    expect((await rota(await montarPedido({ perfil: 1, userId: '555555555555555552' }))).status).toBe(200);
  });

  it('AC3: passada a janela (relógio simulado) o acesso volta', async () => {
    resetLimitadores();
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const pedido = () => montarPedido({ perfil: 1 });
    for (let i = 0; i < 60; i++) expect((await rota(await pedido())).status).toBe(200);
    expect((await rota(await pedido())).status).toBe(429);
    vi.setSystemTime(Date.now() + 61_000);
    expect((await rota(await pedido())).status).toBe(200);
  });

  it('AC5: a chave vem da sessão; x-forwarded-for forjado não escapa nem pune outro usuário', async () => {
    for (let i = 0; i < 3; i++) {
      await rota(await montarPedido({ perfil: 1, headers: { 'x-forwarded-for': `10.0.0.${i}` } }));
    }
    const res = await rota(await montarPedido({ perfil: 1, headers: { 'x-forwarded-for': '10.9.9.9' } }));
    expect(res.status).toBe(429);
    const outro = await rota(
      await montarPedido({ perfil: 1, userId: '555555555555555559', headers: { 'x-forwarded-for': '10.0.0.0' } }),
    );
    expect(outro.status).toBe(200);
  });

  it('sem sessão a requisição é recusada (401) antes de consumir limite', async () => {
    for (let i = 0; i < 10; i++) expect((await rota(await montarPedido({ perfil: 'anonimo' }))).status).toBe(401);
    expect((await rota(await montarPedido({ perfil: 1 }))).status).toBe(200);
  });
});

describe('WEB-024 limite por IP em login e callback', () => {
  beforeEach(() => resetLimitadores());

  it('AC1: 11ª chamada ao login do mesmo IP dá 429; outro IP segue; callback tem balde próprio', async () => {
    const de = (ip: string, caminho = '/api/auth/login') =>
      criarRequisicao(`${APP}${caminho}`, { headers: { 'x-forwarded-for': ip } });
    for (let i = 0; i < 10; i++) expect((await login(de('1.1.1.1'))).status).toBe(307);
    const bloqueada = await login(de('1.1.1.1'));
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get('retry-after')).toBeTruthy();
    expect(bloqueada.headers.getSetCookie()).toHaveLength(0);
    expect((await login(de('2.2.2.2'))).status).toBe(307);
    expect((await callback(de('1.1.1.1', '/api/auth/callback'))).status).toBe(307);
  });

  it('rotaPublica só aceita GET: POST dá 405 sem executar nada', async () => {
    const res = await login(criarRequisicao(`${APP}/api/auth/login`, { metodo: 'POST', corpo: {} }));
    expect(res.status).toBe(405);
    expect((await res.json()).codigo).toBe('METODO');
  });
});
