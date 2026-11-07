import { afterEach, describe, expect, it } from 'vitest';
import { exigirAcaoAuditoria, lerAuditoria, lerAuditoriaPorId } from '@/server/auditoria/leitura';
import { resetDb, setDb } from '@/server/firebase';
import { zerarBau } from '@/server/bau/zerar';
import { resetSemente } from '@/server/catalogo/semente';
import { RAIZ_WEB, lerJson } from '../helpers/arquivos';
import { join } from 'node:path';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { DONO, seedBase, type ItensBau } from '../helpers/estado';

let fake: FakeFirestore;
const abrir = (seed: Record<string, Dados> = {}) => {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
};
afterEach(() => {
  resetDb();
  resetSemente();
});

const ACOES = ['catalogo.adicionar_item', 'catalogo.remover_item', 'bau.zerar', 'bau.ajuste_massa'] as const;
const idDe = (i: number) => `aud${String(i).padStart(3, '0')}`;
const dataDe = (i: number) => new Date(Date.UTC(2026, 10, 5, 12, 0, i)).toISOString();
const doc = (i: number, extra: Dados = {}): Dados => ({
  acao: ACOES[i % 4],
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: dataDe(i),
  alvo: { tipo: 'membros' },
  resumo: `Resumo ${i}`,
  antes: { medicamentos: { analgesico: i } },
  depois: {},
  ...extra,
});
const seedAud = (n: number): Record<string, Dados> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [`auditoria/${idDe(k + 1)}`, doc(k + 1)]));
const pag = (acao: (typeof ACOES)[number] | null = null, limite = 20, cursor: string | null = null) => ({ limite, cursor, acao });

describe('WEB-044 AC1: lista com usuário, data, ação e resumo; detalhe com alvo, antes e depois', () => {
  it('a lista devolve as quatro ações com usuario, data e resumo, sem antes/depois', async () => {
    abrir(seedAud(4));
    const r = await lerAuditoria(pag());
    expect(r.itens.map((a) => a.acao).sort()).toEqual([...ACOES].sort());
    for (const a of r.itens) {
      expect(Object.keys(a).sort()).toEqual(['acao', 'data', 'id', 'resumo', 'usuario']);
      expect(a.usuario.id).toMatch(/^u\d$/);
    }
  });

  it('o detalhe por id traz alvo, antes e depois', async () => {
    abrir(seedAud(2));
    const d = await lerAuditoriaPorId(idDe(2));
    expect(d).toEqual({
      id: idDe(2),
      acao: ACOES[2],
      usuario: { id: 'u2', nome: 'Nome 2' },
      data: dataDe(2),
      resumo: 'Resumo 2',
      alvo: { tipo: 'membros' },
      antes: { medicamentos: { analgesico: 2 } },
      depois: {},
    });
  });

  it('id inexistente é 404 e id malformado é 400 sem tocar o banco', async () => {
    abrir(seedAud(1));
    await expect(lerAuditoriaPorId('semregistro')).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO', status: 404 });
    fake.chamadas.length = 0;
    for (const id of ['a/b', '..', '', 'a'.repeat(41), undefined, 7]) {
      await expect(lerAuditoriaPorId(id)).rejects.toMatchObject({ codigo: 'VALIDACAO' });
    }
    expect(fake.chamadas).toHaveLength(0);
  });
});

describe('WEB-044 AC2: filtro por ação', () => {
  it.each(ACOES)('filtra por %s', async (acao) => {
    abrir(seedAud(12));
    const r = await lerAuditoria(pag(acao));
    expect(r.itens).toHaveLength(3);
    expect(r.itens.every((a) => a.acao === acao)).toBe(true);
  });

  it('ação desconhecida é 400 e nunca chega ao banco', async () => {
    abrir(seedAud(3));
    for (const v of ['bau.apagar', 'BAU.ZERAR', '', ' bau.zerar', 'catalogo.*', '__proto__']) {
      expect(() => exigirAcaoAuditoria(v), v).toThrowError(expect.objectContaining({ codigo: 'VALIDACAO', status: 400 }));
      await expect(lerAuditoria({ limite: 5, cursor: null, acao: v as never })).rejects.toMatchObject({ codigo: 'VALIDACAO' });
    }
    expect(fake.chamadas).toHaveLength(0);
    expect(exigirAcaoAuditoria(null)).toBeNull();
  });

  it('o filtro pagina por cursor sem repetir nem pular', async () => {
    abrir(seedAud(40));
    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await lerAuditoria(pag('bau.zerar', 4, cursor));
      vistos.push(...r.itens.map((a) => a.id));
      cursor = r.proximoCursor;
    } while (cursor);
    expect(vistos).toHaveLength(10);
    expect(new Set(vistos).size).toBe(10);
    expect(vistos.every((id) => doc(Number(id.slice(3))).acao === 'bau.zerar')).toBe(true);
  });
});

