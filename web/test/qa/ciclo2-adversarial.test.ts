/**
 * QA ciclo 2: revalidação de QA-W1 e QA-W5 sem testes vazios (os de `chave-prototipo.test.ts` do ciclo 1
 * retornam cedo quando a criação é recusada) e nova rodada adversarial: unicode NFC/NFD, nomes quase iguais,
 * emoji, entradas enormes, corpo com chaves extras, concorrência, sessão ausente/adulterada e replay de CSRF.
 * Território: qa-engineer. Handlers reais com o Firestore falso.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as BAU } from '@/app/api/bau/[tipo]/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores, setLimitador } from '@/server/seguranca/limite';
import { tokenCsrf } from '@/server/seguranca/csrf';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import { chamarRota, type RespostaRota } from '../helpers/rotas';
import { montarPedido, type PedidoTeste } from '../helpers/pedidos';

type Rota = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const caminho = '/api/qa';
let fake: FakeFirestore;

function abrir(seed: Record<string, Dados> = seedBase({ membros: { armas: { colt: 10 } } })) {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
}

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  setAgendador(() => undefined);
  const livre = { consumir: () => ({ ok: true as const }) };
  setLimitador('usuario', livre);
  setLimitador('ip', livre);
  abrir();
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const chamar = (rota: unknown, p: PedidoTeste & { params?: Record<string, string> }): Promise<RespostaRota> =>
  chamarRota(rota, { metodo: 'POST', caminho, ...p });
const novoItem = (nome: string, categoriaId = 'armas') =>
  chamar(CATALOGO_ADICIONAR, { perfil: 2, corpo: { categoriaId, nome } });
const itensDaCategoria = (categoriaId: string): Array<{ id: string; nome: string }> => {
  const cat = (fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string; nome: string }> }> }).categorias;
  return cat.find((c) => c.id === categoriaId)!.itens;
};
const itensBau = (tipo: string) => (fake.dump()[`baus/${tipo}`] as { itens: Record<string, Record<string, number>> }).itens;
const versaoBau = (tipo: string) => (fake.dump()[`baus/${tipo}`] as { versao: number }).versao;

/** Caracteres que não aparecem na tela (ou só alteram a exibição). */
const INVISIVEIS: ReadonlyArray<[string, string]> = [
  ['zero width space', '​'],
  ['zero width non-joiner', '‌'],
  ['zero width joiner', '‍'],
  ['word joiner', '⁠'],
  ['LRM', '‎'],
  ['RLM', '‏'],
  ['RLO', '‮'],
  ['BOM', '﻿'],
  ['soft hyphen', '­'],
  ['variation selector 16', '️'],
  ['variation selector 1', '︀'],
  ['variation selector suplementar', '\u{E0100}'],
  ['tag latin A', '\u{E0041}'],
  ['cancel tag', '\u{E007F}'],
  ['combining grapheme joiner', '͏'],
  ['mongolian vowel separator', '᠎'],
  ['invisible times', '⁢'],
  ['hangul filler', 'ㅤ'],
  ['halfwidth hangul filler', 'ﾠ'],
  ['braille blank', '⠀'],
];
const FORMATO_OU_CONTROLE = /[\p{Cc}\p{Cf}­͏︀-️ㅤﾠ⠀\u{E0000}-\u{E01EF}]/u;

