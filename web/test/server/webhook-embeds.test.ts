import { describe, expect, it } from 'vitest';
import type { BauDTO } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { montarEmbedsInventario } from '@/server/webhooks/inventario-embeds';
import { LIMITES_DISCORD, RODAPE, escaparMarkdown, tamanhoEmbed, tamanhoTotal, truncar } from '@/server/webhooks/formatacao';

const LINK = 'https://stocky-teste.vercel.app/bau/membros';

type Categoria = BauDTO['categorias'][number];

function bau(categorias: Categoria[], tipo: BauDTO['tipo'] = 'membros'): BauDTO {
  return { tipo, versao: 1, categorias };
}
const categoria = (id: string, itens: Array<{ nome: string; quantidade: number }>): Categoria => ({
  id,
  nome: `Categoria ${id}`,
  emoji: '📦',
  itens: itens.map((i, n) => ({ id: `item${n}`, ...i })),
});

function conferirLimites(embeds: ReturnType<typeof montarEmbedsInventario>): void {
  expect(embeds.length).toBeGreaterThanOrEqual(1);
  expect(embeds.length).toBeLessThanOrEqual(LIMITES_DISCORD.EMBEDS);
  expect(tamanhoTotal(embeds)).toBeLessThanOrEqual(LIMITES_DISCORD.TOTAL);
  for (const e of embeds) {
    expect(tamanhoEmbed(e)).toBeLessThanOrEqual(LIMITES_DISCORD.TOTAL);
    expect((e.title ?? '').length).toBeLessThanOrEqual(LIMITES_DISCORD.TITULO);
    expect((e.description ?? '').length).toBeLessThanOrEqual(LIMITES_DISCORD.DESCRICAO);
    expect((e.footer?.text ?? '').length).toBeLessThanOrEqual(LIMITES_DISCORD.RODAPE);
    expect((e.fields ?? []).length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPOS);
    for (const c of e.fields ?? []) {
      expect(c.name.length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPO_NOME);
      expect(c.value.length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPO_VALOR);
    }
  }
}

/** Linhas de item mostradas (descrições dos embeds, sem o aviso final) e o N do aviso, se existir. */
function lerSaida(embeds: ReturnType<typeof montarEmbedsInventario>): { mostradas: string[]; restantes: number } {
  const ultimo = embeds[embeds.length - 1]!;
  const temAviso = (ultimo.description ?? '').startsWith('… e mais ');
  const conteudo = temAviso ? embeds.slice(0, -1) : embeds;
  const mostradas = conteudo.flatMap((e) => (e.description ?? '').split('\n').filter(Boolean));
  const m = /^… e mais ([\d.]+) (?:item|itens)\./.exec(ultimo.description ?? '');
  return { mostradas, restantes: temAviso && m ? Number(m[1]!.replaceAll('.', '')) : 0 };
}

const linhaEsperada = (nome: string, q: number) => `${truncar(escaparMarkdown(nome), 120)}: **${formatarNumero(q)}**`;

describe('WEB-048 AC1: catálogo cheio (6 × 25, nomes de 50 caracteres)', () => {
  const cheio = bau(
    Array.from({ length: 6 }, (_, c) =>
      categoria(
        `c${c}`,
        Array.from({ length: 25 }, (_, i) => ({ nome: `${String(c)}${String(i).padStart(2, '0')}`.padEnd(50, 'x'), quantidade: 100000 })),
      ),
    ),
  );

  it('respeita 6000 no total, 1024 por campo, 4096 na descrição e no máximo 10 embeds', () => {
    const embeds = montarEmbedsInventario(cheio, LINK);
    conferirLimites(embeds);
  });

  it('AC2: não cabe tudo, então trunca com "… e mais N itens" e link; mostrados + N = 150', () => {
    const embeds = montarEmbedsInventario(cheio, LINK);
    const { mostradas, restantes } = lerSaida(embeds);
    expect(restantes).toBeGreaterThan(0);
    expect(mostradas.length + restantes).toBe(150);
    const aviso = embeds[embeds.length - 1]!;
    expect(aviso.description).toContain(LINK);
    expect(aviso.description).toMatch(/^… e mais \d+ itens\./);
    expect(aviso.footer?.text).toBe(RODAPE);
    expect(mostradas[0]).toBe(linhaEsperada(`000`.padEnd(50, 'x'), 100000));
  });

  it('o primeiro embed aponta para o site e leva o nome do baú', () => {
    const embeds = montarEmbedsInventario(cheio, LINK);
    expect(embeds[0]!.url).toBe(LINK);
    expect(embeds[0]!.title).toContain('Baú dos Membros');
    expect(montarEmbedsInventario({ ...cheio, tipo: 'gerencia' }, LINK)[0]!.title).toContain('Baú da Gerência');
  });
});

