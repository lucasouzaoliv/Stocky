/**
 * QA ciclo 3: bateria completa de caracteres invisíveis, de direção, seletores de variação, CGJ, preenchedores,
 * braille em branco, tag chars, espaços exóticos, NFC/NFD/NFKC e homóglifos óbvios, no nome do item, na anotação,
 * nos logs gravados e nos embeds do Discord. Território: qa-engineer. Handlers reais com o Firestore falso.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador, setFetch } from '@/server/contexto';
import { obterMembro } from '@/server/discord/api';
import { resetDb, setDb } from '@/server/firebase';
import { lerSessao } from '@/server/auth/sessao';
import { resetLimitadores, setLimitador } from '@/server/seguranca/limite';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { gerarIdItem, validarNomeItem } from '@/server/validacao/item';
import { chaveDeNome, normalizarAnotacao, sanearTexto } from '@/server/validacao/texto';
import { embedAvisoBau, embedMovimentoBau, embedMovimentoCaixa } from '@/server/webhooks/movimentacao';
import { montarEmbedsInventario } from '@/server/webhooks/inventario-embeds';
import type { LogBau, LogCaixa } from '@/server/dominio/tipos';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import { chamarRota, type RespostaRota } from '../helpers/rotas';
import { criarRequisicao } from '../helpers/requisicao';
import { cookieSessaoTeste } from '../helpers/sessao-teste';
import { APP } from '../helpers/pedidos';
import { criarFakeFetch, respostaJson } from '../helpers/fake-fetch';

let fake: FakeFirestore;
const caminho = '/api/qa3';

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  setAgendador(() => undefined);
  const livre = { consumir: () => ({ ok: true as const }) };
  setLimitador('usuario', livre);
  setLimitador('ip', livre);
  fake = criarFakeFirestore({ seed: seedBase({ membros: { armas: { colt: 10 } } }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

/** Tudo que não pode sobrar em texto exibido: controles, formato (direção, ZW*, BOM, tags), uso privado, VS, CGJ, fillers, braille blank, Mn invisíveis. */
const PROIBIDO =
  /[\p{Cc}\p{Cf}\p{Co}\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180F\u2800\u3164\uFE00-\uFE0F\uFFA0\u{E0000}-\u{E01EF}\u{16FE4}\u{1BCA0}-\u{1BCA3}]/u;
const DIRECAO = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

/** [rótulo, caractere] — a bateria completa. */
const INVISIVEIS: ReadonlyArray<[string, string]> = [
  ['NUL', '\u0000'], ['BEL', '\u0007'], ['ESC', '\u001B'], ['DEL', '\u007F'], ['C1 CSI', '\u009B'],
  ['soft hyphen', '\u00AD'], ['CGJ', '\u034F'], ['ALM', '\u061C'],
  ['hangul choseong filler', '\u115F'], ['hangul jungseong filler', '\u1160'],
  ['khmer inherent AQ', '\u17B4'], ['khmer inherent AA', '\u17B5'],
  ['mongolian FVS1', '\u180B'], ['mongolian FVS2', '\u180C'], ['mongolian FVS3', '\u180D'], ['MVS', '\u180E'], ['mongolian FVS4', '\u180F'],
  ['ZWSP', '\u200B'], ['ZWNJ', '\u200C'], ['ZWJ', '\u200D'], ['LRM', '\u200E'], ['RLM', '\u200F'],
  ['LRE', '\u202A'], ['RLE', '\u202B'], ['PDF', '\u202C'], ['LRO', '\u202D'], ['RLO', '\u202E'],
  ['word joiner', '\u2060'], ['function application', '\u2061'], ['invisible times', '\u2062'],
  ['invisible separator', '\u2063'], ['invisible plus', '\u2064'],
  ['LRI', '\u2066'], ['RLI', '\u2067'], ['FSI', '\u2068'], ['PDI', '\u2069'],
  ['inhibit symmetric swapping', '\u206A'], ['nominal digit shapes', '\u206F'],
  ['braille blank', '\u2800'], ['hangul filler', '\u3164'],
  ['VS1', '\uFE00'], ['VS15', '\uFE0E'], ['VS16', '\uFE0F'], ['BOM/ZWNBSP', '\uFEFF'], ['halfwidth hangul filler', '\uFFA0'],
  ['interlinear annotation anchor', '\uFFF9'], ['interlinear annotation terminator', '\uFFFB'],
  ['khitan small script filler', '\u{16FE4}'], ['shorthand letter overlap', '\u{1BCA0}'], ['shorthand format up step', '\u{1BCA3}'],
  ['musical begin beam', '\u{1D173}'], ['language tag', '\u{E0001}'], ['tag space', '\u{E0020}'], ['tag latin A', '\u{E0041}'],
  ['cancel tag', '\u{E007F}'], ['VS17', '\u{E0100}'], ['VS256', '\u{E01EF}'], ['private use', '\uE000'], ['supl. private use', '\u{F0000}'],
];

