import { describe, expect, it } from 'vitest';
import { criarFakeFirestore, type ChamadaFake, type FakeFirestore } from '../helpers/fake-firestore';

const saldo = (fake: FakeFirestore) => fake.collection('caixa').doc('saldo');

async function somarEmTransacao(fake: FakeFirestore, n: number): Promise<void> {
  await fake.runTransaction(async (tx) => {
    const snap = await tx.get(saldo(fake));
    const atual = (snap.data()?.total as number) ?? 0;
    tx.set(saldo(fake), { total: atual + n });
  });
}

async function somarSemTransacao(fake: FakeFirestore, n: number): Promise<void> {
  const snap = await saldo(fake).get();
  const atual = (snap.data()?.total as number) ?? 0;
  await saldo(fake).set({ total: atual + n });
}

describe('WEB-011 fake do Firestore', () => {
  it('AC1: duas transações paralelas de ler-alterar-gravar são ambas aplicadas', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 0 } } });
    await Promise.all([somarEmTransacao(fake, 5), somarEmTransacao(fake, 7)]);
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 12 });
  });

  it('AC1: muitas transações paralelas continuam atômicas', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 0 } } });
    await Promise.all(Array.from({ length: 25 }, () => somarEmTransacao(fake, 2)));
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 50 });
  });

  it('AC1 (sanidade): o mesmo código fora de transação perde uma atualização', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 0 } } });
    await Promise.all([somarSemTransacao(fake, 5), somarSemTransacao(fake, 7)]);
    expect((fake.dump()['caixa/saldo'] as { total: number }).total).not.toBe(12);
  });

  it('AC2: falharProximoCommit não aplica nada e a Promise rejeita; só afeta uma transação', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 1 } } });
    const erro = new Error('commit falhou');
    fake.falharProximoCommit(erro);
    await expect(somarEmTransacao(fake, 10)).rejects.toBe(erro);
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 1 });
    await somarEmTransacao(fake, 10);
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 11 });
  });

  it('AC3: callback que lança não aplica escritas e propaga o mesmo erro', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 1 } } });
    const erro = new Error('regra de negócio');
    await expect(
      fake.runTransaction(async (tx) => {
        tx.set(saldo(fake), { total: 999 });
        tx.set(fake.collection('logs').doc('a'), { x: 1 });
        throw erro;
      }),
    ).rejects.toBe(erro);
    expect(fake.dump()).toEqual({ 'caixa/saldo': { total: 1 } });
  });

  it('AC3: uma transação que falha não trava a fila das seguintes', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 0 } } });
    const falha = fake.runTransaction(async () => {
      throw new Error('x');
    });
    const ok = somarEmTransacao(fake, 3);
    await expect(falha).rejects.toThrow('x');
    await ok;
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 3 });
  });

  it('AC4: ler depois de escrever na mesma transação lança erro', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 1 } } });
    await expect(
      fake.runTransaction(async (tx) => {
        tx.set(saldo(fake), { total: 2 });
        await tx.get(saldo(fake));
      }),
    ).rejects.toThrow(/all reads to be executed before all writes/);
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 1 });
  });

  it('AC5: dump devolve cópia profunda', async () => {
    const fake = criarFakeFirestore({ seed: { 'baus/membros': { itens: { armas: { ak: 3 } } } } });
    const copia = fake.dump();
    (copia['baus/membros'] as { itens: { armas: { ak: number } } }).itens.armas.ak = 99;
    expect(fake.dump()['baus/membros']).toEqual({ itens: { armas: { ak: 3 } } });
    const snap = await fake.collection('baus').doc('membros').get();
    (snap.data() as { itens: { armas: { ak: number } } }).itens.armas.ak = 77;
    expect(fake.dump()['baus/membros']).toEqual({ itens: { armas: { ak: 3 } } });
  });

  it('seed é copiado: mudar o objeto original não afeta o fake', () => {
    const seed = { 'caixa/saldo': { total: 1 } };
    const fake = criarFakeFirestore({ seed });
    seed['caixa/saldo'].total = 50;
    expect(fake.dump()['caixa/saldo']).toEqual({ total: 1 });
  });

  it('AC5: orderBy + limit funcionam em subcoleções (desc e asc) e não vazam outras coleções', async () => {
    const fake = criarFakeFirestore({
      seed: {
        'logs/membros/entradas/a': { data: 1 },
        'logs/membros/entradas/b': { data: 3 },
        'logs/membros/entradas/c': { data: 2 },
        'logs/gerencia/entradas/d': { data: 99 },
        'logs/membros/entradas/c/sub/z': { data: 100 },
      },
    });
    const entradas = fake.collection('logs').doc('membros').collection('entradas');
    const desc = await entradas.orderBy('data', 'desc').limit(2).get();
    expect(desc.docs.map((d) => d.id)).toEqual(['b', 'c']);
    expect(desc.size).toBe(2);
    expect(desc.empty).toBe(false);
    const asc = await entradas.orderBy('data').get();
    expect(asc.docs.map((d) => d.id)).toEqual(['a', 'c', 'b']);
    const vazio = await fake.collection('logs').doc('nada').collection('entradas').get();
    expect(vazio.empty).toBe(true);
  });

  it('AC5: orderBy + limit também funcionam dentro de transação', async () => {
    const fake = criarFakeFirestore({ seed: { 'l/a': { n: 1 }, 'l/b': { n: 2 }, 'l/c': { n: 3 } } });
    const ids = await fake.runTransaction(async (tx) => {
      const r = await tx.get(fake.collection('l').orderBy('n', 'desc').limit(2));
      return r.docs.map((d) => d.id);
    });
    expect(ids).toEqual(['c', 'b']);
  });

  it('AC5: runTransaction registra emTransacao: true; operações soltas, false', async () => {
    const registro: ChamadaFake[] = [];
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 0 } }, registro });
    await somarEmTransacao(fake, 1);
    await saldo(fake).get();
    expect(fake.chamadas.map((c) => [c.op, c.emTransacao])).toEqual([
      ['get', true],
      ['set', true],
      ['get', false],
    ]);
    expect(fake.chamadas.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(registro).toEqual(fake.chamadas);
  });

  it('create falha se já existe; update falha se não existe; delete remove', async () => {
    const fake = criarFakeFirestore({ seed: { 'a/1': { v: 1 } } });
    await expect(fake.runTransaction(async (tx) => void tx.create(fake.collection('a').doc('1'), { v: 2 }))).rejects.toThrow(
      /ALREADY_EXISTS/,
    );
    await expect(fake.runTransaction(async (tx) => void tx.update(fake.collection('a').doc('9'), { v: 2 }))).rejects.toThrow(
      /NOT_FOUND/,
    );
    await fake.runTransaction(async (tx) => void tx.create(fake.collection('a').doc('2'), { v: 2 }).delete(fake.collection('a').doc('1')));
    expect(fake.dump()).toEqual({ 'a/2': { v: 2 } });
  });

  it('rejeita undefined e tipos não suportados como o Firestore real', async () => {
    const fake = criarFakeFirestore();
    await expect(fake.collection('a').doc('1').set({ v: undefined })).rejects.toThrow(/undefined/);
    await expect(fake.collection('a').doc('1').set({ v: () => 1 })).rejects.toThrow(/Unsupported/);
    await expect(
      fake.runTransaction(async (tx) => void tx.set(fake.collection('a').doc('1'), { v: undefined })),
    ).rejects.toThrow(/undefined/);
    expect(fake.dump()).toEqual({});
  });

  it('FieldValue.increment, delete e update com caminho pontilhado', async () => {
    const fake = criarFakeFirestore({ seed: { 'b/1': { itens: { armas: { ak: 5, m4: 1 } }, versao: 0 } } });
    const ref = fake.collection('b').doc('1');
    await fake.runTransaction(async (tx) => {
      tx.update(ref, { 'itens.armas.ak': fake.FieldValue.increment(-2), 'itens.armas.m4': fake.FieldValue.delete(), versao: fake.FieldValue.increment(1) });
    });
    expect(fake.dump()['b/1']).toEqual({ itens: { armas: { ak: 3 } }, versao: 1 });
  });

  it('set com merge mescla objetos aninhados', async () => {
    const fake = criarFakeFirestore({ seed: { 'b/1': { a: { x: 1, y: 2 }, k: 1 } } });
    await fake.collection('b').doc('1').set({ a: { y: 9, z: 3 } }, { merge: true });
    expect(fake.dump()['b/1']).toEqual({ a: { x: 1, y: 9, z: 3 }, k: 1 });
  });

  it('falharEm rejeita só a operação casada, uma vez', async () => {
    const fake = criarFakeFirestore();
    const erro = new Error('set falhou');
    fake.falharEm('set', /^logs\//, erro);
    await expect(fake.collection('logs').doc('a').set({ x: 1 })).rejects.toBe(erro);
    await fake.collection('logs').doc('a').set({ x: 1 });
    await fake.collection('outra').doc('a').set({ x: 1 });
    expect(Object.keys(fake.dump()).sort()).toEqual(['logs/a', 'outra/a']);
  });

  it('falharEm dentro de transação impede o commit inteiro', async () => {
    const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { total: 1 } } });
    const erro = new Error('escrita do log falhou');
    fake.falharEm('set', /^logs\//, erro);
    await expect(
      fake.runTransaction(async (tx) => {
        tx.set(saldo(fake), { total: 2 });
        tx.set(fake.collection('logs').doc('a'), { x: 1 });
      }),
    ).rejects.toBe(erro);
    expect(fake.dump()).toEqual({ 'caixa/saldo': { total: 1 } });
  });

  it('add gera ids automáticos distintos e válidos como ehIdDocumento', async () => {
    const fake = criarFakeFirestore();
    const a = await fake.collection('auditoria').add({ x: 1 });
    const b = await fake.collection('auditoria').add({ x: 2 });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[A-Za-z0-9]{1,40}$/);
    expect(Object.keys(fake.dump())).toHaveLength(2);
  });
});
