import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import RootLayout, { metadata } from '@/app/layout';
import { metadata as metaInicio } from '@/app/page';
import { metadata as metaNaoEncontrada } from '@/app/not-found';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

function bloco(seletor: string, dentroDe?: string): string {
  const base = dentroDe ? css.slice(css.indexOf(dentroDe)) : css;
  const re = new RegExp(`(^|\\n)\\s*${seletor.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(base);
  if (!m) throw new Error(`regra não encontrada: ${seletor}`);
  return m[2] ?? '';
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
function tokens(trecho: string): Record<string, string> {
  return Object.fromEntries([...trecho.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

describe('WEB-053 layout raiz (AC1)', () => {
  it('<html> tem lang="pt-BR"', () => {
    const el = RootLayout({ children: null });
    expect(isValidElement(el)).toBe(true);
    expect((el.props as { lang: string }).lang).toBe('pt-BR');
  });
  it('título tem padrão "<página> · Stocky" e cada página define o seu', () => {
    const t = metadata.title as { default: string; template: string };
    expect(t.template).toBe('%s · Stocky');
    expect(t.default).toBe('Stocky');
    expect(metaInicio.title).toBe('Início');
    expect(metaNaoEncontrada.title).toBe('Página não encontrada');
  });
});

describe('WEB-053 toque e largura (AC4)', () => {
  it('alvo de toque mínimo de 44 px nos itens do menu, no botão sair e nos botões', () => {
    expect(css).toMatch(/--alvo-toque:\s*44px/);
    for (const s of ['.navegacao__item,\\s*\\.navegacao__sair', '.botao', '.pular']) {
      const re = new RegExp(`${s}\\s*\\{([^}]*)\\}`);
      expect(re.exec(css)?.[1]).toMatch(/min-height:\s*var\(--alvo-toque\)/);
    }
  });
  it('sem overflow horizontal: body contido e itens do menu podem encolher', () => {
    expect(bloco('body')).toMatch(/overflow-x:\s*hidden/);
    expect(bloco('body')).toMatch(/max-width:\s*100%/);
    expect(css).toMatch(/\.navegacao__lista li\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.navegacao__lista li\s*\{[^}]*flex:\s*1 1 0/);
    expect(css).toMatch(/\.navegacao__item,\s*\.navegacao__sair\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(bloco('.bau__grade')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
  it('navegação inferior no celular, lateral a partir de 768 px e moldura de tablet a partir de 1024 px', () => {
    expect(bloco('.navegacao')).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/@media \(min-width: 768px\)[\s\S]*\.casca\s*\{[^}]*grid-template-columns:\s*15rem/);
    const moldura = css.slice(css.indexOf('@media (min-width: 1024px)'));
    expect(moldura).toMatch(/\.casca\s*\{[^}]*border-radius:\s*2\.25rem/);
    expect(moldura).toMatch(/\.casca\s*\{[^}]*contain:\s*layout/);
  });
  it('movimento reduzido desliga animações e transições novas', () => {
    const bloco = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloco).toMatch(/\.aviso__cartao[\s\S]*animation:\s*none/);
    expect(bloco).toMatch(/transition:\s*none/);
  });
});

describe('WEB-053 tokens e acessibilidade visual', () => {
  const escuro = tokens(css.slice(0, css.indexOf('*,')));

  it('contrastes mínimos no tema escuro (único tema)', () => {
    const t = escuro;
    for (const fundo of ['cor-superficie', 'cor-superficie-2', 'cor-grafite']) {
      expect(contraste(t['cor-texto']!, t[fundo]!)).toBeGreaterThanOrEqual(7);
      expect(contraste(t['cor-texto-suave']!, t[fundo]!)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t['cor-destaque']!, t[fundo]!)).toBeGreaterThanOrEqual(4.5);
      for (const c of ['cor-erro', 'cor-sucesso', 'cor-aviso']) {
        expect(contraste(t[c]!, t[fundo]!), `${c} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contraste(t['cor-texto']!, t['cor-fundo']!)).toBeGreaterThanOrEqual(7);
    expect(contraste(t['cor-botao-texto']!, t['cor-botao']!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t['cor-borda-campo']!, t['cor-fundo']!)).toBeGreaterThanOrEqual(3);
  });
  it('só tema escuro: sem override de tema claro', () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*light/);
  });
  it('paleta escura é a base: roxo, preto e branco', () => {
    expect(escuro['cor-fundo']).toBe('#0b0a10');
    expect(escuro['cor-texto']).toBe('#ffffff');
    expect(escuro['cor-botao']).toBe('#9000c0');
  });
  it('foco visível de 2 px com a cor de destaque e movimento reduzido respeitado', () => {
    expect(bloco(':focus-visible')).toMatch(/outline:\s*2px solid var\(--cor-destaque\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });
  it('só fontes e imagens da própria origem, sem @import', () => {
    expect(css).not.toMatch(/@import/);
    // Só imagens de /fundos/ e fontes de /fontes/ (mesma origem); nada de URL externa.
    for (const m of css.matchAll(/url\(([^)]*)\)/g)) expect(m[1]).toMatch(/^'\/(fundos\/[\w-]+\.webp|fontes\/[\w-]+\.woff2)'$/);
  });
});