const ESPACOS: ReadonlyArray<[string, string]> = [
  ['TAB', '\t'], ['LF', '\n'], ['VT', '\u000B'], ['FF', '\u000C'], ['CR', '\r'], ['NEL', '\u0085'], ['NBSP', '\u00A0'],
  ['ogham', '\u1680'], ['en quad', '\u2000'], ['em space', '\u2003'], ['thin', '\u2009'], ['hair', '\u200A'],
  ['line sep', '\u2028'], ['para sep', '\u2029'], ['narrow NBSP', '\u202F'], ['math space', '\u205F'], ['ideographic', '\u3000'],
];

const sessaoCom = async (nivel: 1 | 2 | 3, nome: string) => {
  const cookies = await cookieSessaoTeste({ nivel, nome });
  const sid = (await lerSessao(Object.values(cookies)[0]))!.sid;
  return { cookies, csrf: tokenCsrf(sid) };
};
async function chamarComo(rota: unknown, metodo: string, nivel: 1 | 2 | 3, nome: string, corpo: unknown, params: Record<string, string> = {}) {
  const s = await sessaoCom(nivel, nome);
  const req = criarRequisicao(`${APP}${caminho}`, {
    metodo,
    cookies: s.cookies,
    headers: { origin: APP, 'x-csrf-token': s.csrf },
    corpo: metodo === 'DELETE' ? undefined : corpo,
  });
  const res = await (rota as (r: Request, c: unknown) => Promise<Response>)(req, { params: Promise.resolve(params) });
  const texto = await res.text();
  return { status: res.status, texto, corpo: JSON.parse(texto) as RespostaRota['corpo'] };
}
const novoItem = (nome: string, categoriaId = 'armas') =>
  chamarRota(CATALOGO_ADICIONAR, { metodo: 'POST', caminho, perfil: 2, corpo: { categoriaId, nome } });
const itens = (categoriaId: string): Array<{ id: string; nome: string }> =>
  (fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string; nome: string }> }> }).categorias.find(
    (c) => c.id === categoriaId,
  )!.itens;
/** Folhas string de um embed (ou de qualquer objeto). */
const folhas = (e: unknown): string[] => {
  const partes: string[] = [];
  const andar = (v: unknown): void => {
    if (typeof v === 'string') partes.push(v);
    else if (Array.isArray(v)) v.forEach(andar);
    else if (v && typeof v === 'object') Object.values(v).forEach(andar);
  };
  andar(e);
  return partes;
};
/** Textos do embed sem o ZWSP que o próprio `escaparMarkdown` põe depois de `@`/`<` e sem as quebras de linha do formato. */
const textoDoEmbed = (e: unknown): string =>
  folhas(e)
    .map((s) => s.replace(/([@<])\u200B/g, '$1').replace(/^\u200B$/, '').replace(/\n/g, ' '))
    .join(' | ');