describe('WEB-048 AC2: sem truncar quando cabe', () => {
  it('catálogo pequeno: nada fica de fora, sem aviso, e o rodapé está no último embed', () => {
    const b = bau([
      categoria('a', [{ nome: 'Desert Eagle', quantidade: 3 }, { nome: 'USP', quantidade: 1200 }]),
      categoria('vazia', []),
      categoria('b', [{ nome: 'Colete', quantidade: 10 }]),
    ]);
    const embeds = montarEmbedsInventario(b, LINK);
    conferirLimites(embeds);
    expect(embeds).toHaveLength(2);
    expect(lerSaida(embeds)).toEqual({ mostradas: ['Desert Eagle: **3**', 'USP: **1.200**', 'Colete: **10**'], restantes: 0 });
    expect(embeds[0]!.footer).toBeUndefined();
    expect(embeds[1]!.footer?.text).toBe(RODAPE);
    expect(embeds.some((e) => (e.description ?? '').includes('… e mais'))).toBe(false);
  });

  it('categoria que passa de 4096 caracteres continua em outro embed, sem perder item', () => {
    const itens = Array.from({ length: 70 }, (_, i) => ({ nome: `Item ${String(i).padStart(2, '0')}`.padEnd(55, 'y'), quantidade: i + 1 }));
    const embeds = montarEmbedsInventario(bau([categoria('grande', itens)]), LINK);
    conferirLimites(embeds);
    const { mostradas, restantes } = lerSaida(embeds);
    expect(restantes).toBe(0);
    expect(mostradas).toHaveLength(70);
    expect(embeds.length).toBe(2);
    expect(embeds[1]!.title).toContain('(cont.)');
    expect(mostradas).toEqual(itens.map((i) => linhaEsperada(i.nome, i.quantidade)));
  });

  it('um item sobrando: o aviso fala "1 item" no singular', () => {
    const itens = Array.from({ length: 6 }, (_, c) => categoria(`c${c}`, Array.from({ length: 25 }, (_, i) => ({ nome: `N${c}${i}`.padEnd(50, 'z'), quantidade: 1 }))));
    const { restantes } = lerSaida(montarEmbedsInventario(bau(itens), LINK));
    expect(restantes).toBeGreaterThan(1);
    const quase = montarEmbedsInventario(bau([categoria('x', Array.from({ length: 90 }, (_, i) => ({ nome: `${i}`.padEnd(60, 'k'), quantidade: 1 })))]), LINK);
    expect(lerSaida(quase).restantes + lerSaida(quase).mostradas.length).toBe(90);
  });
});

describe('WEB-048 AC3: baú vazio', () => {
  it('um embed com "Nenhum item registrado."', () => {
    for (const cats of [[], [categoria('a', []), categoria('b', [])]]) {
      const embeds = montarEmbedsInventario(bau(cats), LINK);
      expect(embeds).toHaveLength(1);
      expect(embeds[0]!.description).toBe('Nenhum item registrado.');
      expect(embeds[0]!.url).toBe(LINK);
      conferirLimites(embeds);
    }
  });
});

