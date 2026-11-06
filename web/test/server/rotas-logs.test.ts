import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as AUDITORIA } from '@/app/api/auditoria/route';
import { GET as AUDITORIA_ID } from '@/app/api/auditoria/[id]/route';
import { GET as LOGS_BAU } from '@/app/api/logs/bau/[tipo]/route';
import { GET as LOGS_CAIXA } from '@/app/api/logs/caixa/route';
import * as modAuditoria from '@/app/api/auditoria/route';
import * as modAuditoriaId from '@/app/api/auditoria/[id]/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';

let fake: FakeFirestore;
const dataDe = (i: number) => new Date(Date.UTC(2026, 10, 5, 12, 0, i)).toISOString();
const logBau = (escopo: string, i: number): Dados => ({
  acao: 'adicionar',
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: dataDe(i),
  versao: i,
  categoriaId: 'medicamentos',
  itemId: 'bandagem',
  nomeItem: `Bandagem ${escopo}`,
  nomeCategoria: 'Medicamentos',
  quantidade: i,
  saldoResultante: i,
  resumo: null,
  auditoriaId: null,
});
const logCaixa = (i: number): Dados => ({
  acao: 'entrada',
  tipo: 'sujo',
  valor: i,
  anotacao: 'nota',
  saldoResultante: i,
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: dataDe(i),
});
const aud = (i: number, acao = 'bau.zerar'): Dados => ({
  acao,
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: dataDe(i),
  alvo: { alvos: ['membros'] },
  resumo: `Resumo ${i}`,
  antes: { membros: { medicamentos: { bandagem: i } } },
  depois: {},
});

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  const extra: Record<string, Dados> = {};
  for (let i = 1; i <= 25; i += 1) {
    extra[`logs/membros/entradas/id${String(i).padStart(3, '0')}`] = logBau('membros', i);
    extra[`logs/caixa/entradas/id${String(i).padStart(3, '0')}`] = logCaixa(i);
  }
  for (let i = 1; i <= 3; i += 1) extra[`logs/gerencia/entradas/id${String(i).padStart(3, '0')}`] = logBau('gerencia', i);
  for (let i = 1; i <= 6; i += 1) extra[`auditoria/aud${String(i).padStart(3, '0')}`] = aud(i, i % 2 ? 'bau.zerar' : 'bau.ajuste_massa');
  fake = criarFakeFirestore({ seed: seedBase({ extra }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const logsBau = (tipo: string, perfil: PerfilTeste, query = '') =>
  chamarRota(LOGS_BAU, { caminho: `/api/logs/bau/${tipo}${query}`, params: { tipo }, perfil });
const logsCaixa = (perfil: PerfilTeste, query = '') => chamarRota(LOGS_CAIXA, { caminho: `/api/logs/caixa${query}`, perfil });
const auditoria = (perfil: PerfilTeste, query = '') => chamarRota(AUDITORIA, { caminho: `/api/auditoria${query}`, perfil });
const auditoriaId = (id: string, perfil: PerfilTeste) =>
  chamarRota(AUDITORIA_ID, { caminho: `/api/auditoria/${id}`, params: { id }, perfil });

describe('WEB-045 AC1: nível por rota', () => {
  const quem: Array<[PerfilTeste, string]> = [['anonimo', 'anônimo'], ['adulterado', 'cookie adulterado'], [1, 'membro'], [2, 'gerência'], [3, 'dono']];
  const esperado = (minimo: number) => (p: PerfilTeste) => (typeof p !== 'number' ? 401 : p >= minimo ? 200 : 403);

  for (const [perfil, rotulo] of quem) {
    it(`logs do baú dos membros (${rotulo})`, async () => {
      expect((await logsBau('membros', perfil)).status).toBe(esperado(1)(perfil));
    });
    it(`logs do baú da gerência (${rotulo})`, async () => {
      expect((await logsBau('gerencia', perfil)).status).toBe(esperado(2)(perfil));
    });
    it(`logs do caixa (${rotulo})`, async () => {
      expect((await logsCaixa(perfil)).status).toBe(esperado(2)(perfil));
    });
    it(`lista de auditoria (${rotulo})`, async () => {
      expect((await auditoria(perfil)).status).toBe(esperado(2)(perfil));
    });
    it(`detalhe de auditoria (${rotulo})`, async () => {
      const r = await auditoriaId('aud001', perfil);
      expect(r.status).toBe(esperado(2)(perfil));
    });
  }

  it('membro (nível 1) vê só os logs do baú dos membros: nada da gerência nem do caixa chega a ele', async () => {
    const ok = await logsBau('membros', 1, '?limite=100');
    const itens = (ok.corpo.dados as { itens: Array<{ nomeItem: string }> }).itens;
    expect(itens).toHaveLength(25);
    expect(itens.every((l) => l.nomeItem === 'Bandagem membros')).toBe(true);
    for (const r of [await logsBau('gerencia', 1), await logsCaixa(1), await auditoria(1), await auditoriaId('aud001', 1)]) {
      expect(r.status).toBe(403);
      expect(r.corpo.codigo).toBe('SEM_PERMISSAO');
      expect(JSON.stringify(r.corpo)).not.toContain('gerencia');
    }
  });

  it('nível insuficiente ou sem sessão → nenhuma leitura no Firestore', async () => {
    fake.chamadas.length = 0;
    await logsBau('gerencia', 1);
    await logsBau('gerencia', 'anonimo');
    await logsCaixa(1);
    await logsCaixa('adulterado');
    await auditoria(1);
    await auditoria('anonimo');
    await auditoriaId('aud001', 1);
    expect(fake.chamadas).toHaveLength(0);
  });

  it('a gerência lê os logs da gerência e os do caixa', async () => {
    const g = await logsBau('gerencia', 2);
    expect((g.corpo.dados as { itens: unknown[] }).itens).toHaveLength(3);
    const c = await logsCaixa(2, '?limite=5');
    expect((c.corpo.dados as { itens: unknown[] }).itens).toHaveLength(5);
  });
});

describe('WEB-045 AC2: parâmetros inválidos → 400, sem ler o banco', () => {
  const casos: Array<[string, () => Promise<{ status: number; corpo: { codigo?: string } }>]> = [
    ['logs baú: limite=0', () => logsBau('membros', 3, '?limite=0')],
    ['logs baú: limite=101', () => logsBau('membros', 3, '?limite=101')],
    ['logs baú: limite=abc', () => logsBau('membros', 3, '?limite=abc')],
    ['logs baú: limite=1.5', () => logsBau('membros', 3, '?limite=1.5')],
    ['logs baú: cursor com barra', () => logsBau('membros', 3, '?cursor=abc%2Fdef')],
    ['logs baú: cursor inexistente', () => logsBau('membros', 3, '?cursor=naoexiste')],
    ['logs baú: tipo inexistente', () => logsBau('cofre', 3)],
    ['logs baú: tipo em maiúsculas', () => logsBau('Membros', 3)],
    ['logs caixa: limite=-1', () => logsCaixa(3, '?limite=-1')],
    ['logs caixa: cursor inválido', () => logsCaixa(3, '?cursor=..')],
    ['auditoria: limite=500', () => auditoria(3, '?limite=500')],
    ['auditoria: ação desconhecida', () => auditoria(3, '?acao=bau.apagar')],
    ['auditoria: ação vazia', () => auditoria(3, '?acao=')],
    ['auditoria: cursor inexistente', () => auditoria(3, '?cursor=naoexiste')],
    ['auditoria/[id]: id com barra', () => auditoriaId('a/b', 3)],
    ['auditoria/[id]: id com ponto-ponto', () => auditoriaId('..', 3)],
    ['auditoria/[id]: id longo demais', () => auditoriaId('a'.repeat(41), 3)],
  ];
  for (const [nome, chamar] of casos) {
    it(nome, async () => {
      const r = await chamar();
      expect(r.status).toBe(400);
      expect(r.corpo.codigo).toBe('VALIDACAO');
    });
  }

  it('erros de validação de limite/ação/tipo não chegam a ler o Firestore', async () => {
    fake.chamadas.length = 0;
    await logsBau('membros', 3, '?limite=0');
    await logsBau('cofre', 3);
    await logsCaixa(3, '?limite=101');
    await auditoria(3, '?acao=bau.apagar');
    await auditoriaId('a/b', 3);
    expect(fake.chamadas).toHaveLength(0);
  });
});

describe('WEB-045: respostas', () => {
  it('páginas de 10 pelo cursor devolvido, sem repetir', async () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await logsBau('membros', 1, `?limite=10${cursor ? `&cursor=${cursor}` : ''}`);
      const d = r.corpo.dados as { itens: Array<{ id: string }>; proximoCursor: string | null };
      vistos.push(...d.itens.map((i) => i.id));
      cursor = d.proximoCursor;
    } while (cursor);
    expect(vistos).toHaveLength(25);
    expect(new Set(vistos).size).toBe(25);
  });

  it('auditoria filtra por ação e ordena do mais novo para o mais antigo', async () => {
    const r = await auditoria(2, '?acao=bau.zerar');
    const itens = (r.corpo.dados as { itens: Array<{ id: string; acao: string }> }).itens;
    expect(itens.map((i) => i.id)).toEqual(['aud005', 'aud003', 'aud001']);
    expect(itens.every((i) => i.acao === 'bau.zerar')).toBe(true);
  });

  it('o detalhe traz antes e depois', async () => {
    const r = await auditoriaId('aud003', 2);
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toMatchObject({ id: 'aud003', alvo: { alvos: ['membros'] }, depois: {} });
  });

  it('AC4: id inexistente → 404', async () => {
    const r = await auditoriaId('naoexiste', 2);
    expect(r.status).toBe(404);
    expect(r.corpo.codigo).toBe('NAO_ENCONTRADO');
  });

  it('respostas são no-store e nenhuma leitura escreve', async () => {
    fake.chamadas.length = 0;
    const r = await logsBau('membros', 1);
    expect(r.res.headers.get('cache-control')).toContain('no-store');
    await auditoria(2);
    await auditoriaId('aud001', 2);
    await logsCaixa(2);
    expect(fake.chamadas.filter((c) => c.op !== 'get')).toEqual([]);
  });
});

describe('WEB-045 AC1: auditoria é só leitura', () => {
  it('os módulos de rota exportam GET e nenhum método de escrita', () => {
    for (const mod of [modAuditoria, modAuditoriaId]) {
      const metodos = Object.keys(mod).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k));
      expect(metodos).toEqual(['GET']);
    }
  });
});
