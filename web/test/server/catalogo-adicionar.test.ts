import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adicionarItemAoCatalogo } from '@/server/catalogo/operacoes';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import type { CategoriaCatalogo } from '@/server/dominio/tipos';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, auditorias, seedBase } from '../helpers/estado';

let fake: FakeFirestore;
function abrir(seed: Parameters<typeof seedBase>[0] = {}) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase(seed) });
  setDb(comoDb(fake));
}
beforeEach(() => abrir());
afterEach(() => {
  resetDb();
  resetSemente();
});

const categorias = () => (fake.dump()['config/catalogo'] as { categorias: CategoriaCatalogo[] }).categorias;
const itensDe = (id: string) => categorias().find((c) => c.id === id)!.itens;
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-035 adicionarItemAoCatalogo', () => {
  it('AC1: nome válido cria o item com id gerado e devolve { categoriaId, item }', async () => {
    const r = await adicionarItemAoCatalogo('armas', '  Faca   de Cozinha ', USUARIO);
    expect(r).toEqual({ categoriaId: 'armas', item: { id: 'faca_de_cozinha', nome: 'Faca de Cozinha' } });
    expect(itensDe('armas').at(-1)).toEqual({ id: 'faca_de_cozinha', nome: 'Faca de Cozinha' });
    expect(itensDe('armas').some((i) => i.id === 'colt')).toBe(true);
  });

  it('AC2: "!!!", "", espaços, não-texto e 51 caracteres → 400 sem escrita', async () => {
    for (const nome of ['!!!', '', '   ', 5, null, undefined, 'a'.repeat(51)]) {
      const e = await recusa(adicionarItemAoCatalogo('armas', nome, USUARIO));
      expect(e.status, String(nome)).toBe(400);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC2: 50 caracteres é aceito; categoria inexistente → 404 sem escrita; id de categoria inseguro → 400', async () => {
    await adicionarItemAoCatalogo('armas', 'a'.repeat(50), USUARIO);
    fake.chamadas.length = 0;
    const e = await recusa(adicionarItemAoCatalogo('nada', 'Faca', USUARIO));
    expect([e.status, e.codigo]).toEqual([404, 'NAO_ENCONTRADO']);
    expect((await recusa(adicionarItemAoCatalogo('../x', 'Faca', USUARIO))).status).toBe(400);
    expect(escritas()).toEqual([]);
  });

  it('AC3: "Gaze"/"gaze" e "Pistola 9mm"/"pistola-9mm" → o segundo é recusado como duplicado (409)', async () => {
    const e1 = await recusa(adicionarItemAoCatalogo('medicamentos', 'gaze', USUARIO));
    expect([e1.status, e1.codigo]).toEqual([409, 'DUPLICADO']);
    await adicionarItemAoCatalogo('armas', 'Pistola 9mm', USUARIO);
    const e2 = await recusa(adicionarItemAoCatalogo('armas', 'pistola-9mm', USUARIO));
    expect(e2.codigo).toBe('DUPLICADO');
    expect(itensDe('armas').filter((i) => i.id === 'pistola_9mm')).toHaveLength(1);
  });

  it('AC3: duplicado também por nome equivalente de item existente ("Desert Eagle" já é o id "desert")', async () => {
    const e = await recusa(adicionarItemAoCatalogo('armas', 'desert', USUARIO));
    expect(e.codigo).toBe('DUPLICADO');
    const e2 = await recusa(adicionarItemAoCatalogo('armas', 'Desert Eagle', USUARIO));
    expect(e2.codigo).toBe('DUPLICADO');
  });

  it('AC4: o 25º item é aceito e o 26º é recusado (409 LIMITE_CATEGORIA)', async () => {
    const faltam = 25 - itensDe('drogas').length;
    for (let i = 0; i < faltam; i++) await adicionarItemAoCatalogo('drogas', `Droga ${i}`, USUARIO);
    expect(itensDe('drogas')).toHaveLength(25);
    const e = await recusa(adicionarItemAoCatalogo('drogas', 'Droga Extra', USUARIO));
    expect([e.status, e.codigo]).toEqual([409, 'LIMITE_CATEGORIA']);
    expect(itensDe('drogas')).toHaveLength(25);
  });

  it('AC5: dois cadastros paralelos do mesmo nome → um grava, o outro é duplicado', async () => {
    const r = await Promise.allSettled([
      adicionarItemAoCatalogo('armas', 'Faca', USUARIO),
      adicionarItemAoCatalogo('armas', 'faca', USUARIO),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason as ErroApp).codigo).toBe('DUPLICADO');
    expect(itensDe('armas').filter((i) => i.id === 'faca')).toHaveLength(1);
    expect(auditorias(fake.dump())).toHaveLength(1);
  });

  it('AC5: 30 cadastros distintos paralelos na mesma categoria respeitam o limite de 25', async () => {
    const r = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => adicionarItemAoCatalogo('extras', `Novo ${i}`, USUARIO)));
    const ok = r.filter((x) => x.status === 'fulfilled').length;
    expect(itensDe('extras')).toHaveLength(25);
    expect(ok).toBe(25 - 6);
    for (const x of r) if (x.status === 'rejected') expect((x.reason as ErroApp).codigo).toBe('LIMITE_CATEGORIA');
    expect(auditorias(fake.dump())).toHaveLength(ok);
  });

  it('AC6: o id é único por categoria; o mesmo id pode existir em outra categoria', async () => {
    await adicionarItemAoCatalogo('materiais', 'Faca', USUARIO);
    await adicionarItemAoCatalogo('armas', 'Faca', USUARIO);
    expect(itensDe('materiais').some((i) => i.id === 'faca')).toBe(true);
    expect(itensDe('armas').some((i) => i.id === 'faca')).toBe(true);
  });

  it('AC7: grava a auditoria catalogo.adicionar_item na MESMA transação, com o usuário da sessão', async () => {
    await adicionarItemAoCatalogo('armas', 'Faca', { ...USUARIO, nivel: 3 } as typeof USUARIO);
    const w = escritas();
    expect(w.every((c) => c.emTransacao)).toBe(true);
    expect(w.map((c) => c.caminho).filter((c) => !c.startsWith('auditoria/'))).toEqual(['config/catalogo']);
    const [a] = auditorias(fake.dump());
    expect(a).toMatchObject({
      acao: 'catalogo.adicionar_item',
      usuario: { id: USUARIO.id, nome: USUARIO.nome },
      alvo: { categoriaId: 'armas', itemId: 'faca', nomeItem: 'Faca' },
    });
    expect(Number.isNaN(Date.parse(String(a!.data)))).toBe(false);
    expect(JSON.stringify(a!.usuario)).not.toContain('nivel');
  });

  it('falha de commit → catálogo idêntico e zero auditorias', async () => {
    const antes = fake.dump();
    fake.falharProximoCommit(new Error('falha'));
    await expect(adicionarItemAoCatalogo('armas', 'Faca', USUARIO)).rejects.toThrow();
    expect(fake.dump()).toEqual(antes);
  });

  it('usuário inválido → erro e nada gravado', async () => {
    const e = await recusa(adicionarItemAoCatalogo('armas', 'Faca', undefined as never));
    expect(e.codigo).toBe('INTERNO');
    expect(escritas()).toEqual([]);
  });

  it('adicionar não mexe nos baús', async () => {
    await adicionarItemAoCatalogo('armas', 'Faca', USUARIO);
    expect(fake.dump()['baus/membros']).toMatchObject({ versao: 0, itens: {} });
  });
});

describe('WEB-014 AC4 com a função real: adicionarItem x semeadura (D6)', () => {
  it('em banco vazio, adições concorrentes com a semente nunca perdem item', async () => {
    resetSemente();
    fake = criarFakeFirestore();
    setDb(comoDb(fake));
    const r = await Promise.all([
      garantirCatalogo(),
      adicionarItemAoCatalogo('armas', 'Faca', USUARIO),
      garantirCatalogo(),
      adicionarItemAoCatalogo('armas', 'Machado', USUARIO),
      adicionarItemAoCatalogo('extras', 'Corda', USUARIO),
    ]);
    expect(r[1]?.item.id).toBe('faca');
    const ids = (c: string) => itensDe(c).map((i) => i.id);
    expect(ids('armas')).toEqual(expect.arrayContaining(['colt', 'usp', 'desert', 'ak_47', 'faca', 'machado']));
    expect(ids('extras')).toContain('corda');
    expect(categorias()).toHaveLength(6);
    expect(auditorias(fake.dump())).toHaveLength(3);
  });
});
