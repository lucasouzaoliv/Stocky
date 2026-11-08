import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adicionarAoBau } from '@/server/bau/operacoes';
import { removerItemDoCatalogo } from '@/server/catalogo/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
import type { CategoriaCatalogo } from '@/server/dominio/tipos';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { DONO, GERENTE, USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import { falharCommitDaOperacao } from './commit-falho';

let fake: FakeFirestore;
function abrir(o: { membros?: ItensBau; gerencia?: ItensBau; versao?: number } = {}) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase(o) });
  setDb(comoDb(fake));
}
beforeEach(() => abrir({ membros: { medicamentos: { analgesico: 10, gaze: 2 } }, gerencia: { medicamentos: { analgesico: 5 }, armas: { colt: 1 } } }));
afterEach(() => {
  resetDb();
  resetSemente();
});

const itensCat = (id: string) => (fake.dump()['config/catalogo'] as { categorias: CategoriaCatalogo[] }).categorias.find((c) => c.id === id)!.itens;
const bau = (t: string) => fake.dump()[`baus/${t}`] as { versao: number; itens: ItensBau };
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-036 removerItemDoCatalogo', () => {
  it('AC1: remove do catálogo e dos dois baús, devolve quantidades e grava auditoria completa', async () => {
    const r = await removerItemDoCatalogo('medicamentos', 'analgesico', DONO);
    expect(r.item).toEqual({ id: 'analgesico', nome: 'Analgésico' });
    expect(r.removidoDe).toEqual({ membros: 10, gerencia: 5, casa: 0 });
    expect(itensCat('medicamentos').map((i) => i.id)).toEqual(['gaze', 'adrenalina']);
    expect(bau('membros').itens).toEqual({ medicamentos: { gaze: 2 } });
    expect(bau('gerencia').itens).toEqual({ armas: { colt: 1 } });
    const [a] = auditorias(fake.dump());
    expect(a).toMatchObject({
      acao: 'catalogo.remover_item',
      usuario: { id: USUARIO.id, nome: USUARIO.nome },
      alvo: { categoriaId: 'medicamentos', itemId: 'analgesico', nomeItem: 'Analgésico' },
      antes: { membros: 10, gerencia: 5 },
      depois: null,
    });
    expect(Number.isNaN(Date.parse(String(a!.data)))).toBe(false);
    expect(r.auditoriaId).toMatch(/^auto/);
    expect(fake.dump()[`auditoria/${r.auditoriaId}`]).toBeDefined();
  });

  it('AC1: cria um log catalogo_remover em cada baú que tinha quantidade, ligado à auditoria', async () => {
    const r = await removerItemDoCatalogo('armas', 'colt', DONO);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(0);
    const [log] = logsDe(fake.dump(), 'gerencia');
    expect(log).toMatchObject({ acao: 'catalogo_remover', itemId: 'colt', quantidade: 1, auditoriaId: r.auditoriaId, versao: 1 });
  });

  it('AC1/AC4: toda a remoção é feita em transação e a versão dos dois baús sobe 1', async () => {
    await removerItemDoCatalogo('medicamentos', 'analgesico', DONO);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    expect(bau('membros').versao).toBe(1);
    expect(bau('gerencia').versao).toBe(1);
  });

  it('AC2: falha injetada no commit → dump idêntico e zero auditorias', async () => {
    const antes = fake.dump();
    const provar = await falharCommitDaOperacao(fake, new Error('falha'));
    await expect(removerItemDoCatalogo('medicamentos', 'analgesico', DONO)).rejects.toThrow();
    provar();
    expect(fake.dump()).toEqual(antes);
    expect(auditorias(fake.dump())).toHaveLength(0);
  });

  it('AC2: falha em qualquer escrita da transação (catálogo, baú ou auditoria) não deixa nada pela metade', async () => {
    for (const alvo of [/^config\/catalogo$/, /^baus\/gerencia$/, /^auditoria\//]) {
      abrir({ membros: { medicamentos: { analgesico: 10 } }, gerencia: { medicamentos: { analgesico: 5 } } });
      await removerItemDoCatalogo('medicamentos', 'gaze', DONO).catch(() => undefined);
      const antes = fake.dump();
      fake.falharEm('set', alvo, new Error('falha injetada'));
      await expect(removerItemDoCatalogo('medicamentos', 'analgesico', DONO), String(alvo)).rejects.toThrow();
      expect(fake.dump(), String(alvo)).toEqual(antes);
    }
  });

  it('AC3: item ou categoria inexistente → 404 e nada gravado', async () => {
    for (const [c, i] of [['medicamentos', 'nao_existe'], ['nada', 'analgesico']] as const) {
      const e = await recusa(removerItemDoCatalogo(c, i, DONO));
      expect([e.status, e.codigo]).toEqual([404, 'NAO_ENCONTRADO']);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC3: ids inseguros → 400; usuário ausente → erro; nada gravado', async () => {
    expect((await recusa(removerItemDoCatalogo('../x', 'analgesico', DONO))).status).toBe(400);
    expect((await recusa(removerItemDoCatalogo('medicamentos', '__proto__', DONO))).status).toBe(400);
    expect((await recusa(removerItemDoCatalogo('medicamentos', 'analgesico', undefined as never))).codigo).toBe('INTERNO');
    expect(escritas()).toEqual([]);
  });

  it('AC5: item sem estoque nos baús sai só do catálogo, com auditoria de quantidades 0 e sem logs de baú', async () => {
    const r = await removerItemDoCatalogo('drogas', 'lsd', DONO);
    expect(r.removidoDe).toEqual({ membros: 0, gerencia: 0, casa: 0 });
    expect(auditorias(fake.dump())[0]).toMatchObject({ antes: { membros: 0, gerencia: 0 }, depois: null });
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(0);
    expect(logsDe(fake.dump(), 'gerencia')).toHaveLength(0);
    expect(itensCat('drogas').some((i) => i.id === 'lsd')).toBe(false);
  });

  it('AC6: função exclusiva do dono: gerência (nível 2) e nível 1 → SEM_PERMISSAO, nada gravado', async () => {
    for (const nivel of [1, 2] as const) {
      const e = await recusa(removerItemDoCatalogo('medicamentos', 'analgesico', { ...USUARIO, nivel } as never));
      expect([e.status, e.codigo]).toEqual([403, 'SEM_PERMISSAO']);
    }
    expect((await recusa(removerItemDoCatalogo('medicamentos', 'analgesico', GERENTE))).status).toBe(403);
    expect((await recusa(removerItemDoCatalogo('medicamentos', 'analgesico', USUARIO as never))).status).toBe(403);
    expect(escritas()).toEqual([]);
  });

  it('AC6: a auditoria grava só o id e o nome do dono, não o nível', async () => {
    await removerItemDoCatalogo('drogas', 'lsd', DONO);
    expect(auditorias(fake.dump())[0]!.usuario).toEqual({ id: DONO.id, nome: DONO.nome });
  });

  it('concorrência: remover o item com estoque em baú e um depósito simultâneo nunca deixam estoque órfão', async () => {
    const r = await Promise.allSettled([
      removerItemDoCatalogo('medicamentos', 'analgesico', DONO),
      adicionarAoBau({ tipo: 'membros', categoriaId: 'medicamentos', itemId: 'analgesico', quantidade: 7 }, USUARIO),
      adicionarAoBau({ tipo: 'gerencia', categoriaId: 'medicamentos', itemId: 'analgesico', quantidade: 7 }, USUARIO),
    ]);
    expect(r[0]!.status).toBe('fulfilled');
    expect(itensCat('medicamentos').some((i) => i.id === 'analgesico')).toBe(false);
    // o depósito que veio depois da remoção é recusado (item fora do catálogo); o que veio antes foi levado junto
    for (const t of ['membros', 'gerencia']) expect(bau(t).itens.medicamentos?.analgesico).toBeUndefined();
    const [a] = auditorias(fake.dump());
    const removido = (a!.antes as { membros: number; gerencia: number });
    expect(removido.membros + removido.gerencia).toBeGreaterThanOrEqual(15);
  });

  it('concorrência: depósito que entra antes da remoção é levado junto e aparece na auditoria', async () => {
    const r = await Promise.allSettled([
      adicionarAoBau({ tipo: 'membros', categoriaId: 'medicamentos', itemId: 'analgesico', quantidade: 7 }, USUARIO),
      removerItemDoCatalogo('medicamentos', 'analgesico', DONO),
    ]);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(auditorias(fake.dump())[0]!.antes).toEqual({ membros: 17, gerencia: 5, casa: 0 });
    expect(bau('membros').itens.medicamentos?.analgesico).toBeUndefined();
    expect(bau('membros').versao).toBe(2);
  });

  it('remover duas vezes: a segunda dá 404 e não duplica a auditoria', async () => {
    const r = await Promise.allSettled([
      removerItemDoCatalogo('armas', 'colt', DONO),
      removerItemDoCatalogo('armas', 'colt', DONO),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason as ErroApp).status).toBe(404);
    expect(auditorias(fake.dump())).toHaveLength(1);
    expect(bau('gerencia').versao).toBe(1);
  });
});
