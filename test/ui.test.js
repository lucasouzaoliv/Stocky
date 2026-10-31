'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../utils/ui');

const { Primary, Secondary, Success, Danger } = ButtonStyle;

function botoes(row) {
  return row.toJSON().components.map((c) => [c.custom_id, c.label, c.style]);
}

function checarLimitesRow(row) {
  const json = row.toJSON();
  assert.ok(json.components.length >= 1 && json.components.length <= 5, 'até 5 botões por linha');
  for (const c of json.components) {
    assert.ok(c.custom_id.length <= 100, `custom_id > 100: ${c.custom_id}`);
    assert.ok(c.label.length <= 80, `label > 80: ${c.label}`);
  }
  const ids = json.components.map((c) => c.custom_id);
  assert.equal(new Set(ids).size, ids.length, 'custom_ids únicos na linha');
}

function checarLimitesEmbed(embed) {
  const e = embed.toJSON();
  assert.ok((e.title || '').length <= 256);
  assert.ok((e.description || '').length <= 4096);
  assert.ok((e.fields || []).length <= 25);
  for (const f of e.fields || []) {
    assert.ok(f.name.length > 0 && f.name.length <= 256);
    assert.ok(f.value.length > 0 && f.value.length <= 1024, `campo "${f.name}" fora do limite`);
  }
  assert.ok(e.footer.text.length <= 2048);
  const total = (e.title || '').length + (e.description || '').length + e.footer.text.length +
    (e.fields || []).reduce((s, f) => s + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `embed com ${total} caracteres`);
  const tudo = JSON.stringify(e);
  assert.ok(!tudo.includes('undefined'), 'embed contém "undefined"');
  assert.ok(!tudo.includes('NaN'), 'embed contém "NaN"');
  assert.ok(!tudo.includes('[object'), 'embed contém "[object"');
}

test('ui.js não faz require de config', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'utils', 'ui.js'), 'utf8');
  assert.ok(!/require\([^)]*config/.test(fonte));
});

test('respostaEfemera adiciona flags Ephemeral sem perder o payload nem mutar', () => {
  const original = { content: 'oi' };
  const r = ui.respostaEfemera(original);
  assert.deepEqual(r, { content: 'oi', flags: MessageFlags.Ephemeral });
  assert.equal(original.flags, undefined);
  assert.deepEqual(ui.respostaEfemera(), { flags: MessageFlags.Ephemeral });
});

test('formatarDinheiro usa separador pt-BR', () => {
  assert.equal(ui.formatarDinheiro(0), '$0');
  assert.equal(ui.formatarDinheiro(999), '$999');
  assert.equal(ui.formatarDinheiro(1000), '$1.000');
  assert.equal(ui.formatarDinheiro(1500), '$1.500');
  assert.equal(ui.formatarDinheiro(1234567), '$1.234.567');
  assert.equal(ui.formatarDinheiro(1000000000), '$1.000.000.000');
  assert.equal(ui.formatarDinheiro(-2500), '-$2.500');
});

test('formatarDinheiro nunca devolve undefined/NaN', () => {
  for (const v of [undefined, null, NaN, 'abc', Infinity]) {
    assert.equal(ui.formatarDinheiro(v), '$0');
  }
  assert.equal(ui.formatarDinheiro('1500'), '$1.500');
});

test('rowMenuBau: ids, rótulos e estilos', () => {
  assert.deepEqual(botoes(ui.rowMenuBau('membros')), [
    ['bau_adicionar:membros', '📥 Adicionar', Success],
    ['bau_remover:membros', '📤 Remover', Danger],
    ['bau_estoque:membros', '📋 Ver Estoque', Primary]
  ]);
  assert.deepEqual(botoes(ui.rowMenuBau('gerencia')).map((b) => b[0]), [
    'bau_adicionar:gerencia', 'bau_remover:gerencia', 'bau_estoque:gerencia'
  ]);
  checarLimitesRow(ui.rowMenuBau('membros'));
});

test('rowCancelarBau', () => {
  assert.deepEqual(botoes(ui.rowCancelarBau('gerencia')), [['bau_cancelar:gerencia', '❌ Cancelar', Secondary]]);
  checarLimitesRow(ui.rowCancelarBau('membros'));
});

