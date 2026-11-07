import { afterEach, describe, expect, it } from 'vitest';
import { atualizarCatalogoParaPadrao } from '@/server/catalogo/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
import { ESTOQUE_INICIAL } from '@/server/catalogo/estoque-inicial';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';

afterEach(() => {
  resetDb();
  resetSemente();
});

const dono = { id: '1', nome: 'Dono', nivel: 3 as const };

describe('atualizarCatalogoParaPadrao', () => {
  it('troca o catálogo e grava nos baús o estoque contado', async () => {
    resetSemente();
    const antigo = { atualizadoEm: 'x', categorias: [{ id: 'armas', nome: 'Armas', emoji: 'x', itens: [{ id: 'colt', nome: 'Colt' }, { id: 'ak_47', nome: 'AK-47' }] }] };
    const fake = criarFakeFirestore({ seed: { ...seedBase({ membros: { armas: { colt: 3, ak_47: 9 } }, versao: 4 }), 'config/catalogo': antigo } });
    setDb(comoDb(fake));
    const r = await atualizarCatalogoParaPadrao(dono);
    expect(r.removidos).toBe(1);
    expect(r.adicionados).toBe(58);
    const d = fake.dump();
    expect((d['config/catalogo'] as { categorias: unknown[] }).categorias).toHaveLength(CATALOGO_PADRAO.length);
    expect(d['baus/membros']).toMatchObject({ versao: 5, itens: ESTOQUE_INICIAL.membros });
    expect(d['baus/gerencia']).toMatchObject({ itens: ESTOQUE_INICIAL.gerencia });
  });

  it('todo item do estoque contado existe no catálogo padrão, na categoria certa, com quantidade válida', () => {
    const ids = new Set(CATALOGO_PADRAO.flatMap((c) => c.itens.map((i) => `${c.id}/${i.id}`)));
    for (const bau of Object.values(ESTOQUE_INICIAL)) {
      for (const [cat, mapa] of Object.entries(bau)) {
        for (const [item, q] of Object.entries(mapa ?? {})) {
          expect(ids.has(`${cat}/${item}`), `${cat}/${item}`).toBe(true);
          expect(Number.isInteger(q) && q > 0 && q <= 10_000_000).toBe(true);
        }
      }
    }
  });

  it('nível 1 (membro) não pode', async () => {
    setDb(comoDb(criarFakeFirestore({ seed: seedBase() })));
    const e = await atualizarCatalogoParaPadrao({ ...dono, nivel: 1 as never }).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(ErroApp);
  });
});
