const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');

test('set, get e dump trabalham com cópias profundas', async () => {
  const seed = { 'bau/membros': { a__b: { quantidade: 1 } } };
  const fake = criarFakeFirestore({ seed });
  seed['bau/membros'].a__b.quantidade = 99;

  const snap = await fake.collection('bau').doc('membros').get();
  assert.equal(snap.exists, true);
  assert.equal(snap.id, 'membros');
  assert.equal(snap.data().a__b.quantidade, 1);

  snap.data().a__b.quantidade = 50;
  assert.equal((await fake.collection('bau').doc('membros').get()).data().a__b.quantidade, 1);

  fake.dump()['bau/membros'].a__b.quantidade = 7;
  assert.equal(fake.dump()['bau/membros'].a__b.quantidade, 1);
});

test('documento inexistente: exists false e data() undefined', async () => {
  const fake = criarFakeFirestore();
  const snap = await fake.collection('caixa').doc('saldo').get();
  assert.equal(snap.exists, false);
  assert.equal(snap.data(), undefined);
});

test('set substitui e set com merge mescla campos aninhados', async () => {
  const fake = criarFakeFirestore({ seed: { 'x/y': { a: 1, n: { p: 1, q: 2 } } } });
  const ref = fake.collection('x').doc('y');
  await ref.set({ n: { q: 3 }, b: 2 }, { merge: true });
  assert.deepEqual(fake.dump()['x/y'], { a: 1, n: { p: 1, q: 3 }, b: 2 });
  await ref.set({ z: 1 });
  assert.deepEqual(fake.dump()['x/y'], { z: 1 });
});

test('update rejeita documento inexistente e trata chave com ponto como caminho', async () => {
  const fake = criarFakeFirestore({ seed: { 'x/y': { a: { b: 1 } } } });
  await assert.rejects(fake.collection('x').doc('nao').update({ a: 1 }), /NOT_FOUND/);
  await fake.collection('x').doc('y').update({ 'a.c': 2 });
  assert.deepEqual(fake.dump()['x/y'], { a: { b: 1, c: 2 } });
});

test('delete remove o documento', async () => {
  const fake = criarFakeFirestore({ seed: { 'x/y': { a: 1 } } });
  await fake.collection('x').doc('y').delete();
  assert.deepEqual(fake.dump(), {});
});

test('valores undefined e não serializáveis são recusados como no Firestore', async () => {
  const fake = criarFakeFirestore();
  const ref = fake.collection('x').doc('y');
  await assert.rejects(ref.set({ a: undefined }), /undefined/);
  await assert.rejects(ref.set({ a: Promise.resolve(1) }), /Unsupported/);
  await assert.rejects(fake.collection('x').add({ a: { b: undefined } }), /undefined/);
  assert.deepEqual(fake.dump(), {});
});

test('add gera ids automáticos distintos e doc() sem id também', async () => {
  const fake = criarFakeFirestore();
  const r1 = await fake.collection('auditoria').add({ n: 1 });
  const r2 = await fake.collection('auditoria').add({ n: 2 });
  assert.notEqual(r1.id, r2.id);
  assert.notEqual(fake.collection('auditoria').doc().id, fake.collection('auditoria').doc().id);
  assert.equal(Object.keys(fake.dump()).length, 2);
});

test('orderBy e limit funcionam em subcoleções', async () => {
  const fake = criarFakeFirestore();
  const col = fake.collection('logs').doc('membros').collection('entradas');
  await col.add({ timestamp: '2026-01-01T00:00:00.000Z', n: 1 });
  await col.add({ timestamp: '2026-01-03T00:00:00.000Z', n: 3 });
  await col.add({ timestamp: '2026-01-02T00:00:00.000Z', n: 2 });
  await fake.collection('logs').doc('gerencia').collection('entradas').add({ timestamp: '2026-02-01T00:00:00.000Z', n: 9 });

  const desc = await col.orderBy('timestamp', 'desc').limit(2).get();
  assert.deepEqual(desc.docs.map((d) => d.data().n), [3, 2]);
  assert.equal(desc.size, 2);
  assert.equal(desc.empty, false);

  const asc = await col.orderBy('timestamp').get();
  assert.deepEqual(asc.docs.map((d) => d.data().n), [1, 2, 3]);

  const vazio = await fake.collection('nada').get();
  assert.equal(vazio.empty, true);
});

test('FieldValue.increment, delete e serverTimestamp', async () => {
  const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { sujo: 10, tmp: 1 } } });
  const ref = fake.collection('caixa').doc('saldo');
  await ref.update({ sujo: fake.FieldValue.increment(5), limpo: fake.FieldValue.increment(2), tmp: fake.FieldValue.delete() });
  await ref.set({ em: fake.FieldValue.serverTimestamp() }, { merge: true });
  const dados = fake.dump()['caixa/saldo'];
  assert.equal(dados.sujo, 15);
  assert.equal(dados.limpo, 2);
  assert.equal('tmp' in dados, false);
  assert.equal(typeof dados.em, 'string');
});

test('ler-alterar-gravar ingênuo fora de transação perde atualização em Promise.all', async () => {
  const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { sujo: 0 } } });
  const ref = fake.collection('caixa').doc('saldo');
  const somar = async (n) => {
    const atual = (await ref.get()).data().sujo;
    await ref.set({ sujo: atual + n });
  };
  await Promise.all([somar(5), somar(7)]);
  assert.notEqual(fake.dump()['caixa/saldo'].sujo, 12);
});