test('rowMenuGerencia', () => {
  assert.deepEqual(botoes(ui.rowMenuGerencia()), [
    ['ger_adicionar_item', '➕ Adicionar Item', Success],
    ['ger_remover_item', '➖ Remover Item', Danger],
    ['ger_zerar_bau', '🗑️ Zerar Baú', Secondary],
    ['ger_ver_logs', '📋 Ver Logs', Primary]
  ]);
  checarLimitesRow(ui.rowMenuGerencia());
});

test('rowMenuGerencia2', () => {
  assert.deepEqual(botoes(ui.rowMenuGerencia2()), [
    ['ger_ajustar_membros', '📝 Ajustar Baú Membros', Secondary],
    ['ger_ajustar_gerencia', '📝 Ajustar Baú Gerência', Secondary]
  ]);
  checarLimitesRow(ui.rowMenuGerencia2());
});

test('rowsPainelGerencia devolve as duas linhas, ids distintos e sem passar de 5 linhas', () => {
  const rows = ui.rowsPainelGerencia();
  assert.equal(rows.length, 2);
  assert.deepEqual(botoes(rows[0]), botoes(ui.rowMenuGerencia()));
  assert.deepEqual(botoes(rows[1]), botoes(ui.rowMenuGerencia2()));
  const ids = rows.flatMap((r) => r.toJSON().components.map((c) => c.custom_id));
  assert.equal(new Set(ids).size, ids.length);
  assert.notEqual(ui.rowsPainelGerencia()[0], rows[0], 'cada chamada cria linhas novas');
});

test('rowCancelarGerencia', () => {
  assert.deepEqual(botoes(ui.rowCancelarGerencia()), [['ger_cancelar', '❌ Cancelar', Secondary]]);
});

test('rowCaixa', () => {
  assert.deepEqual(botoes(ui.rowCaixa()), [
    ['caixa_adicionar', '➕ Adicionar', Success],
    ['caixa_retirar', '➖ Retirar', Danger],
    ['caixa_logs', '📋 Ver Histórico', Primary]
  ]);
  checarLimitesRow(ui.rowCaixa());
});

test('rowConfirmarAjuste: ids com o pendenteId, estilos e limites', () => {
  assert.deepEqual(botoes(ui.rowConfirmarAjuste('a1b2c3d4')), [
    ['ger_ajuste_confirmar:a1b2c3d4', '✅ Confirmar', Success],
    ['ger_ajuste_cancelar:a1b2c3d4', '❌ Cancelar', Secondary]
  ]);
  checarLimitesRow(ui.rowConfirmarAjuste('a1b2c3d4'));
});

test('ids base das linhas usam ":" só para separar argumentos', () => {
  const rows = [ui.rowMenuBau('membros'), ui.rowCancelarBau('membros'), ui.rowConfirmarAjuste('x'),
    ui.rowMenuGerencia(), ui.rowMenuGerencia2(), ui.rowCancelarGerencia(), ui.rowCaixa()];
  for (const row of rows) {
    for (const c of row.toJSON().components) {
      assert.match(c.custom_id, /^[a-z_]+(:[a-z0-9]+)?$/);
    }
  }
});

test('embedCaixa mostra saldo formatado', () => {
  const e = ui.embedCaixa({ sujo: 1500, limpo: 300 }).toJSON();
  assert.equal(e.title, '💰 Caixa da Gangue');
  assert.deepEqual(e.fields.map((f) => [f.name, f.value, f.inline]), [
    ['🖤 Dinheiro Sujo', '$1.500', true],
    ['💵 Dinheiro Limpo', '$300', true]
  ]);
  checarLimitesEmbed(ui.embedCaixa({ sujo: 1500, limpo: 300 }));
});

test('embedCaixa aceita campos ausentes e saldo nulo', () => {
  for (const entrada of [{}, undefined, null, { sujo: 10 }, { limpo: 5 }, { sujo: undefined, limpo: NaN }]) {
    const embed = ui.embedCaixa(entrada);
    checarLimitesEmbed(embed);
  }
  const e = ui.embedCaixa({}).toJSON();
  assert.equal(e.fields[0].value, '$0');
  assert.equal(e.fields[1].value, '$0');
  assert.equal(ui.embedCaixa({ sujo: 10 }).toJSON().fields[1].value, '$0');
});