describe('WEB-048 AC4: contagem de caracteres pela regra do Discord', () => {
  it('título + descrição + nome e valor dos campos + rodapé; url, cor e timestamp não contam', () => {
    expect(
      tamanhoEmbed({ title: 'aa', description: 'bbb', url: 'x'.repeat(100), timestamp: '2026-11-05T12:00:00.000Z', color: 1, fields: [{ name: 'c', value: 'dd' }, { name: 'e', value: 'f' }], footer: { text: 'gggg' } }),
    ).toBe(2 + 3 + 1 + 2 + 1 + 1 + 4);
    expect(tamanhoEmbed({})).toBe(0);
    expect(tamanhoTotal([{ title: 'a' }, { description: 'bb' }])).toBe(3);
  });

  it('o total real calculado pelo teste confere com o que o construtor respeitou', () => {
    const itens = Array.from({ length: 25 }, (_, i) => ({ nome: `Item ${i}`.padEnd(50, 'q'), quantidade: 99999 }));
    const embeds = montarEmbedsInventario(bau(Array.from({ length: 6 }, (_, c) => categoria(`c${c}`, itens))), LINK);
    const manual = embeds.reduce((s, e) => s + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0), 0);
    expect(manual).toBe(tamanhoTotal(embeds));
    expect(manual).toBeLessThanOrEqual(6000);
  });
});

describe('WEB-048: texto do usuário no inventário', () => {
  it('nomes com menção e markdown saem neutralizados', () => {
    const b = bau([categoria('a', [{ nome: '@everyone <@123456789012345678> **x**', quantidade: 2 }])]);
    const json = JSON.stringify(montarEmbedsInventario(b, LINK));
    expect(json).not.toMatch(/@everyone|<@1/);
    expect(json).not.toContain('**x**');
  });
});

describe('WEB-048 AC5: teste de propriedade (200 casos aleatórios)', () => {
  function gerador(semente: number) {
    let s = semente >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }
  const ALFABETO = ['a', 'Z', '7', ' ', '*', '_', '@', '<', '#', '|', '\\', 'ç', 'ã', '💊', '🔫', '(', ']', '~', '`'];

  it('nunca produz payload fora dos limites e nunca perde item sem avisar', () => {
    const rnd = gerador(20261105);
    const inteiro = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
    let truncados = 0;
    let completos = 0;
    for (let caso = 0; caso < 200; caso += 1) {
      const nCats = inteiro(0, 8);
      const cats = Array.from({ length: nCats }, (_, c) =>
        categoria(
          `c${c}`,
          Array.from({ length: inteiro(0, 25) }, () => ({
            nome: Array.from({ length: inteiro(1, 50) }, () => ALFABETO[inteiro(0, ALFABETO.length - 1)]).join(''),
            quantidade: rnd() < 0.2 ? inteiro(1, 9007199254740) : inteiro(1, 100000),
          })),
        ),
      );
      const embeds = montarEmbedsInventario(bau(cats, caso % 2 ? 'gerencia' : 'membros'), LINK);
      conferirLimites(embeds);

      const todas = cats.flatMap((c) => c.itens.map((i) => linhaEsperada(i.nome, i.quantidade)));
      const { mostradas, restantes } = lerSaida(embeds);
      if (todas.length === 0) {
        expect(embeds).toHaveLength(1);
        expect(embeds[0]!.description).toBe('Nenhum item registrado.');
        continue;
      }
      expect(mostradas.length + restantes, `caso ${caso}`).toBe(todas.length);
      expect(mostradas, `caso ${caso}: ordem preservada`).toEqual(todas.slice(0, mostradas.length));
      if (restantes > 0) {
        truncados += 1;
        expect(embeds[embeds.length - 1]!.description).toContain(LINK);
        const minimo = todas.reduce((s, l) => s + l.length + 1, 0);
        expect(minimo + 150, `caso ${caso}: truncou sem precisar`).toBeGreaterThan(LIMITES_DISCORD.TOTAL - RODAPE.length - 400);
      } else {
        completos += 1;
      }
    }
    expect(truncados).toBeGreaterThan(5);
    expect(completos).toBeGreaterThan(5);
  });
});