describe('bateria de invisíveis: funções puras', () => {
  it.each(INVISIVEIS)('%s: sanearTexto remove (nada proibido sobra)', (_r, c) => {
    expect(PROIBIDO.test(sanearTexto(`Co${c}lt`))).toBe(false);
    expect(sanearTexto(`Co${c}lt`)).toBe('Colt');
  });

  it.each(INVISIVEIS)('%s: nome só com o caractere → recusado', (_r, c) => {
    expect(validarNomeItem(c).ok).toBe(false);
    expect(validarNomeItem(`${c}${c}${c}`).ok).toBe(false);
  });

  it.each(INVISIVEIS)('%s: anotação só com o caractere → 400 VALIDACAO', (_r, c) => {
    expect(() => normalizarAnotacao(`${c} ${c}`)).toThrow();
  });

  it.each(INVISIVEIS)('%s: "Co·lt" gera o mesmo id e a mesma chave de "Colt"', (_r, c) => {
    expect(gerarIdItem(`Co${c}lt`)).toBe('colt');
    expect(chaveDeNome(`Co${c}lt`)).toBe(chaveDeNome('Colt'));
  });

  it.each(ESPACOS)('%s vira um espaço comum (nada de quebra no embed)', (_r, c) => {
    expect(sanearTexto(`Munição${c}Pesada`)).toBe('Munição Pesada');
    expect(normalizarAnotacao(`venda${c}${c}ok`)).toBe('venda ok');
  });

  it('NFC/NFD/NFKC: mesma chave e mesmo id para as formas equivalentes', () => {
    const formas = ['Munição', 'Munic\u0327a\u0303o', 'MUNIÇÃO', '\uFF2D\uFF55\uFF4E\uFF49\uFF43\uFF41\uFF4F', '\u{1D40C}\u{1D42E}\u{1D427}\u{1D422}\u{1D41C}\u0327\u{1D41A}\u0303\u{1D428}'];
    for (const f of formas) expect(chaveDeNome(f), f).toBe(chaveDeNome('municao'));
    expect(gerarIdItem('Munic\u0327a\u0303o')).toBe(gerarIdItem('Munição'));
    // armazenado em NFC
    expect(sanearTexto('Munic\u0327a\u0303o')).toBe('Munição');
  });
});

describe('decisão de remover invisíveis (emoji)', () => {
  it('👨\u200D👩\u200D👧 vira três emojis, ❤\uFE0F vira ❤, 🏳\uFE0F\u200D🌈 vira 🏳🌈: nada some além dos joiners/seletores', () => {
    expect(sanearTexto('Kit 👨\u200D👩\u200D👧')).toBe('Kit 👨👩👧');
    expect(sanearTexto('Kit ❤\uFE0F')).toBe('Kit ❤');
    expect(sanearTexto('🏳\uFE0F\u200D🌈 Bandeira')).toBe('🏳🌈 Bandeira');
    // bandeira por tags (Inglaterra) perde as tags e vira só a bandeira preta: visível, sem caractere escondido
    expect(sanearTexto('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} Kit')).toBe('\u{1F3F4} Kit');
    // tom de pele (modificador Sk) é visível e é mantido
    expect(sanearTexto('👍🏽 ok')).toBe('👍🏽 ok');
    // emoji com teclado (keycap) perde o VS16 mas mantém o U+20E3
    expect(sanearTexto('1\uFE0F\u20E3 Kit')).toBe('1\u20E3 Kit');
  });
});

