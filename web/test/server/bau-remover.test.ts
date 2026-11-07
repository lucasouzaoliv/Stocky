import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adicionarAoBau, removerDoBau } from '@/server/bau/operacoes';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { OUTRO_USUARIO, USUARIO, VALORES_INVALIDOS, logsDe, seedBase, type ItensBau } from '../helpers/estado';

let fake: FakeFirestore;
async function abrir(membros: ItensBau = {}, extra: Parameters<typeof seedBase>[0] = {}) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros, ...extra }) });
  setDb(comoDb(fake));
  await garantirCatalogo();
}
beforeEach(() => resetSemente());
afterEach(() => {
  resetDb();
  resetSemente();
});

const pedido = (quantidade: unknown, o: Partial<{ tipo: 'membros' | 'gerencia'; categoriaId: string; itemId: string }> = {}) => ({
  tipo: o.tipo ?? 'membros',
  categoriaId: o.categoriaId ?? 'medicamentos',
  itemId: o.itemId ?? 'analgesico',
  quantidade,
});
const itensDoBau = (tipo = 'membros') => (fake.dump()[`baus/${tipo}`] as { itens: ItensBau }).itens;
const versao = (tipo = 'membros') => (fake.dump()[`baus/${tipo}`] as { versao: number }).versao;
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-030 removerDoBau', () => {
  it('subtrai do estoque e devolve a quantidade resultante e a versão', async () => {
    await abrir({ medicamentos: { analgesico: 10 } }, { versao: 2 });
    expect(await removerDoBau(pedido(4), USUARIO)).toEqual({
      categoriaId: 'medicamentos',
      itemId: 'analgesico',
      quantidade: 6,
      versao: 3,
    });
    expect(itensDoBau()).toEqual({ medicamentos: { analgesico: 6 } });
  });

  it('AC1: duas remoções simultâneas de 6 com estoque 10 → uma passa, outra dá 409, estoque final 4', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    const r = await Promise.allSettled([removerDoBau(pedido(6), USUARIO), removerDoBau(pedido(6), OUTRO_USUARIO)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejeitada = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejeitada.reason).toBeInstanceOf(ErroApp);
    expect((rejeitada.reason as ErroApp).status).toBe(409);
    expect((rejeitada.reason as ErroApp).codigo).toBe('ESTOQUE_INSUFICIENTE');
    expect((rejeitada.reason as ErroApp).message).toBe('Estoque insuficiente. Disponível: 4.');
    expect(itensDoBau().medicamentos!.analgesico).toBe(4);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(1);
    expect(versao()).toBe(1);
  });

  it('concorrência 6+6: seis remoções de 2 e seis de 3 com estoque 10 nunca deixam o estoque negativo', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    const pedidos = [...Array(6).fill(2), ...Array(6).fill(3)] as number[];
    const r = await Promise.allSettled(pedidos.map((q) => removerDoBau(pedido(q), USUARIO)));
    const ok = r.map((x, i) => (x.status === 'fulfilled' ? pedidos[i]! : 0));
    const retirado = ok.reduce((a, b) => a + b, 0);
    expect(retirado).toBeLessThanOrEqual(10);
    const restante = itensDoBau().medicamentos?.analgesico ?? 0;
    expect(restante).toBe(10 - retirado);
    expect(restante).toBeGreaterThanOrEqual(0);
    for (const x of r) if (x.status === 'rejected') expect(['ESTOQUE_INSUFICIENTE', 'NAO_ENCONTRADO']).toContain((x.reason as ErroApp).codigo);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(ok.filter(Boolean).length);
  });

  it('12 remoções paralelas de 1 com estoque 10: exatamente 10 passam, 2 falham e a chave some', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    const r = await Promise.allSettled(Array.from({ length: 12 }, () => removerDoBau(pedido(1), USUARIO)));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(10);
    expect(r.filter((x) => x.status === 'rejected')).toHaveLength(2);
    expect(itensDoBau()).toEqual({});
    expect(versao()).toBe(10);
  });

  it('AC2: remover exatamente o estoque apaga a chave (não fica 0) e a categoria vazia; outros itens ficam', async () => {
    await abrir({ medicamentos: { analgesico: 5, gaze: 2 }, armas: { colt: 1 } });
    const r = await removerDoBau(pedido(5), USUARIO);
    expect(r.quantidade).toBe(0);
    expect(itensDoBau()).toEqual({ medicamentos: { gaze: 2 }, armas: { colt: 1 } });
    await removerDoBau(pedido(1, { categoriaId: 'armas', itemId: 'colt' }), USUARIO);
    expect(itensDoBau()).toEqual({ medicamentos: { gaze: 2 } });
    expect('colt' in (itensDoBau().armas ?? {})).toBe(false);
  });

  it('AC3: item que não está no baú → 404 "O item não está no baú.", nada gravado', async () => {
    await abrir({ armas: { colt: 1 } });
    const antes = fake.dump();
    const e = await recusa(removerDoBau(pedido(1), USUARIO));
    expect(e.status).toBe(404);
    expect(e.message).toBe('O item não está no baú.');
    expect(fake.dump()).toEqual(antes);
    expect(escritas()).toEqual([]);
  });

  it('AC3: item que só existe no outro baú também é 404', async () => {
    await abrir({}, { gerencia: { medicamentos: { analgesico: 9 } } });
    const e = await recusa(removerDoBau(pedido(1), USUARIO));
    expect(e.status).toBe(404);
    expect(itensDoBau('gerencia')).toEqual({ medicamentos: { analgesico: 9 } });
  });

  it('item fora do catálogo ou de outra categoria → 404; ids perigosos → 400', async () => {
    await abrir({ medicamentos: { analgesico: 5 } });
    expect((await recusa(removerDoBau(pedido(1, { itemId: 'nao_existe' }), USUARIO))).status).toBe(404);
    expect((await recusa(removerDoBau(pedido(1, { categoriaId: 'armas', itemId: 'analgesico' }), USUARIO))).status).toBe(404);
    expect((await recusa(removerDoBau(pedido(1, { itemId: '__proto__' }), USUARIO))).status).toBe(400);
    expect((await recusa(removerDoBau({ ...pedido(1), tipo: 'x' as 'membros' }, USUARIO))).status).toBe(400);
    expect(escritas()).toEqual([]);
  });

  it('estoque insuficiente → 409 com a quantidade disponível e nada gravado', async () => {
    await abrir({ medicamentos: { analgesico: 1500 } });
    const antes = fake.dump();
    const e = await recusa(removerDoBau(pedido(1501), USUARIO));
    expect(e.status).toBe(409);
    expect(e.message).toBe('Estoque insuficiente. Disponível: 1.500.');
    expect(fake.dump()).toEqual(antes);
  });

  it('AC4: log (remover, saldo resultante, usuário) e versão na mesma transação', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    await removerDoBau(pedido(3), USUARIO);
    expect(escritas().length).toBe(2);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    const [log] = logsDe(fake.dump(), 'membros');
    expect(log).toMatchObject({
      acao: 'remover',
      usuario: { id: USUARIO.id, nome: USUARIO.nome },
      itemId: 'analgesico',
      nomeItem: 'Analgésico',
      quantidade: 3,
      saldoResultante: 7,
      versao: 1,
    });
  });

  it('AC4: falha de commit não deixa log órfão nem muda o estoque', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    const antes = fake.dump();
    fake.falharProximoCommit(new Error('commit falhou'));
    await expect(removerDoBau(pedido(3), USUARIO)).rejects.toThrow('commit falhou');
    expect(fake.dump()).toEqual(antes);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(0);
  });

  it('AC4: falha ao gravar o log desfaz também o estoque', async () => {
    await abrir({ medicamentos: { analgesico: 10 } });
    const antes = fake.dump();
    fake.falharEm('set', /^logs\/membros\/entradas\//, new Error('log falhou'));
    await expect(removerDoBau(pedido(3), USUARIO)).rejects.toThrow('log falhou');
    expect(fake.dump()).toEqual(antes);
  });

  describe('AC5: mesma validação de quantidade do adicionar', () => {
    for (const [nome, valor] of [...VALORES_INVALIDOS, ['acima do máximo', 10_000_001]] as Array<[string, unknown]>) {
      it(nome, async () => {
        await abrir({ medicamentos: { analgesico: 10 } });
        const antes = fake.dump();
        const e = await recusa(removerDoBau(pedido(valor), USUARIO));
        expect(e.status).toBe(400);
        expect(fake.dump()).toEqual(antes);
        expect(escritas()).toEqual([]);
      });
    }
  });

  it('AC6: adições e remoções de itens diferentes em paralelo não se perdem', async () => {
    await abrir({ medicamentos: { analgesico: 10 }, armas: { colt: 4 } });
    await Promise.all([
      removerDoBau(pedido(3), USUARIO),
      adicionarAoBau(pedido(5, { categoriaId: 'armas', itemId: 'colt' }), OUTRO_USUARIO),
      adicionarAoBau(pedido(7, { itemId: 'gaze' }), USUARIO),
      removerDoBau(pedido(1, { categoriaId: 'armas', itemId: 'colt' }), OUTRO_USUARIO),
    ]);
    expect(itensDoBau()).toEqual({ medicamentos: { analgesico: 7, gaze: 7 }, armas: { colt: 8 } });
    expect(versao()).toBe(4);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(4);
  });

  it('versao sobe 1 por remoção bem-sucedida e não muda em recusa', async () => {
    await abrir({ medicamentos: { analgesico: 3 } }, { versao: 8 });
    await removerDoBau(pedido(1), USUARIO);
    await recusa(removerDoBau(pedido(99), USUARIO));
    expect(versao()).toBe(9);
  });

  it('o usuário gravado é o recebido, sem campos extras', async () => {
    await abrir({ medicamentos: { analgesico: 3 } });
    await removerDoBau(pedido(1), { ...OUTRO_USUARIO, nivel: 2 } as unknown as typeof USUARIO);
    expect(logsDe(fake.dump(), 'membros')[0]!.usuario).toEqual({ id: OUTRO_USUARIO.id, nome: OUTRO_USUARIO.nome });
  });
});
