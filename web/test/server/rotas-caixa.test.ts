import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as SALDO } from '@/app/api/caixa/route';
import { GET as HISTORICO } from '@/app/api/caixa/historico/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, logsDe, seedBase } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';

let fake: FakeFirestore;
beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ saldo: { sujo: 1000, limpo: 500 } }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const corpoOk = (extra: Record<string, unknown> = {}) => ({ tipo: 'sujo', acao: 'entrada', valor: 100, anotacao: 'venda', ...extra });
const saldo = () => fake.dump()['caixa/saldo'] as { sujo: number; limpo: number; versao: number };
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

const ver = (perfil: PerfilTeste) => chamarRota(SALDO, { caminho: '/api/caixa', perfil });
const hist = (perfil: PerfilTeste, query = '') => chamarRota(HISTORICO, { caminho: `/api/caixa/historico${query}`, perfil });
const mover = (perfil: PerfilTeste, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  chamarRota(MOVIMENTAR, { metodo: 'POST', caminho: '/api/caixa/movimentar', perfil, corpo, ...extra });

describe('WEB-034 AC1: todas exigem nível 2, sem tocar o banco quando negadas', () => {
  const todas: Array<[string, (p: PerfilTeste) => Promise<{ status: number }>]> = [
    ['GET /api/caixa', ver],
    ['GET /api/caixa/historico', (p) => hist(p)],
    ['POST /api/caixa/movimentar', (p) => mover(p, corpoOk())],
  ];
  for (const [nome, chamar] of todas) {
    for (const [perfil, esperado] of [['anonimo', 401], ['adulterado', 401], [1, 403], [2, 200], [3, 200]] as Array<[PerfilTeste, number]>) {
      it(`${nome} perfil=${String(perfil)} → ${esperado}`, async () => {
        const { status } = await chamar(perfil);
        expect(status).toBe(esperado);
        if (esperado !== 200) expect(fake.chamadas).toHaveLength(0);
      });
    }
  }
});

describe('WEB-034 AC2: CSRF na mutação', () => {
  it('sem token ou com token errado → 403 e nada gravado', async () => {
    const antes = fake.dump();
    for (const csrf of ['ausente', 'errado'] as const) {
      const { status, corpo } = await mover(2, corpoOk(), { csrf });
      expect(status).toBe(403);
      expect(corpo.codigo).toBe('CSRF');
    }
    expect((await mover(2, corpoOk(), { origin: 'https://evil.example' })).status).toBe(403);
    expect(fake.dump()).toEqual(antes);
  });

  it('Content-Type diferente de JSON → 415', async () => {
    expect((await mover(2, corpoOk(), { headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect(escritas()).toEqual([]);
  });
});

describe('WEB-034 GET /api/caixa', () => {
  it('devolve só o saldo, sem escrever', async () => {
    const { corpo } = await ver(2);
    expect(corpo).toEqual({ ok: true, dados: { sujo: 1000, limpo: 500 } });
    expect(escritas()).toEqual([]);
  });

  it('banco sem documento de saldo → 0 e 0', async () => {
    fake = criarFakeFirestore();
    setDb(comoDb(fake));
    expect((await ver(2)).corpo.dados).toEqual({ sujo: 0, limpo: 0 });
  });
});

describe('WEB-034 AC3: POST /api/caixa/movimentar', () => {
  it('sucesso devolve o saldo novo e grava o log com o usuário da sessão', async () => {
    const { status, corpo } = await mover(2, corpoOk({ valor: 250, anotacao: '  venda de colete ' }));
    expect(status).toBe(200);
    expect(corpo).toEqual({ ok: true, dados: { sujo: 1250, limpo: 500 } });
    expect(saldo().sujo).toBe(1250);
    const [log] = logsDe(fake.dump(), 'caixa');
    expect(log).toMatchObject({ acao: 'entrada', tipo: 'sujo', valor: 250, anotacao: 'venda de colete', saldoResultante: 1250 });
    expect(log!.usuario).toEqual({ id: USUARIO.id, nome: 'Teste' });
  });

  it('saída do tipo limpo não altera o sujo', async () => {
    expect((await mover(2, corpoOk({ tipo: 'limpo', acao: 'saida', valor: 500 }))).corpo.dados).toEqual({ sujo: 1000, limpo: 0 });
  });

  it('saldo insuficiente → 409 com o disponível; nada gravado', async () => {
    const antes = fake.dump();
    const { status, corpo } = await mover(2, corpoOk({ acao: 'saida', valor: 1001 }));
    expect(status).toBe(409);
    expect(corpo).toMatchObject({ ok: false, codigo: 'SALDO_INSUFICIENTE', erro: 'Saldo insuficiente. Disponível: $1.000.' });
    expect(fake.dump()).toEqual(antes);
  });

  const invalidos: Array<[string, unknown]> = [
    ['campo extra', corpoOk({ usuario: 'x' })],
    ['sem valor', { tipo: 'sujo', acao: 'entrada', anotacao: 'a' }],
    ['sem anotação', { tipo: 'sujo', acao: 'entrada', valor: 1 }],
    ['sem tipo', { acao: 'entrada', valor: 1, anotacao: 'a' }],
    ['tipo inexistente', corpoOk({ tipo: 'cripto' })],
    ['ação inexistente', corpoOk({ acao: 'transferir' })],
    ['tipo numérico', corpoOk({ tipo: 1 })],
    ['valor 0', corpoOk({ valor: 0 })],
    ['valor negativo', corpoOk({ valor: -1 })],
    ['valor decimal', corpoOk({ valor: 1.5 })],
    ['valor "1.000,50"', corpoOk({ valor: '1.000,50' })],
    ['valor acima do máximo', corpoOk({ valor: 1_000_000_001 })],
    ['valor nulo', corpoOk({ valor: null })],
    ['anotação vazia', corpoOk({ anotacao: '' })],
    ['anotação só espaços', corpoOk({ anotacao: '    ' })],
    ['anotação longa demais', corpoOk({ anotacao: 'a'.repeat(101) })],
    ['anotação não texto', corpoOk({ anotacao: 5 })],
    ['corpo lista', [corpoOk()]],
    ['corpo nulo', null],
  ];
  for (const [nome, corpo] of invalidos) {
    it(`corpo inválido: ${nome} → 400 em português e nada gravado`, async () => {
      const antes = fake.dump();
      const { status, corpo: resp } = await mover(2, corpo);
      expect(status).toBe(400);
      expect(resp).toMatchObject({ ok: false, codigo: 'VALIDACAO' });
      expect(resp.erro).not.toMatch(/zod|expected|invalid_type|undefined/i);
      expect(fake.dump()).toEqual(antes);
    });
  }

  it('corpo acima de 10 KB → 413', async () => {
    const { status } = await mover(2, corpoOk({ lixo: 'a'.repeat(11_000) }));
    expect(status).toBe(413);
    expect(escritas()).toEqual([]);
  });

  it('duas saídas simultâneas que juntas excedem o saldo: uma 200 e uma 409', async () => {
    const r = await Promise.all([
      mover(2, corpoOk({ acao: 'saida', valor: 700 })),
      mover(3, corpoOk({ acao: 'saida', valor: 700 })),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(saldo().sujo).toBe(300);
  });

  it('falha do Firestore vira 500 genérico, sem stack nem texto da exceção', async () => {
    fake.falharProximoCommit(new Error('PERMISSION_DENIED projects/segredo stack at x (/var/task/a.js:1:1)'));
    const { status, texto, corpo } = await mover(2, corpoOk());
    expect(status).toBe(500);
    expect(corpo.codigo).toBe('INTERNO');
    expect(texto).not.toMatch(/PERMISSION_DENIED|segredo|stack|\/var\/task/);
  });
});

describe('WEB-034 GET /api/caixa/historico', () => {
  const semear = () => {
    const seed = seedBase({ saldo: { sujo: 0 } });
    for (let i = 1; i <= 5; i += 1) {
      seed[`logs/caixa/entradas/id${i}`] = {
        acao: 'entrada', tipo: 'sujo', valor: i, anotacao: `n${i}`, saldoResultante: i,
        usuario: { id: 'u', nome: 'U' }, data: new Date(Date.UTC(2026, 10, 5, 10, i)).toISOString(),
      };
    }
    fake = criarFakeFirestore({ seed });
    setDb(comoDb(fake));
  };

  it('devolve a página mais nova primeiro, com cursor para a próxima', async () => {
    semear();
    const p1 = await hist(2, '?limite=2');
    expect(p1.status).toBe(200);
    const d1 = p1.corpo.dados as { itens: Array<{ id: string }>; proximoCursor: string };
    expect(d1.itens.map((i) => i.id)).toEqual(['id5', 'id4']);
    const p2 = await hist(2, `?limite=2&cursor=${d1.proximoCursor}`);
    expect((p2.corpo.dados as { itens: Array<{ id: string }> }).itens.map((i) => i.id)).toEqual(['id3', 'id2']);
    expect(escritas()).toEqual([]);
  });

  it('AC4: limite e cursor inválidos → 400, sem ler o histórico', async () => {
    semear();
    for (const q of ['?limite=abc', '?limite=0', '?limite=101', '?limite=-1', '?limite=', '?limite=1.5', '?cursor=a%2Fb', '?cursor=naoexiste']) {
      const { status, corpo } = await hist(2, q);
      expect(status, q).toBe(400);
      expect(corpo.codigo).toBe('VALIDACAO');
    }
  });

  it('um histórico gigante sem parâmetros devolve no máximo 20 por padrão', async () => {
    const seed = seedBase();
    for (let i = 1; i <= 30; i += 1) {
      seed[`logs/caixa/entradas/x${String(i).padStart(2, '0')}`] = {
        acao: 'entrada', tipo: 'sujo', valor: 1, anotacao: 'a', saldoResultante: 1,
        usuario: { id: 'u', nome: 'U' }, data: new Date(Date.UTC(2026, 10, 5, 10, i)).toISOString(),
      };
    }
    fake = criarFakeFirestore({ seed });
    setDb(comoDb(fake));
    const d = (await hist(2)).corpo.dados as { itens: unknown[]; proximoCursor: string | null };
    expect(d.itens).toHaveLength(20);
    expect(d.proximoCursor).not.toBeNull();
  });
});

describe('WEB-034 métodos', () => {
  it('as rotas só exportam os métodos do contrato', async () => {
    const modulos = await Promise.all([
      import('@/app/api/caixa/route'),
      import('@/app/api/caixa/historico/route'),
      import('@/app/api/caixa/movimentar/route'),
    ]);
    const exportados = modulos.map((m) => Object.keys(m).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)));
    expect(exportados).toEqual([['GET'], ['GET'], ['POST']]);
  });
});
