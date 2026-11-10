import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerBau } from '@/server/bau/leitura';
import { lerCatalogo } from '@/server/catalogo/leitura';
import { resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';

let fake: FakeFirestore;
const abrir = (seed?: Parameters<typeof criarFakeFirestore>[0]) => {
  fake = criarFakeFirestore(seed);
  setDb(comoDb(fake));
};
beforeEach(() => resetSemente());
afterEach(() => {
  resetDb();
  resetSemente();
});

const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

describe('WEB-028 lerBau', () => {
  it('AC1: banco vazio devolve todas as categorias vazias, versao 0 e estrutura estável', async () => {
    abrir();
    const bau = await lerBau('membros');
    expect(bau.tipo).toBe('membros');
    expect(bau.versao).toBe(0);
    expect(bau.categorias.map((c) => c.id)).toEqual(['medicamentos', 'armas', 'coletesemuni', 'materiais', 'drogas', 'extras']);
    for (const c of bau.categorias) {
      expect(c.itens).toEqual([]);
      expect(typeof c.nome).toBe('string');
      expect(typeof c.emoji).toBe('string');
    }
    expect(JSON.parse(JSON.stringify(bau))).toEqual(bau);
  });

  it('AC4: a semente do banco vazio é transacional e é a única escrita; a segunda leitura não escreve', async () => {
    abrir();
    await lerBau('gerencia');
    expect(escritas().length).toBeGreaterThan(0);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    const antes = fake.chamadas.length;
    await lerBau('gerencia');
    expect(fake.chamadas.slice(antes).filter((c) => c.op !== 'get')).toEqual([]);
  });

  it('AC4: com o banco já semeado, ler não escreve nada e não altera o dump', async () => {
    abrir({ seed: seedBase({ membros: { armas: { desert: 2 } } }) });
    const antes = fake.dump();
    await lerBau('membros');
    expect(escritas()).toEqual([]);
    expect(fake.dump()).toEqual(antes);
  });

  it('AC2: itens aparecem na categoria certa, com nome do catálogo, quantidade e versao do baú; cada baú é separado', async () => {
    abrir({
      seed: seedBase({
        membros: { armas: { desert: 3 }, medicamentos: { analgesico: 10, gaze: 4 } },
        gerencia: { drogas: { lsd: 9 } },
        versao: 7,
      }),
    });
    const m = await lerBau('membros');
    expect(m.versao).toBe(7);
    expect(m.categorias.find((c) => c.id === 'armas')!.itens).toEqual([{ id: 'desert', nome: 'Desert Eagle', quantidade: 3 }]);
    expect(m.categorias.find((c) => c.id === 'medicamentos')!.itens).toEqual([
      { id: 'analgesico', nome: 'Analgésico', quantidade: 10 },
      { id: 'gaze', nome: 'Gaze', quantidade: 4 },
    ]);
    expect(m.categorias.find((c) => c.id === 'drogas')!.itens).toEqual([]);
    const g = await lerBau('gerencia');
    expect(g.categorias.find((c) => c.id === 'drogas')!.itens).toEqual([{ id: 'lsd', nome: 'LSD', quantidade: 9 }]);
  });

  it('AC2: item que saiu do catálogo aparece como "Item removido" e não quebra; quantidade inválida no banco é ignorada', async () => {
    abrir({ seed: seedBase({ membros: { armas: { desert: 1, fantasma: 5, zero: 0, negativo: -3, quebrado: 1.5 } } }) });
    const armas = (await lerBau('membros')).categorias.find((c) => c.id === 'armas')!;
    expect(armas.itens).toEqual([
      { id: 'desert', nome: 'Desert Eagle', quantidade: 1 },
      { id: 'fantasma', nome: 'Item removido', quantidade: 5 },
    ]);
  });

  it('AC3: tipo inválido → ErroApp 400, sem tocar o banco', async () => {
    abrir();
    for (const tipo of ['', 'Membros', 'ambos', '../x', undefined, 3, null]) {
      const e = await lerBau(tipo).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErroApp);
      expect((e as ErroApp).status).toBe(400);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC5: categorias na ordem do catálogo; itens por nome (pt-BR, acento) e id como desempate', async () => {
    abrir({
      seed: seedBase({
        membros: { cat_b: { zebra: 1, agata: 2, abelha: 3, outro: 4, outro_b: 5 }, cat_a: { x: 1 } },
        extra: {
          'config/catalogo': {
            atualizadoEm: 'x',
            categorias: [
              { id: 'cat_b', nome: 'B', emoji: '🅱️', itens: [{ id: 'zebra', nome: 'Zebra' }, { id: 'agata', nome: 'Ágata' }, { id: 'abelha', nome: 'Abelha' }, { id: 'outro', nome: 'Igual' }, { id: 'outro_b', nome: 'Igual' }] },
              { id: 'cat_a', nome: 'A', emoji: '🅰️', itens: [{ id: 'x', nome: 'X' }] },
            ],
          },
        },
      }),
    });
    const bau = await lerBau('membros');
    expect(bau.categorias.map((c) => c.id)).toEqual(['cat_b', 'cat_a']);
    expect(bau.categorias[0]!.itens.map((i) => i.id)).toEqual(['abelha', 'agata', 'outro', 'outro_b', 'zebra']);
    expect(await lerBau('membros')).toEqual(bau);
  });
});

describe('WEB-028 lerCatalogo', () => {
  it('devolve categorias, itens e total; semeia o banco vazio', async () => {
    abrir();
    const c = await lerCatalogo();
    expect(c.categorias).toHaveLength(6);
    expect(c.categorias.reduce((n, x) => n + x.total, 0)).toBe(60);
    for (const cat of c.categorias) expect(cat.total).toBe(cat.itens.length);
    expect(c.categorias[0]).toMatchObject({ id: 'medicamentos', nome: 'Medicamentos', emoji: '💊' });
    expect(c.categorias[0]!.itens[0]).toEqual({ id: 'gaze', nome: 'Gaze' });
  });

  it('não escreve com o banco já semeado', async () => {
    abrir({ seed: seedBase() });
    await lerCatalogo();
    expect(escritas()).toEqual([]);
  });
});