test('embedLogCaixa: entrada e saída', () => {
  const entrada = ui.embedLogCaixa('adicionar', { id: '42', tag: 'a#1' }, 'sujo', 50000, 'Venda', { sujo: 60000, limpo: 1000 });
  const e = entrada.toJSON();
  assert.equal(e.title, '➕ Entrada no Caixa');
  assert.equal(e.color, 0x2ECC71);
  assert.deepEqual(e.fields.map((f) => [f.name, f.value]), [
    ['👤 Responsável', '<@42> — a#1'],
    ['💰 Tipo', '🖤 Dinheiro Sujo'],
    ['➕ Valor Adicionado', '$50.000'],
    ['📝 Anotação', 'Venda'],
    ['🖤 Saldo Sujo', '$60.000'],
    ['💵 Saldo Limpo', '$1.000']
  ]);
  checarLimitesEmbed(entrada);

  const saida = ui.embedLogCaixa('retirar', { id: '42', tag: 'a#1' }, 'limpo', 200, 'Compra', { sujo: 0, limpo: 800 }).toJSON();
  assert.equal(saida.title, '➖ Saída do Caixa');
  assert.equal(saida.color, 0xE74C3C);
  assert.equal(saida.fields[1].value, '💵 Dinheiro Limpo');
  assert.equal(saida.fields[2].name, '➖ Valor Retirado');
});

test('embedLogCaixa respeita 1024 no campo e não deixa campo vazio nem saldo ausente', () => {
  const longo = ui.embedLogCaixa('adicionar', { id: '1', tag: 't' }, 'sujo', 1, 'x'.repeat(5000), { sujo: 1, limpo: 1 });
  checarLimitesEmbed(longo);
  assert.equal(longo.toJSON().fields[3].value.length, 1024);

  const vazio = ui.embedLogCaixa('adicionar', { id: '1', tag: 't' }, 'sujo', 1, '', undefined);
  checarLimitesEmbed(vazio);
  assert.equal(vazio.toJSON().fields[3].value, '—');
});

test('embedHistoricoCaixa lista movimentações', () => {
  const logs = [
    { acao: 'adicionar', tipo: 'sujo', valor: 1500, anotacao: 'Venda', usuarioId: '7', timestamp: '2026-10-31T12:00:00.000Z' },
    { acao: 'retirar', tipo: 'limpo', valor: 300, anotacao: 'Compra', usuarioId: '8', timestamp: '2026-10-31T13:00:00.000Z' }
  ];
  const embed = ui.embedHistoricoCaixa(logs);
  const e = embed.toJSON();
  assert.equal(e.title, '📋 Histórico do Caixa');
  const linhas = e.description.split('\n');
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /^➕ \*\*\$1\.500\*\* 🖤 Sujo — Venda — <@7> — /);
  assert.match(linhas[1], /^➖ \*\*\$300\*\* 💵 Limpo — Compra — <@8> — /);
  checarLimitesEmbed(embed);
});

test('embedHistoricoCaixa: vazio, entrada inválida e timestamp ruim', () => {
  assert.match(ui.embedHistoricoCaixa([]).toJSON().description, /Nenhuma movimentação/);
  assert.match(ui.embedHistoricoCaixa(undefined).toJSON().description, /Nenhuma movimentação/);
  const ruim = ui.embedHistoricoCaixa([{ acao: 'adicionar', tipo: 'sujo', valor: 1, anotacao: 'a', usuarioId: '1', timestamp: 'lixo' }]);
  assert.match(ruim.toJSON().description, /data desconhecida/);
  checarLimitesEmbed(ruim);
});

test('embedHistoricoCaixa trunca a descrição em 4096 com "… e mais N"', () => {
  const logs = Array.from({ length: 200 }, (_, i) => ({
    acao: 'adicionar', tipo: 'sujo', valor: i + 1, anotacao: 'a'.repeat(100), usuarioId: '123456789012345678', timestamp: '2026-10-31T12:00:00.000Z'
  }));
  const embed = ui.embedHistoricoCaixa(logs);
  const d = embed.toJSON().description;
  assert.ok(d.length <= 4096);
  assert.match(d, /… e mais \d+$/);
  checarLimitesEmbed(embed);
});

