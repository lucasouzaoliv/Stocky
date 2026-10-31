'use strict';

// QA: testes que REVELAM defeitos reais abertos (falham de propósito até a correção).
// Ver docs/qa-report.md, seção "Defeitos". Não apagar: viram regressão depois de corrigidos.

const test = require('node:test');
const assert = require('node:assert/strict');
const { embedLength } = require('discord.js');
const { montarAmbiente } = require('./helpers/ambiente');
const { adicionarItemAoCatalogo, getCatalogo, getCategorias } = require('../utils/db');
const { gerarTextoAjuste, interpretarAjuste } = require('../utils/ajuste-texto');
const { embedInventario } = require('../utils/embeds');

// QA-D1 (média, backend-dev): nome de item começando com "#" é aceito no cadastro e quebra
// o ajuste em massa: o texto gerado pelo próprio bot não é aceito de volta.
test('QA-D1: item cadastrado com nome iniciado por "#" faz ida e volta no ajuste em massa', async (t) => {
  const env = montarAmbiente();
  t.after(env.limpar);
  const cad = await adicionarItemAoCatalogo('armas', '#1 Especial');
  if (!cad.sucesso) return; // correção aceitável: recusar o nome no cadastro
  const bau = { [`armas__${cad.item.id}`]: { nome: cad.item.nome, categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } };
  const texto = gerarTextoAjuste(bau, await getCategorias());
  const { erros, mudancas } = interpretarAjuste(texto, await getCatalogo());
  assert.deepEqual(erros, [], `texto gerado pelo bot recusado: ${JSON.stringify(erros)}`);
  assert.equal(mudancas.length, 1);
});

// QA-D2 (baixa, frontend-dev): embedInventario respeita 1024 por campo, mas não o total de
// 6000 caracteres por embed do Discord; com o catálogo cheio e nomes longos a edição falha (50035).
test('QA-D2: embed de inventário com catálogo cheio fica dentro do limite total de 6000 caracteres', async (t) => {
  const categorias = ['medicamentos', 'armas', 'coletesemuni', 'materiais', 'drogas', 'extras'];
  const catalogo = {};
  const bau = {};
  for (const c of categorias) {
    catalogo[c] = { nome: c, emoji: '📦', items: [] };
    for (let k = 0; k < 25; k++) {
      const nome = `Item ${c} ${k} `.padEnd(50, 'x');
      catalogo[c].items.push({ id: `${c}${k}`, nome });
      bau[`${c}__${c}${k}`] = { nome, categoria: c, categoriaId: c, quantidade: 100000 };
    }
  }
  const env = montarAmbiente({ seed: { 'catalogo/items': catalogo } });
  t.after(env.limpar);
  const json = (await embedInventario(bau, 'membros')).toJSON();
  assert.ok(embedLength(json) <= 6000, `embed com ${embedLength(json)} caracteres`);
});

// QA-D3 (média, backend-dev + frontend-dev, exige ajuste de contrato pelo architect): o ajuste em
// massa grava valores ABSOLUTOS até 10 min depois do resumo. Movimentações feitas por membros nesse
// intervalo são sobrescritas em silêncio (perda de atualização), e o resumo que o gerente confirmou
// mostrava um "antes" que já não é o real.
test('QA-D3: confirmar um resumo desatualizado não apaga em silêncio movimentações feitas depois dele', async (t) => {
  const path = require('node:path');
  const { criarInteracao, criarClientFalso } = require('./helpers/fake-interaction');
  const { ultima } = require('./helpers/ambiente');
  const { carregarHandlers, rotearInteracao } = require('../utils/roteador');
  const { limparPendentes } = require('../utils/ajustes-pendentes');
  const registro = carregarHandlers({
    commandsDir: path.join(__dirname, '..', 'commands'),
    interactionsDir: path.join(__dirname, '..', 'interactions')
  });
  const env = montarAmbiente({ seed: { 'bau/membros': { armas__colt: { nome: 'Colt', categoria: 'Armas', categoriaId: 'armas', quantidade: 3 } } } });
  t.after(() => { env.limpar(); limparPendentes(); });
  const client = criarClientFalso();
  const rotear = async (opts) => { const i = criarInteracao({ client, ...opts }); await rotearInteracao(i, registro, client); return i; };

  const resumo = await rotear({ tipo: 'modal', customId: 'ger_modal_ajustar:membros', campos: { inventario: 'Colt:5' }, cargos: ['r-gerente'] });
  const idConfirmar = ultima(resumo, 'editReply').payload.components[0].toJSON().components[0].custom_id;

  // Um membro deposita 10 Colt enquanto o gerente ainda não confirmou.
  await rotear({ tipo: 'modal', customId: 'bau_quantidade:adicionar:membros:armas:colt', campos: { quantidade: '10' }, cargos: ['r-membro'], usuario: { id: 'u7', tag: 'm#7' } });
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 13);

  await rotear({ tipo: 'button', customId: idConfirmar, cargos: ['r-gerente'] });
  assert.equal(env.fake.dump()['bau/membros'].armas__colt.quantidade, 13,
    'o depósito de 10 feito depois do resumo foi apagado sem aviso (resumo dizia 3 → 5)');
});