test('runTransaction em paralelo preserva todas as atualizações (fila)', async () => {
  const fake = criarFakeFirestore({ seed: { 'caixa/saldo': { sujo: 0 } } });
  const ref = fake.collection('caixa').doc('saldo');
  const somar = (n) => fake.runTransaction(async (tx) => {
    const atual = (await tx.get(ref)).data().sujo;
    tx.set(ref, { sujo: atual + n });
    return atual + n;
  });
  const retornos = await Promise.all([somar(5), somar(7)]);
  assert.deepEqual(retornos, [5, 12]);
  assert.equal(fake.dump()['caixa/saldo'].sujo, 12);
});

test('transação que lança não aplica nada e propaga o mesmo erro', async () => {
  const fake = criarFakeFirestore({ seed: { 'a/b': { v: 1 } } });
  const erro = new Error('falhou');
  await assert.rejects(
    fake.runTransaction((tx) => {
      tx.set(fake.collection('a').doc('b'), { v: 2 });
      throw erro;
    }),
    (e) => e === erro
  );
  assert.equal(fake.dump()['a/b'].v, 1);
  assert.equal(await fake.runTransaction(() => 'ok'), 'ok');
});

test('tx.get depois de uma escrita lança', async () => {
  const fake = criarFakeFirestore({ seed: { 'a/b': { v: 1 } } });
  const ref = fake.collection('a').doc('b');
  await assert.rejects(
    fake.runTransaction(async (tx) => {
      tx.set(ref, { v: 2 });
      await tx.get(ref);
    }),
    /reads to be executed before all writes/
  );
  assert.equal(fake.dump()['a/b'].v, 1);
});

test('tx.get aceita consultas e tx suporta update, delete e create', async () => {
  const fake = criarFakeFirestore({ seed: { 'a/b': { v: 1 }, 'a/c': { v: 2 } } });
  await fake.runTransaction(async (tx) => {
    const lista = await tx.get(fake.collection('a').orderBy('v', 'desc').limit(1));
    assert.equal(lista.docs[0].id, 'c');
    tx.update(fake.collection('a').doc('b'), { v: 10 });
    tx.delete(fake.collection('a').doc('c'));
    tx.create(fake.collection('a').doc('d'), { v: 4 });
  });
  assert.deepEqual(fake.dump(), { 'a/b': { v: 10 }, 'a/d': { v: 4 } });
  await assert.rejects(
    fake.runTransaction((tx) => {
      tx.set(fake.collection('a').doc('novo'), { v: 1 });
      tx.create(fake.collection('a').doc('b'), { v: 1 });
    }),
    /ALREADY_EXISTS/
  );
  assert.equal('a/novo' in fake.dump(), false);
});

test('falharProximoCommit rejeita a próxima transação sem aplicar e só uma vez', async () => {
  const fake = criarFakeFirestore({ seed: { 'a/b': { v: 1 } } });
  const erro = new Error('commit caiu');
  fake.falharProximoCommit(erro);
  await assert.rejects(
    fake.runTransaction((tx) => tx.set(fake.collection('a').doc('b'), { v: 2 })),
    (e) => e === erro
  );
  assert.equal(fake.dump()['a/b'].v, 1);
  await fake.runTransaction((tx) => tx.set(fake.collection('a').doc('b'), { v: 3 }));
  assert.equal(fake.dump()['a/b'].v, 3);
});

test('falharEm falha a operação que casa com o caminho, uma vez', async () => {
  const fake = criarFakeFirestore({ seed: { 'a/b': { v: 1 } } });
  const erro = new Error('sem rede');
  fake.falharEm('get', /^a\/b$/, erro);
  await assert.rejects(fake.collection('a').doc('b').get(), (e) => e === erro);
  assert.equal((await fake.collection('a').doc('b').get()).exists, true);

  fake.falharEm('add', /^auditoria\//, erro);
  await assert.rejects(fake.collection('auditoria').add({ n: 1 }), (e) => e === erro);
  assert.deepEqual(fake.dump(), { 'a/b': { v: 1 } });

  fake.falharEm('set', /^a\/b$/, erro);
  await assert.rejects(
    fake.runTransaction((tx) => tx.set(fake.collection('a').doc('b'), { v: 5 })),
    (e) => e === erro
  );
  assert.equal(fake.dump()['a/b'].v, 1);
});

test('chamadas registram operação, caminho e se foi em transação, com seq no registro compartilhado', async () => {
  const registro = [{ seq: 1, origem: 'interaction', metodo: 'deferReply' }];
  const fake = criarFakeFirestore({ registro });
  await fake.collection('a').doc('b').set({ v: 1 });
  await fake.runTransaction(async (tx) => {
    await tx.get(fake.collection('a').doc('b'));
    tx.update(fake.collection('a').doc('b'), { v: 2 });
  });

  assert.deepEqual(
    fake.chamadas.map(({ origem, op, caminho, emTransacao }) => ({ origem, op, caminho, emTransacao })),
    [
      { origem: 'db', op: 'set', caminho: 'a/b', emTransacao: false },
      { origem: 'db', op: 'get', caminho: 'a/b', emTransacao: true },
      { origem: 'db', op: 'update', caminho: 'a/b', emTransacao: true }
    ]
  );
  assert.deepEqual(fake.chamadas.map((c) => c.seq), [2, 3, 4]);
  assert.equal(registro.length, 4);
});