describe('QA-W1 revalidado: ids reservados (sem retorno antecipado)', () => {
  it.each(['Constructor', ' CONSTRUCTOR ', 'constructor!!', 'Prototype', '#constructor'])('criar "%s" → 400, catálogo intacto', async (nome) => {
    const antes = fake.dump()['config/catalogo'];
    const r = await novoItem(nome);
    expect(r.status, r.texto).toBe(400);
    expect(r.corpo.codigo).toBe('VALIDACAO');
    // a semente pode ter atualizado só o carimbo; os itens não mudam
    expect((fake.dump()['config/catalogo'] as { categorias: unknown }).categorias).toEqual((antes as { categorias: unknown }).categorias);
  });

  it('nomes vizinhos de chaves do protótipo continuam válidos (toString → tostring, hasOwnProperty → hasownproperty)', async () => {
    for (const nome of ['toString', 'hasOwnProperty', 'valueOf', 'Construtor']) {
      const r = await novoItem(nome, 'medicamentos');
      expect(r.status, `${nome}: ${r.texto}`).toBe(201);
    }
    const ids = itensDaCategoria('medicamentos').map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['tostring', 'hasownproperty', 'valueof', 'construtor']));
  });

  it.each([
    ['constructor', 400],
    ['__proto__', 400],
    ['prototype', 400],
    ['hasOwnProperty', 400],
    ['toString', 400],
  ])('movimentar itemId "%s" → %i, nada gravado', async (itemId, status) => {
    const antes = fake.dump();
    for (const rota of [ADICIONAR, REMOVER]) {
      const r = await chamar(rota, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId, quantidade: 1 } });
      expect(r.status, r.texto).toBe(status);
    }
    expect(fake.dump()).toEqual(antes);
  });

  it('categoriaId reservado ("constructor") também é recusado nas rotas', async () => {
    const r = await chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'constructor', itemId: 'colt', quantidade: 1 } });
    expect(r.status).toBe(400);
    const p = await chamar(PREVIA, { perfil: 2, params: { tipo: 'membros' }, corpo: { linhas: [{ categoriaId: 'constructor', itemId: 'colt', quantidade: 1 }] } });
    expect(p.status).toBe(400);
  });

  describe('dados legados com "constructor" e "__proto__" gravados', () => {
    function abrirLegado() {
      const seed = seedBase({ membros: { armas: { colt: 4, constructor: 2 } }, gerencia: { armas: { constructor: 7 } } });
      // "__proto__" como chave PRÓPRIA (como viria de um JSON/Firestore), em categoria e item
      seed['baus/membros'] = JSON.parse(
        JSON.stringify(seed['baus/membros']).replace('"itens":{', '"itens":{"__proto__":{"nivel":3},"armas_x":{"__proto__":5},'),
      ) as Dados;
      const catalogo = structuredClone(CATALOGO_PADRAO) as unknown as Array<{ id: string; itens: Array<{ id: string; nome: string }> }>;
      catalogo.find((c) => c.id === 'armas')!.itens.push({ id: 'constructor', nome: 'Constructor' });
      seed['config/catalogo'] = { categorias: catalogo, atualizadoEm: 'x' };
      abrir(seed);
    }

    it('leitura do baú: constructor aparece com a quantidade gravada; __proto__ é ignorado sem poluir protótipo', async () => {
      abrirLegado();
      const r = await chamarRota(BAU, { perfil: 1, caminho, params: { tipo: 'membros' } });
      expect(r.status, r.texto).toBe(200);
      const armas = (r.corpo.dados as { categorias: Array<{ id: string; itens: Array<{ id: string; quantidade: unknown }> }> }).categorias.find((c) => c.id === 'armas')!;
      expect(armas.itens.find((i) => i.id === 'constructor')?.quantidade).toBe(2);
      expect(armas.itens.find((i) => i.id === 'colt')?.quantidade).toBe(4);
      expect(r.texto).not.toContain('__proto__');
      expect(({} as Record<string, unknown>).nivel).toBeUndefined();
    });

    it('adicionar colt na mesma categoria preserva o constructor antigo', async () => {
      abrirLegado();
      const r = await chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1 } });
      expect(r.status, r.texto).toBe(200);
      expect(itensBau('membros').armas).toEqual({ colt: 5, constructor: 2 });
    });

    it('ajuste de colt com constructor antigo presente: 200 e constructor preservado', async () => {
      abrirLegado();
      const v = versaoBau('membros');
      const r = await chamar(CONFIRMAR, { perfil: 2, params: { tipo: 'membros' }, corpo: { versao: v, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 0 }] } });
      expect(r.status, r.texto).toBe(200);
      expect(itensBau('membros').armas).toEqual({ constructor: 2 });
    });

    it('dono remove o constructor antigo do catálogo pela rota: 200, contagens numéricas, logs com números', async () => {
      abrirLegado();
      const r = await chamar(CATALOGO_REMOVER, { metodo: 'DELETE', perfil: 3, params: { categoriaId: 'armas', itemId: 'constructor' } });
      expect(r.status, r.texto).toBe(200);
      expect((r.corpo.dados as { removidoDe: unknown }).removidoDe).toEqual({ membros: 2, gerencia: 7, casa: 0 });
      expect(itensBau('membros').armas).toEqual({ colt: 4 });
      expect(itensBau('gerencia')).toEqual({});
      for (const [chave, doc] of Object.entries(fake.dump())) {
        if (!chave.startsWith('logs/')) continue;
        const s = (doc as { saldoResultante?: unknown }).saldoResultante;
        if (s !== undefined) expect(typeof s === 'number' && Number.isFinite(s), chave).toBe(true);
      }
      expect(itensDaCategoria('armas').some((i) => i.id === 'constructor')).toBe(false);
    });

    it('zerar com constructor antigo deixa os baús vazios', async () => {
      abrirLegado();
      const r = await chamar(ZERAR, { perfil: 3, corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } });
      expect(r.status, r.texto).toBe(200);
      expect(itensBau('membros')).toEqual({});
      expect(itensBau('gerencia')).toEqual({});
    });
  });
});

