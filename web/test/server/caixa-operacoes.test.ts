import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { movimentarCaixa } from '@/server/caixa/operacoes';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { OUTRO_USUARIO, USUARIO, VALORES_INVALIDOS, logsDe, seedBase } from '../helpers/estado';

let fake: FakeFirestore;
async function abrir(saldo: { sujo?: number; limpo?: number } = {}) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ saldo }) });
  setDb(comoDb(fake));
  await garantirCatalogo();
}
beforeEach(() => resetSemente());
afterEach(() => {
  resetDb();
  resetSemente();
});

type P = { tipo?: unknown; acao?: unknown; valor?: unknown; anotacao?: unknown };
const mov = (o: P = {}) => ({ tipo: 'sujo', acao: 'entrada', valor: 100, anotacao: 'teste', ...o });
const saldo = () => fake.dump()['caixa/saldo'] as { sujo: number; limpo: number; versao: number };
const logs = () => logsDe(fake.dump(), 'caixa');
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-033 movimentarCaixa', () => {
  it('entrada e saída devolvem o saldo novo dos dois tipos', async () => {
    await abrir({ sujo: 50, limpo: 70 });
    expect(await movimentarCaixa(mov({ valor: 25 }), USUARIO)).toEqual({ sujo: 75, limpo: 70 });
    expect(await movimentarCaixa(mov({ acao: 'saida', valor: 5 }), USUARIO)).toEqual({ sujo: 70, limpo: 70 });
    expect(saldo()).toMatchObject({ sujo: 70, limpo: 70, versao: 2 });
  });

  it('AC1: entradas paralelas de 100 e 200 somam 300', async () => {
    await abrir();
    await Promise.all([movimentarCaixa(mov({ valor: 100 }), USUARIO), movimentarCaixa(mov({ valor: 200 }), OUTRO_USUARIO)]);
    expect(saldo().sujo).toBe(300);
    expect(logs()).toHaveLength(2);
  });

  it('AC1: saídas paralelas que juntas excedem o saldo → uma passa, outra 409; saldo nunca negativo', async () => {
    await abrir({ limpo: 150 });
    const r = await Promise.allSettled([
      movimentarCaixa(mov({ tipo: 'limpo', acao: 'saida', valor: 100 }), USUARIO),
      movimentarCaixa(mov({ tipo: 'limpo', acao: 'saida', valor: 100 }), OUTRO_USUARIO),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect((rej.reason as ErroApp).status).toBe(409);
    expect((rej.reason as ErroApp).codigo).toBe('SALDO_INSUFICIENTE');
    expect((rej.reason as ErroApp).message).toBe('Saldo insuficiente. Disponível: $50.');
    expect(saldo().limpo).toBe(50);
    expect(logs()).toHaveLength(1);
  });

  it('concorrência 6+6: seis saídas de 20 e seis de 30 com saldo 100 nunca deixam o saldo negativo', async () => {
    await abrir({ sujo: 100 });
    const valores = [...Array(6).fill(20), ...Array(6).fill(30)] as number[];
    const r = await Promise.allSettled(valores.map((v) => movimentarCaixa(mov({ acao: 'saida', valor: v }), USUARIO)));
    const retirado = r.reduce((n, x, i) => n + (x.status === 'fulfilled' ? valores[i]! : 0), 0);
    expect(retirado).toBeLessThanOrEqual(100);
    expect(saldo().sujo).toBe(100 - retirado);
    expect(saldo().sujo).toBeGreaterThanOrEqual(0);
    for (const x of r) if (x.status === 'rejected') expect((x.reason as ErroApp).codigo).toBe('SALDO_INSUFICIENTE');
    expect(logs()).toHaveLength(r.filter((x) => x.status === 'fulfilled').length);
  });

  it('AC2: saída exata do saldo → 0', async () => {
    await abrir({ sujo: 1234 });
    expect(await movimentarCaixa(mov({ acao: 'saida', valor: 1234 }), USUARIO)).toEqual({ sujo: 0, limpo: 0 });
    expect(saldo().sujo).toBe(0);
  });

  it('saída acima do saldo e sem saldo algum → 409', async () => {
    await abrir({ sujo: 10 });
    const antes = fake.dump();
    expect((await recusa(movimentarCaixa(mov({ acao: 'saida', valor: 11 }), USUARIO))).status).toBe(409);
    expect((await recusa(movimentarCaixa(mov({ tipo: 'limpo', acao: 'saida', valor: 1 }), USUARIO))).message).toBe('Saldo insuficiente. Disponível: $0.');
    expect(fake.dump()).toEqual(antes);
  });

  describe('AC3: valor inválido → 400 e nada gravado', () => {
    for (const [nome, valor] of [...VALORES_INVALIDOS, ['acima do máximo', 1_000_000_001]] as Array<[string, unknown]>) {
      it(nome, async () => {
        await abrir({ sujo: 10 });
        const antes = fake.dump();
        const e = await recusa(movimentarCaixa(mov({ valor }), USUARIO));
        expect(e.status).toBe(400);
        expect(fake.dump()).toEqual(antes);
        expect(escritas()).toEqual([]);
      });
    }

    it('limites 1 e 1.000.000.000 são aceitos', async () => {
      await abrir();
      await movimentarCaixa(mov({ valor: 1 }), USUARIO);
      await movimentarCaixa(mov({ valor: 1_000_000_000 }), USUARIO);
      expect(saldo().sujo).toBe(1_000_000_001);
    });

    it('tipo ou ação inválidos → 400', async () => {
      await abrir();
      for (const tipo of ['', 'Sujo', 'dinheiro', undefined, null, 1, '__proto__']) {
        expect((await recusa(movimentarCaixa(mov({ tipo }), USUARIO))).status).toBe(400);
      }
      for (const acao of ['', 'Entrada', 'deposito', undefined, null, 1]) {
        expect((await recusa(movimentarCaixa(mov({ acao }), USUARIO))).status).toBe(400);
      }
      expect(escritas()).toEqual([]);
    });
  });

  describe('AC4: anotação obrigatória, aparada e sem caracteres de controle', () => {
    it('vazia, só espaços, só controle ou não texto → 400', async () => {
      await abrir();
      for (const anotacao of ['', '   ', '\n\t ', '\u0000\u0007', undefined, null, 5, {}]) {
        const e = await recusa(movimentarCaixa(mov({ anotacao }), USUARIO));
        expect(e.status).toBe(400);
      }
      expect(escritas()).toEqual([]);
    });

    it('acima de 100 caracteres → 400; exatamente 100 passa', async () => {
      await abrir();
      expect((await recusa(movimentarCaixa(mov({ anotacao: 'a'.repeat(101) }), USUARIO))).status).toBe(400);
      await movimentarCaixa(mov({ anotacao: 'a'.repeat(100) }), USUARIO);
      expect(logs()).toHaveLength(1);
    });

    it('é gravada aparada, com espaços colapsados e sem controle', async () => {
      await abrir();
      await movimentarCaixa(mov({ anotacao: '  venda \u0000de\n colete\u0007  ' }), USUARIO);
      expect(logs()[0]!.anotacao).toBe('venda de colete');
    });
  });

  it('AC5: saldo e log na mesma transação; falha de commit deixa o dump idêntico e nenhum log', async () => {
    await abrir({ sujo: 10 });
    const antes = fake.dump();
    fake.falharProximoCommit(new Error('commit falhou'));
    await expect(movimentarCaixa(mov(), USUARIO)).rejects.toThrow('commit falhou');
    expect(fake.dump()).toEqual(antes);
    expect(logs()).toHaveLength(0);

    const antesChamadas = fake.chamadas.length;
    await movimentarCaixa(mov(), USUARIO);
    const novas = fake.chamadas.slice(antesChamadas).filter((c) => c.op !== 'get');
    expect(novas).toHaveLength(2);
    expect(novas.every((c) => c.emTransacao)).toBe(true);
  });

  it('AC5: falha ao gravar o log desfaz também o saldo', async () => {
    await abrir({ sujo: 10 });
    const antes = fake.dump();
    fake.falharEm('set', /^logs\/caixa\/entradas\//, new Error('log falhou'));
    await expect(movimentarCaixa(mov(), USUARIO)).rejects.toThrow('log falhou');
    expect(fake.dump()).toEqual(antes);
  });

  it('AC6: resultado acima de Number.MAX_SAFE_INTEGER é recusado (saldo no limite seguro aceita até ele)', async () => {
    await abrir({ sujo: Number.MAX_SAFE_INTEGER - 10 });
    const antes = fake.dump();
    expect((await recusa(movimentarCaixa(mov({ valor: 11 }), USUARIO))).status).toBe(400);
    expect(fake.dump()).toEqual(antes);
    expect((await movimentarCaixa(mov({ valor: 10 }), USUARIO)).sujo).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('AC7: sujo e limpo são independentes', async () => {
    await abrir({ sujo: 100, limpo: 200 });
    await movimentarCaixa(mov({ tipo: 'sujo', acao: 'saida', valor: 40 }), USUARIO);
    expect(saldo()).toMatchObject({ sujo: 60, limpo: 200 });
    await movimentarCaixa(mov({ tipo: 'limpo', valor: 5 }), USUARIO);
    expect(saldo()).toMatchObject({ sujo: 60, limpo: 205 });
  });

  it('o log guarda ação, tipo, valor, anotação, saldo resultante, data ISO e o usuário (id e nome), sem campos extras', async () => {
    await abrir({ limpo: 500 });
    await movimentarCaixa(mov({ tipo: 'limpo', acao: 'saida', valor: 120, anotacao: 'compra' }), {
      ...OUTRO_USUARIO,
      nivel: 3,
    } as unknown as typeof USUARIO);
    const [log] = logs();
    expect(Object.keys(log!).sort()).toEqual(['acao', 'anotacao', 'data', 'saldoResultante', 'tipo', 'usuario', 'valor']);
    expect(log).toMatchObject({
      acao: 'saida',
      tipo: 'limpo',
      valor: 120,
      anotacao: 'compra',
      saldoResultante: 380,
      usuario: { id: OUTRO_USUARIO.id, nome: OUTRO_USUARIO.nome },
    });
    expect(new Date(log!.data as string).toISOString()).toBe(log!.data);
  });

  it('usuário sem id ou nome não grava nada', async () => {
    await abrir();
    const antes = fake.dump();
    await expect(movimentarCaixa(mov(), { id: '', nome: 'X' })).rejects.toBeInstanceOf(ErroApp);
    expect(fake.dump()).toEqual(antes);
  });

  it('banco vazio: a primeira movimentação semeia (transação) e grava saldo e log', async () => {
    resetSemente();
    fake = criarFakeFirestore();
    setDb(comoDb(fake));
    expect(await movimentarCaixa(mov({ valor: 7 }), USUARIO)).toEqual({ sujo: 7, limpo: 0 });
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    expect(logs()).toHaveLength(1);
  });

  it('documento de saldo ausente é tratado como zero e recriado na transação', async () => {
    await abrir();
    const seed = seedBase();
    delete (seed as Record<string, unknown>)['caixa/saldo'];
    fake = criarFakeFirestore({ seed });
    setDb(comoDb(fake));
    expect(await movimentarCaixa(mov({ tipo: 'limpo', valor: 9 }), USUARIO)).toEqual({ sujo: 0, limpo: 9 });
    expect(saldo()).toMatchObject({ sujo: 0, limpo: 9, versao: 1 });
  });
});
