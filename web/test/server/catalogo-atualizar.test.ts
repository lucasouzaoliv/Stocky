import { afterEach, describe, expect, it } from 'vitest';
import { atualizarCatalogoParaPadrao } from '@/server/catalogo/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
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
  it('troca o catálogo, apaga dos baús o que saiu e mantém o estoque do que continua', async () => {
    resetSemente();
    const antigo = { atualizadoEm: 'x', categorias: [{ id: 'armas', nome: 'Armas', emoji: 'x', itens: [{ id: 'colt', nome: 'Colt' }, { id: 'ak_47', nome: 'AK-47' }] }] };
    const fake = criarFakeFirestore({ seed: { ...seedBase({ membros: { armas: { colt: 3, ak_47: 9 } }, versao: 4 }), 'config/catalogo': antigo } });
    setDb(comoDb(fake));
    const r = await atualizarCatalogoParaPadrao(dono);
    expect(r.removidos).toBe(1);
    expect(r.adicionados).toBe(51);
    const d = fake.dump();
    expect((d['config/catalogo'] as { categorias: unknown[] }).categorias).toHaveLength(CATALOGO_PADRAO.length);
    expect(d['baus/membros']).toMatchObject({ versao: 5, itens: { armas: { colt: 3 } } });
  });

  it('só o dono pode', async () => {
    setDb(comoDb(criarFakeFirestore({ seed: seedBase() })));
    const e = await atualizarCatalogoParaPadrao({ ...dono, nivel: 2 as never }).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(ErroApp);
  });
});