test('embedLogsBau lista movimentações com título por tipo', () => {
  const logs = [
    { acao: 'adicionar', item: { nome: 'Pistola' }, quantidade: 3, usuarioId: '9', timestamp: '2026-10-31T12:00:00.000Z' },
    { acao: 'remover', item: { nome: 'Gaze' }, quantidade: 10, usuarioId: '9', timestamp: '2026-10-31T12:05:00.000Z' }
  ];
  const membros = ui.embedLogsBau('membros', logs);
  assert.match(membros.toJSON().title, /Bau dos Membros/);
  assert.match(ui.embedLogsBau('gerencia', logs).toJSON().title, /Bau da Gerencia/);
  const linhas = membros.toJSON().description.split('\n');
  assert.match(linhas[0], /^📥 \*\*Pistola\*\* x3 — <@9> — /);
  assert.match(linhas[1], /^📤 \*\*Gaze\*\* x10 — <@9> — /);
  checarLimitesEmbed(membros);
});

test('embedLogsBau: vazio, log sem item e muitos logs', () => {
  assert.match(ui.embedLogsBau('membros', []).toJSON().description, /Nenhuma movimentação/);
  const semItem = ui.embedLogsBau('membros', [{ acao: 'remover', quantidade: 1, usuarioId: '1', timestamp: '2026-10-31T12:00:00.000Z' }]);
  assert.match(semItem.toJSON().description, /Item removido/);
  checarLimitesEmbed(semItem);

  const muitos = Array.from({ length: 500 }, () => ({
    acao: 'adicionar', item: { nome: 'N'.repeat(50) }, quantidade: 100000, usuarioId: '123456789012345678', timestamp: '2026-10-31T12:00:00.000Z'
  }));
  const embed = ui.embedLogsBau('gerencia', muitos);
  assert.ok(embed.toJSON().description.length <= 4096);
  assert.match(embed.toJSON().description, /… e mais \d+$/);
  checarLimitesEmbed(embed);
});

test('embedResumoAjuste mostra antes e depois e marca remoção', () => {
  const embed = ui.embedResumoAjuste('membros', [
    { nome: 'Pistola: .50', categoria: 'Armas', antes: 2, depois: 5 },
    { nome: 'Gaze', categoria: 'Medicina', antes: 10, depois: 0 }
  ]);
  const e = embed.toJSON();
  assert.match(e.title, /Baú Membros/);
  assert.match(ui.embedResumoAjuste('gerencia', []).toJSON().title, /Baú Gerência/);
  const linhas = e.description.split('\n');
  assert.equal(linhas[0], '**Pistola: .50** (Armas): `2` → `5`');
  assert.equal(linhas[1], '**Gaze** (Medicina): `10` → `0` (remove)');
  checarLimitesEmbed(embed);
});

test('embedResumoAjuste vazio e truncado em 4096 com "… e mais N"', () => {
  assert.match(ui.embedResumoAjuste('membros', []).toJSON().description, /Nenhuma alteração/);
  assert.match(ui.embedResumoAjuste('membros', undefined).toJSON().description, /Nenhuma alteração/);

  const linhas = Array.from({ length: 200 }, (_, i) => ({ nome: `Item ${i} ${'x'.repeat(40)}`, categoria: 'Categoria Longa', antes: i, depois: i + 1 }));
  const embed = ui.embedResumoAjuste('gerencia', linhas);
  const d = embed.toJSON().description;
  assert.ok(d.length <= 4096);
  const [, restantes] = d.match(/… e mais (\d+)$/);
  const mostradas = d.split('\n').length - 1;
  assert.equal(mostradas + Number(restantes), 200);
  checarLimitesEmbed(embed);
});

test('todos os rows e embeds são construídos novos a cada chamada', () => {
  assert.notEqual(ui.rowCaixa(), ui.rowCaixa());
  assert.notEqual(ui.embedCaixa({}), ui.embedCaixa({}));
});
