import { afterEach, describe, expect, it } from 'vitest';
import { adicionarAoBau } from '@/server/bau/operacoes';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { lerLogs } from '@/server/logs/leitura';
import { lerPaginacao } from '@/server/paginacao';
import { resetSemente } from '@/server/catalogo/semente';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, seedBase } from '../helpers/estado';

let fake: FakeFirestore;
const abrir = (seed: Record<string, Dados> = {}) => {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
};
afterEach(() => {
  resetDb();
  resetSemente();
});

const idDe = (i: number) => `id${String(i).padStart(3, '0')}`;
const dataDe = (i: number) => new Date(Date.UTC(2026, 10, 5, 12, 0, i)).toISOString();

const logBau = (i: number, extra: Dados = {}): Dados => ({
  acao: 'adicionar',
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: dataDe(i),
  versao: i,
  categoriaId: 'medicamentos',
  itemId: 'bandagem',
  nomeItem: 'Bandagem',
  nomeCategoria: 'Medicamentos',
  quantidade: i,
  saldoResultante: i * 2,
  resumo: null,
  auditoriaId: null,
  ...extra,
});

const seedLogs = (escopo: string, n: number, fabrica: (i: number) => Dados = logBau): Record<string, Dados> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [`logs/${escopo}/entradas/${idDe(k + 1)}`, fabrica(k + 1)]));

const pag = (limite = 20, cursor: string | null = null) => ({ limite, cursor });

describe('WEB-043 AC1: ordem decrescente e paginação por cursor', () => {
  it('30 entradas em páginas de 10: três páginas, sem repetir nem pular, da mais nova para a mais antiga', async () => {
    abrir(seedLogs('membros', 30));
    const vistos: string[] = [];
    let cursor: string | null = null;
    const tamanhos: number[] = [];
    for (let pagina = 0; pagina < 5; pagina += 1) {
      const r = await lerLogs('membros', pag(10, cursor));
      tamanhos.push(r.itens.length);
      vistos.push(...r.itens.map((l) => l.id));
      cursor = r.proximoCursor;
      if (cursor === null) break;
    }
    expect(tamanhos).toEqual([10, 10, 10]);
    expect(vistos).toHaveLength(30);
    expect(new Set(vistos).size).toBe(30);
    expect(vistos).toEqual(Array.from({ length: 30 }, (_, k) => idDe(30 - k)));
  });

  it('última página cheia não inventa uma próxima; a lista vazia devolve itens vazios e cursor nulo', async () => {
    abrir(seedLogs('membros', 10));
    const r = await lerLogs('membros', pag(10));
    expect(r.itens).toHaveLength(10);
    expect(r.proximoCursor).toBeNull();
    abrir();
    expect(await lerLogs('caixa', pag())).toEqual({ itens: [], proximoCursor: null });
  });

  it('entradas inseridas durante a leitura (mais novas) não repetem nem pulam as páginas seguintes', async () => {
    abrir(seedLogs('membros', 30));
    const p1 = await lerLogs('membros', pag(10));
    fake = criarFakeFirestore({ seed: { ...fake.dump(), [`logs/membros/entradas/${idDe(31)}`]: logBau(31) } });
    setDb(comoDb(fake));
    const p2 = await lerLogs('membros', pag(10, p1.proximoCursor));
    expect(p2.itens.map((l) => l.id)).toEqual(Array.from({ length: 10 }, (_, k) => idDe(20 - k)));
  });

  it('cursor inexistente ou malformado é 400 (VALIDACAO)', async () => {
    abrir(seedLogs('membros', 3));
    await expect(lerLogs('membros', pag(10, 'naoexiste'))).rejects.toMatchObject({ codigo: 'VALIDACAO', status: 400 });
    expect(() => lerPaginacao(new URLSearchParams('cursor=abc/def'))).toThrow(ErroApp);
  });
});

describe('WEB-043 AC2: limite de 1 a 100 é recusado fora da faixa (comportamento fixo)', () => {
  it.each(['0', '-1', '101', '1.5', 'abc', ''])('limite=%s → 400', (v) => {
    expect(() => lerPaginacao(new URLSearchParams({ limite: v }))).toThrowError(expect.objectContaining({ codigo: 'VALIDACAO' }));
  });
  it.each([['1', 1], ['100', 100]])('limite=%s é aceito', (v, esperado) => {
    expect(lerPaginacao(new URLSearchParams({ limite: v })).limite).toBe(esperado);
  });
  it('sem limite usa 20', async () => {
    abrir(seedLogs('membros', 25));
    const p = lerPaginacao(new URLSearchParams());
    expect((await lerLogs('membros', p)).itens).toHaveLength(20);
  });
});