describe('QA-W5 revalidado: anotação só com invisíveis', () => {
  it.each(INVISIVEIS)('anotação só com %s → 400, saldo intacto', async (_n, c) => {
    const antes = fake.dump()['caixa/saldo'];
    const r = await chamar(MOVIMENTAR, { perfil: 2, corpo: { tipo: 'sujo', acao: 'entrada', valor: 10, anotacao: `${c}${c} ${c}` } });
    expect(r.status, r.texto).toBe(400);
    expect(fake.dump()['caixa/saldo']).toEqual(antes);
  });

  it('anotação com invisíveis no meio é guardada sem eles', async () => {
    const r = await chamar(MOVIMENTAR, { perfil: 2, corpo: { tipo: 'sujo', acao: 'entrada', valor: 10, anotacao: 've​n­da‮﻿' } });
    expect(r.status, r.texto).toBe(200);
    const logs = Object.entries(fake.dump()).filter(([k]) => k.startsWith('logs/caixa/'));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0]![1])).toContain('"venda"');
  });
});

describe('QA-W5 no nome do item: invisíveis não criam duplicado visual nem ficam gravados', () => {
  it.each(INVISIVEIS)('"Co<%s>lt" não vira um segundo "Colt" visualmente igual', async (_n, c) => {
    const r = await novoItem(`Co${c}lt`);
    expect([201, 400, 409], r.texto).toContain(r.status);
    const visiveis = itensDaCategoria('armas').map((i) => i.nome.replace(new RegExp(FORMATO_OU_CONTROLE.source, 'gu'), '').toLowerCase());
    expect(visiveis.filter((n) => n === 'colt'), JSON.stringify(itensDaCategoria('armas').map((i) => i.nome))).toHaveLength(1);
  });

  it.each(INVISIVEIS)('nome novo com %s: se aceito, é gravado sem o caractere', async (_n, c) => {
    const r = await novoItem(`Faca${c} Tática${c}`);
    if (r.status === 201) {
      const nome = (r.corpo.dados as { item: { nome: string } }).item.nome;
      expect(nome, JSON.stringify(nome)).not.toMatch(FORMATO_OU_CONTROLE);
    } else {
      expect(r.status, r.texto).toBe(400);
    }
  });

  it('caracteres de controle no nome (BEL, ESC, DEL) não são gravados', async () => {
    const r = await novoItem('Faca\u0007\u001B[31m\u007F');
    if (r.status === 201) {
      for (const i of itensDaCategoria('armas')) expect(i.nome, JSON.stringify(i.nome)).not.toMatch(/\p{Cc}/u);
    } else expect(r.status).toBe(400);
  });
});