describe('bateria de invisíveis: rotas reais', () => {
  it.each(INVISIVEIS)('%s: criar "Co·lt" com "Colt" existente → 409 DUPLICADO; nada gravado', async (_r, c) => {
    const antes = itens('armas');
    const r = await novoItem(`Co${c}lt`);
    expect(r.status, r.texto).toBe(409);
    expect(itens('armas')).toEqual(antes);
  });

  it.each(INVISIVEIS)('%s: item novo "Ka·tana" é gravado sem o caractere', async (_r, c) => {
    const r = await novoItem(`Ka${c}tana${c}`);
    expect(r.status, r.texto).toBe(201);
    const gravado = itens('armas').find((i) => i.id === 'katana');
    expect(gravado?.nome).toBe('Katana');
  });

  it.each(INVISIVEIS)('%s: anotação "vend·a" gravada limpa no log e no saldo', async (_r, c) => {
    const r = await chamarRota(MOVIMENTAR, {
      metodo: 'POST',
      caminho,
      perfil: 2,
      corpo: { tipo: 'sujo', acao: 'entrada', valor: 10, anotacao: `vend${c}a` },
    });
    expect(r.status, r.texto).toBe(200);
    const logs = Object.entries(fake.dump()).filter(([k]) => k.startsWith('logs/caixa/') || k.includes('caixa'));
    const anotacoes = logs.map(([, v]) => (v as { anotacao?: string }).anotacao).filter((a): a is string => typeof a === 'string');
    expect(anotacoes).toContain('venda');
    for (const a of anotacoes) expect(PROIBIDO.test(a)).toBe(false);
  });
});

describe('homóglifos óbvios (gêmeo visual de "Colt")', () => {
  it.each([
    ['C cirílico', '\u0421olt'],
    ['o cirílico', 'C\u043Elt'],
    ['C e o cirílicos', '\u0421\u043Elt'],
    ['o grego (ómicron)', 'C\u03BFlt'],
    ['l como palochka cirílica', 'Co\u04CFt'],
    ['C romano (U+216D)', '\u216Dolt'],
    ['C matemático negrito', '\u{1D402}olt'],
    ['fullwidth', '\uFF23\uFF4F\uFF4C\uFF54'],
  ])('%s → 409 (ou 400), nunca um segundo "Colt"', async (_r, nome) => {
    const r = await novoItem(nome);
    expect([400, 409], `${nome}: ${r.status} ${r.texto}`).toContain(r.status);
  });
});