describe('WEB-044 AC3: ordem decrescente e paginação estável', () => {
  it('30 registros em páginas de 10, do mais novo para o mais antigo', async () => {
    abrir(seedAud(30));
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const r = await lerAuditoria(pag(null, 10, cursor));
      vistos.push(...r.itens.map((a) => a.id));
      cursor = r.proximoCursor;
      paginas += 1;
    } while (cursor);
    expect(paginas).toBe(3);
    expect(vistos).toEqual(Array.from({ length: 30 }, (_, k) => idDe(30 - k)));
  });

  it('cursor inexistente é 400', async () => {
    abrir(seedAud(3));
    await expect(lerAuditoria(pag(null, 5, 'naoexiste'))).rejects.toMatchObject({ codigo: 'VALIDACAO' });
  });
});

describe('WEB-044 AC4: auditoria gigante não quebra a lista', () => {
  it('zerar com 150 itens: a lista traz só o resumo curto e o detalhe traz o conteúdo completo', async () => {
    const itens: ItensBau = {};
    const categorias = Array.from({ length: 6 }, (_, c) => ({
      id: `cat${c + 1}`,
      nome: `Categoria ${c + 1}`,
      emoji: '📦',
      itens: Array.from({ length: 25 }, (_, i) => ({ id: `item${i + 1}`, nome: `Item ${i + 1}` })),
    }));
    for (const cat of categorias) itens[cat.id] = Object.fromEntries(cat.itens.map((i, n) => [i.id, n + 1]));
    abrir(seedBase({ membros: itens, extra: { 'config/catalogo': { categorias, atualizadoEm: dataDe(0) } } }));
    const { auditoriaId } = await zerarBau('membros', DONO);

    const lista = await lerAuditoria(pag());
    const resumo = lista.itens.find((a) => a.id === auditoriaId)!;
    expect(resumo.resumo.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(lista).length).toBeLessThan(1000);
    expect('antes' in resumo).toBe(false);

    const detalhe = await lerAuditoriaPorId(auditoriaId);
    const antes = detalhe.antes as { membros: Record<string, Record<string, number>> };
    expect(Object.values(antes.membros).reduce((s, c) => s + Object.keys(c).length, 0)).toBe(150);
    expect(detalhe.depois).toEqual({});
  });
});

describe('ADR-18: índice composto da auditoria filtrada', () => {
  const indices = lerJson<{ indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order: string }> }> }>(
    join(RAIZ_WEB, 'firestore.indexes.json'),
  ).indexes;

  it('firestore.indexes.json declara auditoria: acao ASC, data DESC', () => {
    const achou = indices.some(
      (i) =>
        i.collectionGroup === 'auditoria' &&
        i.queryScope === 'COLLECTION' &&
        JSON.stringify(i.fields) === JSON.stringify([{ fieldPath: 'acao', order: 'ASCENDING' }, { fieldPath: 'data', order: 'DESCENDING' }]),
    );
    expect(achou).toBe(true);
  });

  it('a consulta com filtro não ordena no banco, então não exige índice composto (a ordem é feita no servidor)', async () => {
    abrir(seedAud(8));
    await lerAuditoria(pag('bau.zerar'));
    const comFiltro = fake.consultas.filter((c) => c.filtros.length > 0);
    expect(comFiltro).toHaveLength(1);
    for (const c of comFiltro) expect(c.ordem).toEqual([]);
  });

  it('sem filtro a consulta é de campo único (sem índice composto)', async () => {
    abrir(seedAud(3));
    await lerAuditoria(pag(null));
    expect(fake.consultas.every((c) => c.filtros.length === 0)).toBe(true);
  });
});
