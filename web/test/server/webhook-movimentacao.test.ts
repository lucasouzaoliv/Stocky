import { describe, expect, it } from 'vitest';
import type { Embed } from '@/server/discord/webhook';
import type { LogBau, LogCaixa } from '@/server/dominio/tipos';
import { CANAL_LOG_CAIXA, canalDeLogBau, embedAvisoBau, embedMovimentoBau, embedMovimentoCaixa } from '@/server/webhooks/movimentacao';
import { COR, LIMITES_DISCORD, RODAPE, escaparMarkdown, tamanhoEmbed, truncar } from '@/server/webhooks/formatacao';

const DATA = '2026-11-05T12:00:00.000Z';
const logBau = (extra: Partial<LogBau> = {}): LogBau => ({
  acao: 'adicionar',
  usuario: { id: '1', nome: 'Fulano' },
  data: DATA,
  versao: 3,
  categoriaId: 'medicamentos',
  itemId: 'analgesico',
  nomeItem: 'Analgésico',
  nomeCategoria: 'Medicamentos',
  quantidade: 1500,
  saldoResultante: 25000,
  resumo: null,
  auditoriaId: null,
  ...extra,
});
const logCaixa = (extra: Partial<LogCaixa> = {}): LogCaixa => ({
  acao: 'entrada',
  tipo: 'sujo',
  valor: 1000,
  anotacao: 'venda',
  saldoResultante: 2500000,
  usuario: { id: '1', nome: 'Fulano' },
  data: DATA,
  ...extra,
});

const texto = (e: Embed): string => JSON.stringify(e);
const MENCOES = ['@everyone', '@here', '<@123456789012345678>', '<@&123456789012345678>', '<#123456789012345678>'];

function respeitaLimites(e: Embed): void {
  expect((e.title ?? '').length).toBeLessThanOrEqual(LIMITES_DISCORD.TITULO);
  expect((e.description ?? '').length).toBeLessThanOrEqual(LIMITES_DISCORD.DESCRICAO);
  for (const c of e.fields ?? []) {
    expect(c.name.length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPO_NOME);
    expect(c.value.length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPO_VALOR);
    expect(c.value.length).toBeGreaterThan(0);
  }
  expect((e.fields ?? []).length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPOS);
  expect(tamanhoEmbed(e)).toBeLessThanOrEqual(LIMITES_DISCORD.TOTAL);
}

describe('WEB-047 AC1: o canal vem do tipo', () => {
  it('membros → logMembros, gerencia → logGerencia, caixa → logCaixa', () => {
    expect(canalDeLogBau('membros')).toBe('logMembros');
    expect(canalDeLogBau('gerencia')).toBe('logGerencia');
    expect(CANAL_LOG_CAIXA).toBe('logCaixa');
  });
});

describe('WEB-047 conteúdo (quem, o quê, quanto, saldo)', () => {
  it('adicionar: usuário, quantidade, item, baú e estoque resultante em pt-BR', () => {
    const e = embedMovimentoBau(logBau(), 'membros');
    expect(e.description).toContain('Fulano');
    expect(e.description).toContain('adicionou');
    expect(e.description).toContain('1.500x Analgésico');
    expect(e.fields).toContainEqual({ name: 'Baú', value: 'Baú dos Membros', inline: true });
    expect(e.fields).toContainEqual({ name: 'Estoque agora', value: '25.000', inline: true });
    expect(e.color).toBe(COR.entrada);
    expect(e.footer?.text).toBe(RODAPE);
    expect(e.timestamp).toBe(DATA);
  });

  it('remover usa a cor de saída e o baú da gerência', () => {
    const e = embedMovimentoBau(logBau({ acao: 'remover' }), 'gerencia');
    expect(e.description).toContain('removeu');
    expect(e.color).toBe(COR.saida);
    expect(e.fields?.[0]?.value).toBe('Baú da Gerência');
  });

  it('caixa: valor e saldo formatados como $1.000 / $2.500.000, tipo e anotação', () => {
    const e = embedMovimentoCaixa(logCaixa());
    expect(e.description).toContain('$1.000');
    expect(e.description).toContain('dinheiro sujo');
    expect(e.fields).toContainEqual({ name: 'Saldo resultante', value: '$2.500.000 (dinheiro sujo)', inline: true });
    expect(e.fields?.[0]).toEqual({ name: 'Anotação', value: 'venda' });
    expect(e.color).toBe(COR.entrada);
    const s = embedMovimentoCaixa(logCaixa({ acao: 'saida', tipo: 'limpo', valor: 1000000000 }));
    expect(s.description).toContain('retirou');
    expect(s.description).toContain('$1.000.000.000');
    expect(s.description).toContain('dinheiro limpo');
    expect(s.color).toBe(COR.saida);
    expect(texto(e)).not.toMatch(/undefined|NaN|null/);
  });

  it('avisos de zerar, ajuste e remoção do catálogo', () => {
    const z = embedAvisoBau(logBau({ acao: 'zerar', resumo: 'Baú zerado: 3 itens, 40 unidades.', quantidade: null }), 'membros');
    expect(z.title).toBe('🧹 Baú zerado');
    expect(z.description).toBe('Baú zerado: 3 itens, 40 unidades.');
    const a = embedAvisoBau(logBau({ acao: 'ajuste', resumo: 'Ajuste em massa no Baú dos Membros: 2 itens alterados.' }), 'membros');
    expect(a.title).toBe('🛠️ Ajuste em massa');
    const c = embedAvisoBau(logBau({ acao: 'catalogo_remover', resumo: 'Item removido do catálogo: Colt.', quantidade: 12 }), 'gerencia');
    expect(c.title).toBe('🗑️ Item removido do catálogo');
    expect(c.fields).toContainEqual({ name: 'Unidades que estavam no baú', value: '12', inline: true });
    for (const e of [z, a, c]) {
      expect(e.color).toBe(COR.aviso);
      respeitaLimites(e);
    }
  });
});