describe('WEB-043 AC3: nome gravado no log, não o do catálogo atual', () => {
  it('item que saiu do catálogo continua com o nome da época', async () => {
    abrir({
      ...seedBase(),
      ...seedLogs('membros', 1, () => logBau(1, { itemId: 'item_antigo', nomeItem: 'Item Antigo', nomeCategoria: 'Categoria Velha' })),
    });
    const [log] = (await lerLogs('membros', pag())).itens;
    expect(log).toMatchObject({ itemId: 'item_antigo', nomeItem: 'Item Antigo', nomeCategoria: 'Categoria Velha' });
  });

  it('renomear o catálogo depois não muda o log já gravado', async () => {
    abrir(seedBase({ membros: {} }));
    await adicionarAoBau({ tipo: 'membros', categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 3 }, USUARIO);
    const dump = fake.dump();
    const catalogo = dump['config/catalogo'] as { categorias: Array<{ itens: Array<{ id: string; nome: string }> }> };
    catalogo.categorias[0]!.itens[0]!.nome = 'Nome Novo';
    abrir(dump);
    const [log] = (await lerLogs('membros', pag())).itens;
    expect(log).toMatchObject({ nomeItem: 'Bandagem' });
  });
});

describe('WEB-043 AC4: campos de cada entrada', () => {
  it('log de baú traz usuário (id e nome), ação, item, quantidade e data ISO', async () => {
    abrir(seedLogs('gerencia', 1));
    const [log] = (await lerLogs('gerencia', pag())).itens;
    expect(log).toEqual({
      id: idDe(1),
      acao: 'adicionar',
      usuario: { id: 'u1', nome: 'Nome 1' },
      data: dataDe(1),
      versao: 1,
      categoriaId: 'medicamentos',
      itemId: 'bandagem',
      nomeItem: 'Bandagem',
      nomeCategoria: 'Medicamentos',
      quantidade: 1,
      saldoResultante: 2,
      resumo: null,
      auditoriaId: null,
    });
    expect(new Date(log!.data).toISOString()).toBe(log!.data);
  });

  it('log de zerar/ajuste traz resumo e liga à auditoria; campos de item ficam nulos', async () => {
    abrir(
      seedLogs('membros', 1, () =>
        logBau(1, { acao: 'zerar', categoriaId: null, itemId: null, nomeItem: null, nomeCategoria: null, quantidade: null, saldoResultante: null, resumo: 'Baú zerado: 2 itens, 5 unidades.', auditoriaId: 'aud1' }),
      ),
    );
    const [log] = (await lerLogs('membros', pag())).itens;
    expect(log).toMatchObject({ acao: 'zerar', nomeItem: null, quantidade: null, resumo: 'Baú zerado: 2 itens, 5 unidades.', auditoriaId: 'aud1' });
  });

  it('log do caixa traz tipo, valor, anotação e saldo resultante', async () => {
    abrir(
      seedLogs('caixa', 1, (i) => ({
        acao: 'saida',
        tipo: 'limpo',
        valor: 50,
        anotacao: 'compra',
        saldoResultante: 950,
        usuario: { id: `u${i}`, nome: 'Fulano' },
        data: dataDe(i),
      })),
    );
    const [log] = (await lerLogs('caixa', pag())).itens;
    expect(log).toEqual({ id: idDe(1), acao: 'saida', tipo: 'limpo', valor: 50, anotacao: 'compra', saldoResultante: 950, usuario: { id: 'u1', nome: 'Fulano' }, data: dataDe(1) });
  });

  it('documento sem campos não quebra a leitura (valores neutros)', async () => {
    abrir({ 'logs/membros/entradas/id001': { data: dataDe(1) } });
    const [log] = (await lerLogs('membros', pag())).itens;
    expect(log).toMatchObject({ id: 'id001', usuario: { id: '', nome: '' }, nomeItem: null, quantidade: null });
  });
});

describe('WEB-043 escopo e somente leitura', () => {
  it('cada escopo lê só a própria subcoleção', async () => {
    abrir({ ...seedLogs('membros', 2), ...Object.fromEntries(Object.entries(seedLogs('gerencia', 3)).map(([c, d]) => [c, d])) });
    expect((await lerLogs('membros', pag())).itens).toHaveLength(2);
    expect((await lerLogs('gerencia', pag())).itens).toHaveLength(3);
    expect((await lerLogs('caixa', pag())).itens).toHaveLength(0);
  });

  it('escopo inválido é 400 e não toca o banco', async () => {
    abrir(seedLogs('membros', 1));
    for (const e of ['auditoria', '..', 'Membros', undefined, 42]) {
      await expect(lerLogs(e, pag())).rejects.toMatchObject({ codigo: 'VALIDACAO' });
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('ler nunca escreve', async () => {
    abrir(seedLogs('membros', 15));
    await lerLogs('membros', pag(5));
    expect(fake.chamadas.filter((c) => c.op !== 'get')).toEqual([]);
  });
});
