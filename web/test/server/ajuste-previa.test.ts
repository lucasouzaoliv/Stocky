import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { preverAjuste } from '@/server/bau/ajuste';
import { resetSemente } from '@/server/catalogo/semente';
import type { CategoriaCatalogo } from '@/server/dominio/tipos';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { VALORES_INVALIDOS, seedBase, type ItensBau } from '../helpers/estado';

let fake: FakeFirestore;
function abrir(membros: ItensBau = { armas: { colt: 3 }, medicamentos: { analgesico: 10 } }, extra: Parameters<typeof seedBase>[0] = {}) {
  resetSemente();
  const seed = seedBase({ membros, versao: 7, ...extra });
  if (extra.extra) Object.assign(seed, extra.extra);
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
}
beforeEach(() => abrir());
afterEach(() => {
  resetDb();
  resetSemente();
});

const linha = (categoriaId: string, itemId: string, quantidade: unknown) => ({ categoriaId, itemId, quantidade });
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-040 preverAjuste', () => {
  it('AC1: devolve antes atual, depois pedido e a versão do baú, sem nenhuma escrita', async () => {
    const r = await preverAjuste('membros', [linha('armas', 'colt', 5), linha('medicamentos', 'gaze', 4)]);
    expect(r).toEqual({
      tipo: 'membros',
      versao: 7,
      alterados: 2,
      linhas: [
        { categoriaId: 'armas', itemId: 'colt', nome: 'Colt', antes: 3, depois: 5 },
        { categoriaId: 'medicamentos', itemId: 'gaze', nome: 'Gaze', antes: 0, depois: 4 },
      ],
    });
    expect(escritas()).toEqual([]);
    expect(fake.chamadas.some((c) => c.op === 'get')).toBe(true);
  });

  it('AC1: lê o baú pedido (a gerência tem outro estoque e outra versão)', async () => {
    abrir({}, { gerencia: { armas: { colt: 99 } } });
    const r = await preverAjuste('gerencia', [linha('armas', 'colt', 1)]);
    expect(r).toMatchObject({ tipo: 'gerencia', linhas: [{ antes: 99, depois: 1 }] });
  });

  it('AC2: quantidade 0 é permitida (remove o item)', async () => {
    const r = await preverAjuste('membros', [linha('armas', 'colt', 0)]);
    expect(r.linhas[0]).toMatchObject({ antes: 3, depois: 0 });
    expect(r.alterados).toBe(1);
  });

  it('AC2: 10.000.000 é aceito; 10.000.001, negativo, decimal e texto misturado recusam a prévia inteira listando as linhas', async () => {
    await preverAjuste('membros', [linha('armas', 'colt', 10_000_000), linha('armas', 'usp', '100000')]);
    for (const q of [10_000_001, -1, 1.5, '1,5', '10abc', '1e3', '+5', '', true, null, {}]) {
      const e = await recusa(preverAjuste('membros', [linha('armas', 'colt', 1), linha('armas', 'usp', q), linha('armas', 'ak_47', q)]));
      expect([e.status, e.codigo], String(q)).toEqual([400, 'VALIDACAO']);
      expect(e.detalhes?.linhas?.map((l) => l.indice), String(q)).toEqual([1, 2]);
      expect(e.detalhes?.linhas?.[0]).toMatchObject({ categoriaId: 'armas', itemId: 'usp' });
      expect(e.detalhes!.linhas![0]!.motivo).toMatch(/[a-zà-ú]/i);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC2: todo valor inválido do catálogo de VALORES_INVALIDOS (exceto 0, que aqui vale) é recusado', async () => {
    for (const [nome, v] of VALORES_INVALIDOS) {
      if (v === 0) continue;
      const e = await recusa(preverAjuste('membros', [linha('armas', 'colt', v)]));
      expect(e.status, nome).toBe(400);
    }
  });

  it('AC3: mais de 200 linhas → 400; 200 passam; lista vazia ou não-lista → 400', async () => {
    const itens = [...Array(12)].map((_, i) => linha('materiais', ['laptop', 'pecas_roupas', 'plastico', 'sucata_metal', 'bateria_de_impressora', 'pneu', 'esponjinha', 'caixa_de_ferramentas', 'chave_de_roda', 'chave_de_fenda', 'serra_eletrica', 'pistola_pneumatica'][i]!, 1));
    expect((await preverAjuste('membros', itens)).linhas).toHaveLength(12);
    const repetidas = Array.from({ length: 201 }, () => linha('armas', 'colt', 1));
    expect((await recusa(preverAjuste('membros', repetidas))).status).toBe(400);
    expect((await recusa(preverAjuste('membros', []))).status).toBe(400);
    for (const v of [undefined, null, 'x', {}, 5]) expect((await recusa(preverAjuste('membros', v))).status).toBe(400);
  });

  it('AC3: exatamente 200 linhas distintas é aceito, 201 não', async () => {
    // catálogo grande de teste: 8 categorias de 25 itens
    const grande = Array.from({ length: 8 }, (_, c) => ({
      id: `cat${c}`,
      nome: `Cat ${c}`,
      emoji: 'x',
      itens: Array.from({ length: 25 }, (_, i) => ({ id: `item${i}`, nome: `Item ${i}` })),
    }));
    fake = criarFakeFirestore({ seed: { ...seedBase(), 'config/catalogo': { categorias: grande, atualizadoEm: 'x' } } });
    setDb(comoDb(fake));
    resetSemente();
    const duzentas = grande.flatMap((c) => c.itens.map((i) => linha(c.id, i.id, 1)));
    expect((await preverAjuste('membros', duzentas)).linhas).toHaveLength(200);
    expect((await recusa(preverAjuste('membros', [...duzentas, linha('cat0', 'item0', 1)]))).status).toBe(400);
  });

  it('AC3: item repetido (mesma categoriaId+itemId) → 400 apontando a repetição', async () => {
    const e = await recusa(preverAjuste('membros', [linha('armas', 'colt', 1), linha('armas', 'colt', 2)]));
    expect(e.status).toBe(400);
    expect(e.detalhes?.linhas).toEqual([{ indice: 1, categoriaId: 'armas', itemId: 'colt', motivo: 'Item repetido no ajuste.' }]);
  });

  it('AC4: item ou categoria inexistente → 400 com a linha indicada; ids inseguros também', async () => {
    const e = await recusa(preverAjuste('membros', [linha('armas', 'colt', 1), linha('armas', 'nao_existe', 1), linha('nada', 'colt', 1)]));
    expect(e.status).toBe(400);
    expect(e.detalhes?.linhas?.map((l) => l.indice)).toEqual([1, 2]);
    const e2 = await recusa(preverAjuste('membros', [linha('../x', 'colt', 1), linha('armas', '__proto__', 1), 'texto', null, [1]]));
    expect(e2.detalhes?.linhas?.map((l) => l.indice)).toEqual([0, 1, 2, 3, 4]);
  });

  it('AC4/ordem: reúne linhas inválidas de tipos diferentes em ordem de índice', async () => {
    const e = await recusa(preverAjuste('membros', [linha('armas', 'nao', 1), linha('armas', 'colt', -1), linha('armas', 'usp', 1), linha('armas', 'usp', 1)]));
    expect(e.detalhes?.linhas?.map((l) => l.indice)).toEqual([0, 1, 3]);
  });

  it('AC5/D1: item "#1 Especial: .50" (começa com #, tem : e ponto) funciona porque a entrada é por id', async () => {
    const c = (fake.dump()['config/catalogo'] as { categorias: CategoriaCatalogo[]; atualizadoEm: string });
    c.categorias.find((x) => x.id === 'armas')!.itens.push({ id: '1_especial_50', nome: '#1 Especial: .50' }, { id: 'quebra', nome: 'Linha 1\nLinha 2' });
    fake = criarFakeFirestore({ seed: { ...seedBase({ membros: { armas: { '1_especial_50': 2 } }, versao: 7 }), 'config/catalogo': c } });
    setDb(comoDb(fake));
    resetSemente();
    const r = await preverAjuste('membros', [linha('armas', '1_especial_50', 9), linha('armas', 'quebra', 1)]);
    expect(r.linhas).toEqual([
      { categoriaId: 'armas', itemId: '1_especial_50', nome: '#1 Especial: .50', antes: 2, depois: 9 },
      { categoriaId: 'armas', itemId: 'quebra', nome: 'Linha 1\nLinha 2', antes: 0, depois: 1 },
    ]);
  });

  it('AC6: linhas sem mudança (antes = depois) não contam em alterados, inclusive 0 → 0', async () => {
    const r = await preverAjuste('membros', [linha('armas', 'colt', 3), linha('armas', 'usp', 0), linha('medicamentos', 'analgesico', 11)]);
    expect(r.alterados).toBe(1);
    expect(r.linhas).toHaveLength(3);
  });

  it('tipo de baú inválido → 400', async () => {
    for (const t of ['cofre', '', undefined, 'Membros']) expect((await recusa(preverAjuste(t, [linha('armas', 'colt', 1)]))).status).toBe(400);
    expect(escritas()).toEqual([]);
  });

  it('a versão devolvida acompanha o estoque lido: depois de uma movimentação, a nova prévia traz a nova versão', async () => {
    const a = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
    const doc = fake.dump()['baus/membros'] as { versao: number; itens: ItensBau };
    expect(a.versao).toBe(doc.versao);
    abrir({ armas: { colt: 13 } }, { versao: 8 });
    const b = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
    expect([b.versao, b.linhas[0]!.antes]).toEqual([8, 13]);
  });
});