describe('QA unicode, nomes quase iguais, emoji e entradas enormes no catálogo', () => {
  it('NFC e NFD do mesmo nome → o segundo é duplicado (409)', async () => {
    const nfc = 'Munição Pesada'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect((await novoItem(nfc)).status).toBe(201);
    expect((await novoItem(nfd)).status).toBe(409);
    expect((await novoItem('MUNICAO-PESADA')).status).toBe(409);
  });

  it.each(['colt', ' COLT ', 'Colt!', 'Colt.', '🔫 Colt', 'Colt 🔫', 'Ćolt', 'Ｃolt'.normalize('NFKC')])('"%s" é duplicado de Colt (409)', async (nome) => {
    const r = await novoItem(nome);
    expect(r.status, r.texto).toBe(409);
  });

  it.each(['🔫', '🔫🔫🔫', '!!!', '́́', '😀'.repeat(50)])('"%s" (sem letra ou número) → 400', async (nome) => {
    expect((await novoItem(nome)).status).toBe(400);
  });

  it('50 caracteres com emoji é aceito; 51 recusado; contagem por código e não por UTF-16', async () => {
    const cinquenta = 'A' + '🔫'.repeat(49);
    expect(Array.from(cinquenta)).toHaveLength(50);
    expect((await novoItem(cinquenta, 'medicamentos')).status).toBe(201);
    expect((await novoItem('B' + '🔫'.repeat(50), 'medicamentos')).status).toBe(400);
  });

  it('nome enorme (9 KB) → 400 e corpo acima de 10 KB → 413, nada gravado', async () => {
    const antes = fake.dump()['config/catalogo'];
    expect((await novoItem('x'.repeat(9000))).status).toBe(400);
    expect((await novoItem('x'.repeat(11_000))).status).toBe(413);
    expect((fake.dump()['config/catalogo'] as { categorias: unknown }).categorias).toEqual((antes as { categorias: unknown }).categorias);
  });

  it('corpo com chave extra, __proto__ próprio ou constructor → 400', async () => {
    const corpos: unknown[] = [
      { categoriaId: 'armas', nome: 'Faca', extra: 1 },
      JSON.parse('{"categoriaId":"armas","nome":"Faca","__proto__":{"nivel":3}}'),
      { categoriaId: 'armas', nome: 'Faca', constructor: { prototype: { x: 1 } } },
    ];
    for (const corpo of corpos) {
      const r = await chamar(CATALOGO_ADICIONAR, { perfil: 2, corpo });
      expect(r.status, r.texto).toBe(400);
    }
    const mov = await chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1, usuario: 'outro' } });
    expect(mov.status).toBe(400);
    const caixa = await chamar(MOVIMENTAR, { perfil: 2, corpo: { tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: 'x', saldo: 999 } });
    expect(caixa.status).toBe(400);
    expect(({} as Record<string, unknown>).nivel).toBeUndefined();
  });

  it('ajuste com 201 linhas → 400; com 200 linhas válidas mas repetidas → 400 listando as repetidas', async () => {
    const linhas = Array.from({ length: 201 }, () => ({ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }));
    expect((await chamar(PREVIA, { perfil: 2, params: { tipo: 'membros' }, corpo: { linhas } })).status).toBe(400);
    const r = await chamar(PREVIA, { perfil: 2, params: { tipo: 'membros' }, corpo: { linhas: linhas.slice(0, 200) } });
    expect(r.status).toBe(400);
    expect(((r.corpo.detalhes as { linhas: unknown[] }).linhas)).toHaveLength(199);
  });
});

describe('QA concorrência', () => {
  it('zerar em paralelo com adicionar: resultado é {} ou só a adição, nunca a soma antiga', async () => {
    for (let i = 0; i < 5; i++) {
      abrir(seedBase({ membros: { armas: { colt: 10 } } }));
      resetSemente();
      const [z, a] = await Promise.all([
        chamar(ZERAR, { perfil: 3, corpo: { alvo: 'membros', confirmacao: 'ZERAR' } }),
        chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 3 } }),
      ]);
      expect(z.status, z.texto).toBe(200);
      expect(a.status, a.texto).toBe(200);
      const final = itensBau('membros');
      expect([JSON.stringify({}), JSON.stringify({ armas: { colt: 3 } })]).toContain(JSON.stringify(final));
      expect(versaoBau('membros')).toBe(2);
    }
  });

  it('dois ajustes com a mesma versão em paralelo: um aplica, o outro 409 VERSAO_DESATUALIZADA', async () => {
    const v = versaoBau('membros');
    const [a, b] = await Promise.all([
      chamar(CONFIRMAR, { perfil: 2, params: { tipo: 'membros' }, corpo: { versao: v, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }] } }),
      chamar(CONFIRMAR, { perfil: 2, params: { tipo: 'membros' }, corpo: { versao: v, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 2 }] } }),
    ]);
    const st = [a.status, b.status].sort();
    expect(st).toEqual([200, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect(perdedor.corpo.codigo).toBe('VERSAO_DESATUALIZADA');
    const vencedor = a.status === 200 ? 1 : 2;
    expect(itensBau('membros').armas?.colt).toBe(vencedor);
    expect(versaoBau('membros')).toBe(v + 1);
  });

  it('ajuste em paralelo com adicionar: ou o ajuste é recusado (409) ou a adição vem depois dele', async () => {
    for (let i = 0; i < 5; i++) {
      abrir(seedBase({ membros: { armas: { colt: 10 } } }));
      resetSemente();
      const [aj, ad] = await Promise.all([
        chamar(CONFIRMAR, { perfil: 2, params: { tipo: 'membros' }, corpo: { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 50 }] } }),
        chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 3 } }),
      ]);
      expect(ad.status, ad.texto).toBe(200);
      const colt = itensBau('membros').armas?.colt;
      if (aj.status === 200) expect(colt).toBe(53);
      else {
        expect(aj.status, aj.texto).toBe(409);
        expect(colt).toBe(13);
      }
    }
  });

  it('remover em paralelo com zerar nunca deixa negativo nem NaN', async () => {
    const [r, z] = await Promise.all([
      chamar(REMOVER, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 10 } }),
      chamar(ZERAR, { perfil: 3, corpo: { alvo: 'membros', confirmacao: 'ZERAR' } }),
    ]);
    expect(z.status).toBe(200);
    expect([200, 409]).toContain(r.status);
    expect(itensBau('membros')).toEqual({});
  });
});

