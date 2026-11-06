const test = require('node:test');
const assert = require('node:assert/strict');
const { criarFakeFirestore } = require('./helpers/fake-firestore');
const { setDb, resetDb } = require('../utils/firebase');
const { zerarBau, removerItemDoCatalogo, ajustarBauEmMassa, getAuditoria, getBau } = require('../utils/db');
const { ErroValidacao } = require('../utils/validacao');

const usuario = { id: 'u1', tag: 'gerente#0001' };
const item = (nome, categoriaId, quantidade, categoria = categoriaId) => ({ nome, categoria, categoriaId, quantidade });

const catalogo = () => ({
  medicamentos: { nome: 'Medicamentos', emoji: 'x', items: [{ id: 'gaze', nome: 'Gaze' }, { id: 'bandagem', nome: 'Bandagem' }] },
  armas: { nome: 'Armas', emoji: 'y', items: [{ id: 'colt', nome: 'Colt' }] }
});

const semente = () => ({
  'catalogo/items': catalogo(),
  'bau/membros': { medicamentos__gaze: item('Gaze', 'medicamentos', 10, 'Medicamentos'), armas__colt: item('Colt', 'armas', 2, 'Armas') },
  'bau/gerencia': { medicamentos__gaze: item('Gaze', 'medicamentos', 3, 'Medicamentos') }
});

let fake;
function criarBase(seed = semente()) {
  fake = criarFakeFirestore({ seed });
  setDb(fake);
}

const auditorias = () => Object.entries(fake.dump()).filter(([c]) => c.startsWith('auditoria/')).map(([, d]) => d);

test.afterEach(() => resetDb());

// ─── removerItemDoCatalogo ───

test('removerItemDoCatalogo remove do catálogo e dos dois baús e grava 1 auditoria no formato da ADR-10', async () => {
  criarBase();
  const r = await removerItemDoCatalogo('medicamentos', 'gaze', usuario);
  assert.deepEqual(r, { sucesso: true, removidoDe: { membros: 10, gerencia: 3 } });
  const dump = fake.dump();
  assert.deepEqual(dump['catalogo/items'].medicamentos.items, [{ id: 'bandagem', nome: 'Bandagem' }]);
  assert.equal(dump['bau/membros'].medicamentos__gaze, undefined);
  assert.ok(dump['bau/membros'].armas__colt);
  assert.deepEqual(dump['bau/gerencia'], {});
  const [a, ...resto] = auditorias();
  assert.equal(resto.length, 0);
  assert.deepEqual(Object.keys(a).sort(), ['acao', 'alvo', 'antes', 'depois', 'timestamp', 'usuarioId', 'usuarioTag']);
  assert.equal(a.acao, 'catalogo.remover_item');
  assert.equal(a.usuarioId, 'u1');
  assert.equal(a.usuarioTag, 'gerente#0001');
  assert.equal(new Date(a.timestamp).toISOString(), a.timestamp);
  assert.deepEqual(a.alvo, { categoriaId: 'medicamentos', itemId: 'gaze', nomeItem: 'Gaze' });
  assert.deepEqual(a.antes, { catalogo: { id: 'gaze', nome: 'Gaze' }, membros: 10, gerencia: 3 });
  assert.equal(a.depois, null);
});

test('removerItemDoCatalogo: item que não estava em um baú registra 0 nele', async () => {
  criarBase();
  const r = await removerItemDoCatalogo('armas', 'colt', usuario);
  assert.deepEqual(r.removidoDe, { membros: 2, gerencia: 0 });
  assert.equal(auditorias()[0].antes.gerencia, 0);
});

test('removerItemDoCatalogo: transação que falha no commit não persiste dado nem auditoria', async () => {
  criarBase();
  const antes = fake.dump();
  fake.falharProximoCommit(new Error('commit falhou'));
  await assert.rejects(removerItemDoCatalogo('medicamentos', 'gaze', usuario), /commit falhou/);
  assert.deepEqual(fake.dump(), antes);
  assert.equal(auditorias().length, 0);
});