describe('WEB-047 AC3: menções e markdown neutralizados', () => {
  it.each(MENCOES)('%s no nome do usuário, do item e na anotação não sobrevive literal', (m) => {
    const eventos = [
      embedMovimentoBau(logBau({ usuario: { id: '1', nome: m }, nomeItem: m, nomeCategoria: m }), 'membros'),
      embedMovimentoCaixa(logCaixa({ usuario: { id: '1', nome: m }, anotacao: m })),
      embedAvisoBau(logBau({ acao: 'zerar', usuario: { id: '1', nome: m }, resumo: m }), 'membros'),
    ];
    for (const e of eventos) {
      expect(texto(e)).not.toContain(m);
      expect(texto(e)).not.toMatch(/@everyone|@here|<@|<#/);
    }
  });

  it('markdown do usuário é escapado (negrito, itálico, código, link, spoiler, título, citação)', () => {
    const bruto = '**negrito** _it_ `cod` ~~r~~ ||spoiler|| [a](http://x) # t > q';
    const e = embedMovimentoCaixa(logCaixa({ anotacao: bruto }));
    const anot = e.fields![0]!.value;
    expect(anot.replace(/\\./g, '')).not.toMatch(/[*_~`|>#[\]()]/);
    expect(anot).toContain('\\*\\*negrito\\*\\*');
  });

  it('escaparMarkdown: cada caractere especial recebe barra e @ ganha espaço de largura zero', () => {
    expect(escaparMarkdown('a*b_c~d`e|f>g#h[i]j(k)l\\m')).toBe('a\\*b\\_c\\~d\\`e\\|f\\>g\\#h\\[i\\]j\\(k\\)l\\\\m');
    expect(escaparMarkdown('@everyone')).toBe('@​everyone');
    expect(escaparMarkdown('<@1>')).toBe('<\u200B@\u200B1\\>');
    expect(escaparMarkdown('texto normal 123')).toBe('texto normal 123');
  });
});

describe('WEB-047 AC2: limites de tamanho mesmo com nome e anotação no máximo', () => {
  const nome50 = '@'.repeat(50);
  const anot100 = '*'.repeat(100);
  const usuario32 = { id: '1', nome: '@'.repeat(32) };

  it('item de 50 caracteres, anotação de 100 e usuário de 32, todos "piores casos" de escape', () => {
    const embeds = [
      embedMovimentoBau(logBau({ nomeItem: nome50, nomeCategoria: nome50, usuario: usuario32, quantidade: 100000, saldoResultante: Number.MAX_SAFE_INTEGER }), 'membros'),
      embedMovimentoCaixa(logCaixa({ anotacao: anot100, usuario: usuario32, valor: 1000000000, saldoResultante: Number.MAX_SAFE_INTEGER })),
      embedAvisoBau(logBau({ acao: 'ajuste', resumo: '*'.repeat(200), usuario: usuario32 }), 'gerencia'),
    ];
    for (const e of embeds) respeitaLimites(e);
  });

  it('entradas absurdas (muito além do permitido) ainda saem dentro dos limites', () => {
    const grande = '@*'.repeat(20000);
    const embeds = [
      embedMovimentoBau(logBau({ nomeItem: grande, nomeCategoria: grande, usuario: { id: '1', nome: grande }, resumo: grande }), 'membros'),
      embedMovimentoCaixa(logCaixa({ anotacao: grande, usuario: { id: '1', nome: grande } })),
      embedAvisoBau(logBau({ acao: 'zerar', resumo: grande, usuario: { id: '1', nome: grande } }), 'membros'),
    ];
    for (const e of embeds) respeitaLimites(e);
  });

  it('truncar respeita o tamanho, usa reticências e não parte emoji', () => {
    expect(truncar('abc', 10)).toBe('abc');
    expect(truncar('abcdef', 4)).toBe('abc…');
    expect(truncar('abcdef', 4).length).toBe(4);
    const emoji = '😀'.repeat(10);
    const t = truncar(emoji, 4);
    expect(t.length).toBeLessThanOrEqual(4);
    expect(t).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(truncar('x', 0)).toBe('');
  });
});

describe('WEB-047 AC4: valores em pt-BR', () => {
  it('milhares com ponto, sempre $ à frente, sem notação científica', () => {
    const e = embedMovimentoCaixa(logCaixa({ valor: 1234567, saldoResultante: 1000000000 }));
    expect(e.description).toContain('$1.234.567');
    expect(e.fields?.[1]?.value).toContain('$1.000.000.000');
    expect(texto(e)).not.toMatch(/e\+|\d,\d/);
  });
});
