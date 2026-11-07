import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';
import type { CategoriaCatalogo } from '@/server/dominio/tipos';
import { falharCommitDaOperacao } from './commit-falho';

let fake: FakeFirestore;
beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros: { medicamentos: { analgesico: 10 } }, gerencia: { medicamentos: { analgesico: 5 } } }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const itens = (cat: string) => (fake.dump()['config/catalogo'] as { categorias: CategoriaCatalogo[] }).categorias.find((c) => c.id === cat)!.itens;
const estoque = (t: string) => (fake.dump()[`baus/${t}`] as { itens: ItensBau }).itens;
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

const adicionar = (perfil: PerfilTeste, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  chamarRota(ADICIONAR, { metodo: 'POST', caminho: '/api/catalogo/itens', perfil, corpo, ...extra });
const remover = (perfil: PerfilTeste, categoriaId = 'medicamentos', itemId = 'analgesico', extra: Record<string, unknown> = {}) =>
  chamarRota(REMOVER, { metodo: 'DELETE', caminho: `/api/catalogo/itens/${categoriaId}/${itemId}`, params: { categoriaId, itemId }, perfil, corpo: undefined, ...extra });

describe('WEB-037 POST /api/catalogo/itens (nível 2)', () => {
  it('AC1: anônimo 401, adulterado 401, nível 1 → 403 sem tocar o banco', async () => {
    for (const [perfil, esperado] of [['anonimo', 401], ['adulterado', 401], [1, 403]] as const) {
      const r = await adicionar(perfil, { categoriaId: 'armas', nome: 'Faca' });
      expect(r.status, String(perfil)).toBe(esperado);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC1a: a gerência (nível 2) PODE adicionar item; o dono também → 201 com { categoriaId, item }', async () => {
    for (const [nivel, nome, id] of [[2, 'Faca', 'faca'], [3, 'Machado', 'machado']] as const) {
      const r = await adicionar(nivel, { categoriaId: 'armas', nome });
      expect(r.status).toBe(201);
      expect(r.corpo).toEqual({ ok: true, dados: { categoriaId: 'armas', item: { id, nome } } });
    }
    expect(itens('armas').map((i) => i.id)).toEqual(expect.arrayContaining(['faca', 'machado']));
    expect(auditorias(fake.dump())).toHaveLength(2);
  });

  it('AC1: sem CSRF ou com token errado → 403 e nada gravado', async () => {
    for (const csrf of ['ausente', 'errado'] as const) {
      const r = await adicionar(2, { categoriaId: 'armas', nome: 'Faca' }, { csrf });
      expect([r.status, r.corpo.codigo]).toEqual([403, 'CSRF']);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC2: corpo inválido → 400 em português, sem zod cru e sem escrita', async () => {
    const invalidos: unknown[] = [
      {}, null, 'x', [], { categoriaId: 'armas' }, { nome: 'Faca' },
      { categoriaId: 'armas', nome: 5 }, { categoriaId: 'armas', nome: null },
      { categoriaId: 5, nome: 'Faca' }, { categoriaId: '../x', nome: 'Faca' }, { categoriaId: '__proto__', nome: 'Faca' },
      { categoriaId: 'armas', nome: 'Faca', nivel: 3 }, { categoriaId: 'armas', nome: 'Faca', usuario: { id: '1' } },
      { categoriaId: 'armas', nome: '' }, { categoriaId: 'armas', nome: '!!!' }, { categoriaId: 'armas', nome: 'a'.repeat(51) },
    ];
    for (const corpo of invalidos) {
      const r = await adicionar(2, corpo);
      expect([r.status, r.corpo.codigo], JSON.stringify(corpo)).toEqual([400, 'VALIDACAO']);
      expect(r.corpo.erro).not.toMatch(/zod|expected|invalid_type|undefined/i);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC2: categoria inexistente → 404; duplicado → 409 DUPLICADO; 26º item → 409 LIMITE_CATEGORIA', async () => {
    expect((await adicionar(2, { categoriaId: 'nada', nome: 'Faca' })).status).toBe(404);
    const dup = await adicionar(2, { categoriaId: 'medicamentos', nome: 'GAZE' });
    expect([dup.status, dup.corpo.codigo]).toEqual([409, 'DUPLICADO']);
    for (let i = 0; i < 19; i++) expect((await adicionar(2, { categoriaId: 'drogas', nome: `D${i}` })).status).toBe(201);
    const lim = await adicionar(2, { categoriaId: 'drogas', nome: 'D-extra' });
    expect([lim.status, lim.corpo.codigo]).toEqual([409, 'LIMITE_CATEGORIA']);
    expect(itens('drogas')).toHaveLength(25);
  });

  it('o usuário da auditoria vem da sessão', async () => {
    await adicionar(2, { categoriaId: 'armas', nome: 'Faca' }, { userId: '555555555555555551' });
    expect(auditorias(fake.dump())[0]!.usuario).toMatchObject({ id: '555555555555555551' });
  });

  it('corpo acima de 10 KB → 413', async () => {
    const r = await adicionar(2, { categoriaId: 'armas', nome: 'Faca', lixo: 'a'.repeat(11_000) });
    expect([r.status, r.corpo.codigo]).toEqual([413, 'CORPO_GRANDE']);
    expect(escritas()).toEqual([]);
  });

  it('falha do Firestore não vaza detalhe', async () => {
    const provar = await falharCommitDaOperacao(fake, new Error('PERMISSION_DENIED projects/segredo stack at x (/var/task/y.js:1:1)'));
    const r = await adicionar(2, { categoriaId: 'armas', nome: 'Faca' });
    provar();
    expect([r.status, r.corpo.codigo]).toEqual([500, 'INTERNO']);
    expect(r.texto).not.toMatch(/PERMISSION_DENIED|segredo|\/var\/task/);
  });
});

describe('WEB-037 DELETE /api/catalogo/itens/[categoriaId]/[itemId] (nível 3, só o dono)', () => {
  it('AC1a: gerência (nível 2) → 403, nível 1 → 403, anônimo e adulterado → 401; nada tocado', async () => {
    const antes = fake.dump();
    for (const [perfil, esperado] of [[2, 403], [1, 403], ['anonimo', 401], ['adulterado', 401]] as const) {
      fake.chamadas.length = 0;
      const r = await remover(perfil);
      expect(r.status, String(perfil)).toBe(esperado);
      expect(fake.chamadas, String(perfil)).toHaveLength(0);
    }
    expect(fake.dump()).toEqual(antes);
    expect(itens('medicamentos').some((i) => i.id === 'analgesico')).toBe(true);
    expect(estoque('membros').medicamentos!.analgesico).toBe(10);
    expect(auditorias(fake.dump())).toHaveLength(0);
  });

  it('AC1a: o corpo do 403 da gerência é genérico (SEM_PERMISSAO) e não revela o item', async () => {
    const r = await remover(2);
    expect(r.corpo).toMatchObject({ ok: false, codigo: 'SEM_PERMISSAO' });
    expect(r.texto).not.toMatch(/analgesico/i);
  });

  it('AC1a: o dono (nível 3) com CSRF correto remove → 200 com { item, removidoDe, auditoriaId }', async () => {
    const r = await remover(3);
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toMatchObject({ item: { id: 'analgesico', nome: 'Analgésico' }, removidoDe: { membros: 10, gerencia: 5 } });
    expect(itens('medicamentos').some((i) => i.id === 'analgesico')).toBe(false);
    expect(estoque('membros')).toEqual({});
    expect(estoque('gerencia')).toEqual({});
    const [a] = auditorias(fake.dump());
    expect(a).toMatchObject({ acao: 'catalogo.remover_item', usuario: { id: USUARIO.id } });
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(1);
  });

  it('AC1: dono sem CSRF ou com token errado → 403 CSRF e nada gravado', async () => {
    const antes = fake.dump();
    for (const csrf of ['ausente', 'errado'] as const) {
      const r = await remover(3, 'medicamentos', 'analgesico', { csrf });
      expect([r.status, r.corpo.codigo]).toEqual([403, 'CSRF']);
    }
    expect(fake.dump()).toEqual(antes);
    expect(escritas()).toEqual([]);
  });

  it('AC1: dono sem Origin → 403', async () => {
    const r = await remover(3, 'medicamentos', 'analgesico', { origin: null });
    expect(r.status).toBe(403);
    expect(escritas()).toEqual([]);
  });

  it('AC2: item ou categoria inexistente → 404 e nada gravado', async () => {
    for (const [c, i] of [['medicamentos', 'nao_existe'], ['nada', 'analgesico']] as const) {
      expect((await remover(3, c, i)).status).toBe(404);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC3: parâmetros de caminho com formato inseguro (.., %2F, __proto__, maiúsculas, longo) → 400 sem escrita', async () => {
    for (const [c, i] of [
      ['..', 'analgesico'], ['medicamentos', '..'], ['medicamentos', '%2F'], ['medicamentos', 'a/b'], ['medicamentos', '../analgesico'],
      ['__proto__', 'x'], ['medicamentos', '__proto__'], ['Medicamentos', 'analgesico'], ['medicamentos', 'a'.repeat(51)], ['medicamentos', 'a%2Fb'],
    ] as const) {
      const r = await remover(3, c, i, {});
      expect([r.status, r.corpo.codigo], `${c}/${i}`).toEqual([400, 'VALIDACAO']);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC4: remover duas vezes o mesmo item → 200 e depois 404, uma única auditoria', async () => {
    expect((await remover(3)).status).toBe(200);
    expect((await remover(3)).status).toBe(404);
    expect(auditorias(fake.dump())).toHaveLength(1);
  });

  it('falha no commit → 500 genérico e catálogo, baús e auditoria intactos', async () => {
    const antes = fake.dump();
    const provar = await falharCommitDaOperacao(fake, new Error('falha secreta'));
    const r = await remover(3);
    provar();
    expect([r.status, r.corpo.codigo]).toEqual([500, 'INTERNO']);
    expect(fake.dump()).toEqual(antes);
    expect(r.texto).not.toMatch(/secreta/);
  });
});

describe('WEB-037 métodos exportados', () => {
  it('as rotas do catálogo só exportam POST e DELETE respectivamente', async () => {
    const a = await import('@/app/api/catalogo/itens/route');
    const b = await import('@/app/api/catalogo/itens/[categoriaId]/[itemId]/route');
    const m = (x: object) => Object.keys(x).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k));
    expect([m(a), m(b)]).toEqual([['POST'], ['DELETE']]);
  });
});