describe('logs e embeds do Discord: nada invertido, nada invisível', () => {
  const NICKS: ReadonlyArray<[string, string]> = [
    ['RLO no apelido', 'Fulano\u202E'],
    ['RLE no apelido', '\u202BFulano'],
    ['RLI sem PDI', 'Fulano\u2067'],
    ['ZWSP imitando outro membro', 'Che\u200Bfe'],
    ['BEL/ESC', 'Ful\u0007ano\u001B[31m'],
    ['quebra de linha', 'Fulano\n**falso**'],
  ];

  it.each(NICKS)('%s: obterMembro devolve nome sem invisíveis/direção', async (_r, nick) => {
    setFetch(
      criarFakeFetch(() =>
        respostaJson({ user: { id: '444444444444444441', username: 'fulano', global_name: null }, nick, roles: ['333333333333333331'] }),
      ).fetch,
    );
    const m = await obterMembro('tok');
    expect(m.tipo).toBe('membro');
    const nome = (m as { nome: string }).nome;
    expect(PROIBIDO.test(nome), JSON.stringify(nome)).toBe(false);
    expect(/[\n\r]/.test(nome)).toBe(false);
  });

  it.each(NICKS)('%s: sessão com esse nome → log do baú e embed sem invisíveis/direção', async (_r, nick) => {
    const r = await chamarComo(ADICIONAR, 'POST', 1, nick, { categoriaId: 'armas', itemId: 'colt', quantidade: 15 }, { tipo: 'membros' });
    expect(r.status, r.texto).toBe(200);
    const [, log] = Object.entries(fake.dump()).find(([k]) => k.startsWith('logs/membros/'))!;
    const embed = embedMovimentoBau(log as unknown as LogBau, 'membros');
    const t = textoDoEmbed(embed);
    expect(DIRECAO.test(t), t).toBe(false);
    expect(PROIBIDO.test(t), t).toBe(false);
    // a descrição do movimento é uma linha só: o apelido não pode quebrar a linha e forjar outra
    expect(/[\n\r\u2028\u2029]/.test(embed.description ?? ''), embed.description).toBe(false);
  });

  it.each(NICKS)('%s: sessão com esse nome → embed do caixa sem direção', async (_r, nick) => {
    const r = await chamarComo(MOVIMENTAR, 'POST', 2, nick, { tipo: 'sujo', acao: 'entrada', valor: 15, anotacao: 'venda' });
    expect(r.status, r.texto).toBe(200);
    const [, log] = Object.entries(fake.dump()).find(([k]) => k.startsWith('logs/caixa/'))!;
    const t = textoDoEmbed(embedMovimentoCaixa(log as unknown as LogCaixa));
    expect(DIRECAO.test(t), t).toBe(false);
  });

  describe('dados legados (criados pelo bot, antes do saneamento) com RLO e ZWSP no nome', () => {
    const NOME_LEGADO = 'Bandagem\u202E';
    function abrirLegado() {
      const seed = seedBase({ membros: { armas: { colt: 4, legado: 15 } } });
      const catalogo = structuredClone(CATALOGO_PADRAO) as unknown as Array<{ id: string; nome: string; itens: Array<{ id: string; nome: string }> }>;
      catalogo.find((c) => c.id === 'armas')!.itens.push({ id: 'legado', nome: NOME_LEGADO }, { id: 'colt_2', nome: 'Co\u200Blt' });
      (seed['config/catalogo'] as Dados).categorias = catalogo as unknown as Dados[];
      fake = criarFakeFirestore({ seed });
      setDb(comoDb(fake));
    }

    it('movimentar item legado: log e embed sem direção', async () => {
      abrirLegado();
      const r = await chamarComo(ADICIONAR, 'POST', 1, 'Fulano', { categoriaId: 'armas', itemId: 'legado', quantidade: 3 }, { tipo: 'membros' });
      expect(r.status, r.texto).toBe(200);
      const [, log] = Object.entries(fake.dump()).find(([k]) => k.startsWith('logs/membros/'))!;
      expect(DIRECAO.test(textoDoEmbed(embedMovimentoBau(log as unknown as LogBau, 'membros')))).toBe(false);
    });

    it('remover item legado do catálogo: resumo e embed sem direção (as contagens não se invertem)', async () => {
      abrirLegado();
      const r = await chamarComo(CATALOGO_REMOVER, 'DELETE', 3, 'Dono', undefined, { categoriaId: 'armas', itemId: 'legado' });
      expect(r.status, r.texto).toBe(200);
      const [, log] = Object.entries(fake.dump()).find(([k]) => k.startsWith('logs/membros/'))!;
      expect(DIRECAO.test(String((log as { resumo?: string }).resumo ?? '')), String((log as { resumo?: string }).resumo)).toBe(false);
      expect(DIRECAO.test(textoDoEmbed(embedAvisoBau(log as unknown as LogBau, 'membros')))).toBe(false);
    });

    it('inventário fixo: nenhuma linha com direção ou invisível', () => {
      const embeds = montarEmbedsInventario(
        {
          tipo: 'membros',
          versao: 1,
          categorias: [{ id: 'armas', nome: 'Armas\u202E', emoji: '🔫', itens: [{ id: 'legado', nome: NOME_LEGADO, quantidade: 15 }, { id: 'colt_2', nome: 'Co\u200Blt', quantidade: 1 }] }],
        } as unknown as Parameters<typeof montarEmbedsInventario>[0],
        `${APP}/bau/membros`,
      );
      const t = textoDoEmbed(embeds);
      expect(DIRECAO.test(t), t).toBe(false);
      expect(/Co\u200Blt/.test(t), t).toBe(false);
    });
  });
});