test('removerItemDoCatalogo: falha injetada na escrita da auditoria desfaz catálogo e baús', async () => {
  criarBase();
  const antes = fake.dump();
  fake.falharEm('set', /^auditoria\//, new Error('auditoria falhou'));
  await assert.rejects(removerItemDoCatalogo('medicamentos', 'gaze', usuario), /auditoria falhou/);
  assert.deepEqual(fake.dump(), antes);
});

test('removerItemDoCatalogo: falha injetada na escrita do baú desfaz a auditoria e o catálogo', async () => {
  criarBase();
  const antes = fake.dump();
  fake.falharEm('set', /^bau\/gerencia$/, new Error('bau falhou'));
  await assert.rejects(removerItemDoCatalogo('medicamentos', 'gaze', usuario), /bau falhou/);
  assert.deepEqual(fake.dump(), antes);
  assert.equal(auditorias().length, 0);
});

test('removerItemDoCatalogo: categoria ou item inexistente retorna erro tratável sem gravar nada', async () => {
  criarBase();
  const antes = fake.dump();
  const r1 = await removerItemDoCatalogo('nada', 'gaze', usuario);
  const r2 = await removerItemDoCatalogo('medicamentos', 'nada', usuario);
  assert.equal(r1.sucesso, false);
  assert.equal(r2.sucesso, false);
  assert.match(r1.motivo, /Categoria/);
  assert.match(r2.motivo, /Item/);
  assert.deepEqual(fake.dump(), antes);
});

test('removerItemDoCatalogo: toda escrita é feita dentro de transação', async () => {
  criarBase();
  await removerItemDoCatalogo('medicamentos', 'gaze', usuario);
  const escritas = fake.chamadas.filter((c) => ['set', 'update', 'delete', 'add'].includes(c.op));
  assert.ok(escritas.length >= 3);
  assert.ok(escritas.every((c) => c.emTransacao));
});

test('removerItemDoCatalogo: usuário ausente lança ErroValidacao sem gravar', async () => {
  criarBase();
  const antes = fake.dump();
  for (const u of [undefined, null, {}, { id: '' }, { tag: 'x' }]) {
    await assert.rejects(removerItemDoCatalogo('medicamentos', 'gaze', u), ErroValidacao);
  }
  assert.deepEqual(fake.dump(), antes);
});

test('removerItemDoCatalogo: dois removes simultâneos do mesmo item gravam uma única auditoria', async () => {
  criarBase();
  const rs = await Promise.all([
    removerItemDoCatalogo('medicamentos', 'gaze', usuario),
    removerItemDoCatalogo('medicamentos', 'gaze', usuario)
  ]);
  assert.deepEqual(rs.map((r) => r.sucesso).sort(), [false, true]);
  assert.equal(auditorias().length, 1);
});

// ─── zerarBau ───

test('zerarBau zera só o baú indicado e audita as quantidades anteriores', async () => {
  criarBase();
  const r = await zerarBau('membros', usuario);
  assert.deepEqual(r, { sucesso: true, tipos: ['membros'] });
  const dump = fake.dump();
  assert.deepEqual(dump['bau/membros'], {});
  assert.equal(dump['bau/gerencia'].medicamentos__gaze.quantidade, 3);
  const [a, ...resto] = auditorias();
  assert.equal(resto.length, 0);
  assert.equal(a.acao, 'bau.zerar');
  assert.deepEqual(a.alvo, { tipos: ['membros'] });
  assert.deepEqual(a.antes, { membros: { medicamentos__gaze: 10, armas__colt: 2 } });
  assert.deepEqual(a.depois, { membros: {} });
  assert.equal(a.usuarioId, 'u1');
});

test("zerarBau('ambos') zera os dois baús numa única transação com uma única auditoria", async () => {
  criarBase();
  const r = await zerarBau('ambos', usuario);
  assert.deepEqual(r, { sucesso: true, tipos: ['membros', 'gerencia'] });
  const dump = fake.dump();
  assert.deepEqual(dump['bau/membros'], {});
  assert.deepEqual(dump['bau/gerencia'], {});
  const [a, ...resto] = auditorias();
  assert.equal(resto.length, 0);
  assert.deepEqual(a.alvo, { tipos: ['membros', 'gerencia'] });
  assert.deepEqual(a.antes.gerencia, { medicamentos__gaze: 3 });
  assert.deepEqual(a.depois, { membros: {}, gerencia: {} });
  const escritas = fake.chamadas.filter((c) => c.op === 'set');
  assert.equal(escritas.length, 3);
  assert.ok(escritas.every((c) => c.emTransacao));
});

test('zerarBau: transação que falha não zera nenhum baú nem grava auditoria', async () => {
  criarBase();
  const antes = fake.dump();
  fake.falharEm('set', /^auditoria\//, new Error('boom'));
  await assert.rejects(zerarBau('ambos', usuario), /boom/);
  assert.deepEqual(fake.dump(), antes);
  fake.falharProximoCommit(new Error('commit'));
  await assert.rejects(zerarBau('membros', usuario), /commit/);
  assert.deepEqual(fake.dump(), antes);
});

test('zerarBau: tipo inválido ou usuário ausente lança ErroValidacao sem gravar', async () => {
  criarBase();
  const antes = fake.dump();
  await assert.rejects(zerarBau('xyz', usuario), ErroValidacao);
  await assert.rejects(zerarBau(undefined, usuario), ErroValidacao);
  await assert.rejects(zerarBau('membros'), ErroValidacao);
  await assert.rejects(zerarBau('ambos', {}), ErroValidacao);
  assert.deepEqual(fake.dump(), antes);
});

test('zerarBau em baú inexistente funciona e audita antes vazio', async () => {
  criarBase({});
  await zerarBau('gerencia', usuario);
  assert.deepEqual(auditorias()[0].antes, { gerencia: {} });
});

// ─── ajustarBauEmMassa ───

test('ajustarBauEmMassa aplica tudo e audita só as chaves alteradas (antes e depois)', async () => {
  criarBase();
  const r = await ajustarBauEmMassa('membros', [
    { categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 4 },
    { categoriaId: 'armas', itemId: 'colt', quantidade: 0 },
    { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 7 }
  ], usuario);
  assert.deepEqual(r, { sucesso: true, alterados: 3 });
  const bau = fake.dump()['bau/membros'];
  assert.equal(bau.medicamentos__gaze.quantidade, 4);
  assert.equal(bau.armas__colt, undefined);
  assert.deepEqual(bau.medicamentos__bandagem, { nome: 'Bandagem', categoria: 'Medicamentos', categoriaId: 'medicamentos', quantidade: 7 });
  const [a, ...resto] = auditorias();
  assert.equal(resto.length, 0);
  assert.equal(a.acao, 'bau.ajuste_massa');
  assert.deepEqual(a.alvo, { tipo: 'membros' });
  assert.deepEqual(a.antes, { medicamentos__gaze: 10, armas__colt: 2, medicamentos__bandagem: 0 });
  assert.deepEqual(a.depois, { medicamentos__gaze: 4, armas__colt: 0, medicamentos__bandagem: 7 });
  assert.equal(a.usuarioId, 'u1');
});

test('ajustarBauEmMassa: itens fora da lista e itens com valor igual ficam como estão e não entram na auditoria', async () => {
  criarBase();
  const r = await ajustarBauEmMassa('membros', [
    { categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 10 },
    { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 0 }
  ], usuario);
  assert.deepEqual(r, { sucesso: true, alterados: 0 });
  assert.equal(auditorias().length, 0);
  assert.deepEqual(fake.dump()['bau/membros'], semente()['bau/membros']);
  const r2 = await ajustarBauEmMassa('membros', [{ categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 11 }], usuario);
  assert.equal(r2.alterados, 1);
  assert.deepEqual(auditorias()[0].antes, { medicamentos__gaze: 10 });
  assert.ok(fake.dump()['bau/membros'].armas__colt);
});

test('ajustarBauEmMassa: um item inexistente no catálogo recusa tudo e não altera nem audita', async () => {
  criarBase();
  const antes = fake.dump();
  const r = await ajustarBauEmMassa('membros', [
    { categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 1 },
    { categoriaId: 'medicamentos', itemId: 'fantasma', quantidade: 5 }
  ], usuario);
  assert.equal(r.sucesso, false);
  assert.equal(r.invalidos.length, 1);
  assert.equal(r.invalidos[0].itemId, 'fantasma');
  assert.deepEqual(fake.dump(), antes);
});

test('ajustarBauEmMassa: quantidade inválida, chave repetida, lista vazia e acima do limite de linhas recusam tudo', async () => {
  criarBase();
  const antes = fake.dump();
  const g = (quantidade) => ({ categoriaId: 'medicamentos', itemId: 'gaze', quantidade });
  for (const q of [-1, 1.5, '5', 100001, NaN, undefined]) {
    const r = await ajustarBauEmMassa('membros', [g(q)], usuario);
    assert.equal(r.sucesso, false, `quantidade ${q}`);
    assert.equal(r.invalidos.length, 1);
  }
  const rep = await ajustarBauEmMassa('membros', [g(1), g(2)], usuario);
  assert.equal(rep.sucesso, false);
  assert.equal((await ajustarBauEmMassa('membros', [], usuario)).sucesso, false);
  assert.equal((await ajustarBauEmMassa('membros', null, usuario)).sucesso, false);
  const muitas = Array.from({ length: 201 }, (_, i) => ({ categoriaId: 'medicamentos', itemId: `i${i}`, quantidade: 1 }));
  assert.equal((await ajustarBauEmMassa('membros', muitas, usuario)).sucesso, false);
  assert.deepEqual(fake.dump(), antes);
});

test('ajustarBauEmMassa: quantidade máxima exata é aceita', async () => {
  criarBase();
  const r = await ajustarBauEmMassa('membros', [{ categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 100000 }], usuario);
  assert.equal(r.sucesso, true);
});

test('ajustarBauEmMassa: transação que falha não persiste o baú nem a auditoria', async () => {
  criarBase();
  const antes = fake.dump();
  const mudancas = [{ categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 1 }];
  fake.falharEm('set', /^auditoria\//, new Error('boom'));
  await assert.rejects(ajustarBauEmMassa('membros', mudancas, usuario), /boom/);
  assert.deepEqual(fake.dump(), antes);
  fake.falharProximoCommit(new Error('commit'));
  await assert.rejects(ajustarBauEmMassa('membros', mudancas, usuario), /commit/);
  assert.deepEqual(fake.dump(), antes);
});

test('ajustarBauEmMassa: tipo inválido e usuário ausente lançam ErroValidacao', async () => {
  criarBase();
  const m = [{ categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 1 }];
  await assert.rejects(ajustarBauEmMassa('xyz', m, usuario), ErroValidacao);
  await assert.rejects(ajustarBauEmMassa('membros', m), ErroValidacao);
  await assert.rejects(ajustarBauEmMassa('membros', m, { tag: 'a' }), ErroValidacao);
  assert.equal(auditorias().length, 0);
});

test('ajustarBauEmMassa: toda escrita acontece dentro de transação', async () => {
  criarBase();
  await ajustarBauEmMassa('membros', [{ categoriaId: 'medicamentos', itemId: 'gaze', quantidade: 1 }], usuario);
  const escritas = fake.chamadas.filter((c) => ['set', 'update', 'delete', 'add'].includes(c.op));
  assert.equal(escritas.length, 2);
  assert.ok(escritas.every((c) => c.emTransacao));
});

// ─── getAuditoria ───

test('getAuditoria ordena do mais recente para o mais antigo e respeita o limite', async () => {
  criarBase({
    'auditoria/a': { acao: 'x', timestamp: '2026-01-01T00:00:00.000Z' },
    'auditoria/b': { acao: 'y', timestamp: '2026-03-01T00:00:00.000Z' },
    'auditoria/c': { acao: 'z', timestamp: '2026-02-01T00:00:00.000Z' }
  });
  assert.deepEqual((await getAuditoria()).map((a) => a.acao), ['y', 'z', 'x']);
  assert.deepEqual((await getAuditoria({ limite: 1 })).map((a) => a.acao), ['y']);
  await assert.rejects(getAuditoria({ limite: 0 }), ErroValidacao);
});

test('auditoria não afeta getBau', async () => {
  criarBase();
  await zerarBau('gerencia', usuario);
  assert.deepEqual(await getBau('gerencia'), {});
  assert.equal(Object.keys(await getBau('membros')).length, 2);
});