describe('QA sessão e CSRF', () => {
  it('sem sessão → 401 e sessão adulterada → 401 em todas as mutações, nada gravado', async () => {
    const antes = fake.dump();
    const casos: Array<[unknown, Record<string, string> | undefined, unknown, string?]> = [
      [ADICIONAR, { tipo: 'membros' }, { categoriaId: 'armas', itemId: 'colt', quantidade: 1 }],
      [REMOVER, { tipo: 'membros' }, { categoriaId: 'armas', itemId: 'colt', quantidade: 1 }],
      [CONFIRMAR, { tipo: 'membros' }, { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }] }],
      [ZERAR, undefined, { alvo: 'ambos', confirmacao: 'ZERAR' }],
      [MOVIMENTAR, undefined, { tipo: 'sujo', acao: 'entrada', valor: 1, anotacao: 'x' }],
      [CATALOGO_ADICIONAR, undefined, { categoriaId: 'armas', nome: 'Faca' }],
      [CATALOGO_REMOVER, { categoriaId: 'armas', itemId: 'colt' }, undefined, 'DELETE'],
    ];
    for (const perfil of ['anonimo', 'adulterado'] as const) {
      for (const [rota, params, corpo, metodo] of casos) {
        const r = await chamar(rota, { perfil, params, corpo, metodo: metodo ?? 'POST' });
        expect(r.status, `${perfil} ${r.texto}`).toBe(401);
      }
    }
    expect(fake.dump()).toEqual(antes);
  });

  it('replay de CSRF: token válido de OUTRA sessão (mesmo usuário) é recusado com 403', async () => {
    const pedido = await montarPedido({ metodo: 'POST', caminho, perfil: 2, csrf: 'ausente', corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1 } });
    const outro = tokenCsrf('sid-de-outra-sessao-qa');
    const h = new Headers(pedido.headers);
    h.set('x-csrf-token', outro);
    const req = new Request(pedido.url, { method: 'POST', headers: h, body: JSON.stringify({ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }) });
    const res = await (ADICIONAR as Rota)(req, { params: Promise.resolve({ tipo: 'membros' }) });
    expect(res.status).toBe(403);
    expect(itensBau('membros').armas?.colt).toBe(10);
  });

  it('o mesmo token CSRF reapresentado na mesma sessão continua válido (token por sessão, decisão ADR-06)', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await chamar(ADICIONAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1 } });
      expect(r.status).toBe(200);
    }
    expect(itensBau('membros').armas?.colt).toBe(13);
  });

  it('nível 1 não ajusta, nível 2 não zera nem remove do catálogo (rota de dono), nada gravado', async () => {
    const antes = fake.dump();
    expect((await chamar(CONFIRMAR, { perfil: 1, params: { tipo: 'membros' }, corpo: { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }] } })).status).toBe(403);
    expect((await chamar(ZERAR, { perfil: 2, corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } })).status).toBe(403);
    expect((await chamar(CATALOGO_REMOVER, { metodo: 'DELETE', perfil: 2, params: { categoriaId: 'armas', itemId: 'colt' } })).status).toBe(403);
    expect((await chamar(CATALOGO_ADICIONAR, { perfil: 1, corpo: { categoriaId: 'armas', nome: 'Faca' } })).status).toBe(403);
    expect(fake.dump()).toEqual(antes);
  });
});
