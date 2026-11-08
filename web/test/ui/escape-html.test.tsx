/**
 * QA-W12: nomes de item, anotações e autores são sempre texto (nunca HTML) e ficam isolados
 * contra caracteres de direção. Cobre Bau, Caixa, Catalogo, AjusteTabela, Logs e Auditoria.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BauDTO, CatalogoDTO, LogDTO, AuditoriaResumoDTO, SaldoDTO } from '@/compartilhado/api-tipos';
import { AjusteTabela } from '@/components/AjusteTabela';
import { Auditoria } from '@/components/Auditoria';
import { Bau } from '@/components/Bau';
import { Caixa } from '@/components/Caixa';
import { Catalogo } from '@/components/Catalogo';
import { Logs } from '@/components/Logs';
import { SessaoProvider } from '@/components/SessaoProvider';
import { clienteFalso, falha, ok } from './helpers-gerencia';

const RLO = '‮';
const ZWSP = '​';
const HOSTIS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '&lt;b&gt;negrito&lt;/b&gt;',
  `${RLO}Desert Eagle${ZWSP}45`,
];

afterEach(() => {
  cleanup();
  delete (window as unknown as { __xss?: number }).__xss;
});

/** Nenhum elemento além dos que o componente cria: sem img/script/b/i/svg/iframe vindos do texto. */
function semElementosInjetados(container: HTMLElement) {
  expect(container.querySelector('img, script, b, i, svg:not([aria-hidden="true"]), iframe, style, a[href^="javascript"]')).toBeNull();
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
}

function comSessao(ui: React.ReactElement, nivel: 1 | 2 | 3 = 3) {
  return render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel }} csrf="csrf-falso">
      {ui}
    </SessaoProvider>,
  );
}

/** Algum elemento cujo texto próprio é exatamente o literal. */
function achar(container: HTMLElement, literal: string) {
  return [...container.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent === literal));
}

describe.each(HOSTIS)('texto hostil %j vira texto', (h) => {
  it('Bau: nome do item', async () => {
    const dto: BauDTO = { tipo: 'membros', versao: 1, categorias: [{ id: 'a', nome: h, emoji: '', itens: [{ id: 'x', nome: h, quantidade: 3 }] }] };
    const { cliente } = clienteFalso(() => ok(dto));
    const { container } = comSessao(<Bau tipo="membros" titulo="Baú" cliente={cliente} />, 1);
    await waitFor(() => expect(container.querySelector('.bau__item-nome')).not.toBeNull());
    expect(container.querySelector('.bau__item-nome')!.textContent).toBe(h);
    semElementosInjetados(container);
  });

  it('Catalogo: nome do item e da categoria', async () => {
    const dto: CatalogoDTO = { categorias: [{ id: 'a', nome: h, emoji: '', total: 1, itens: [{ id: 'x', nome: h }] }] };
    const { cliente } = clienteFalso(() => ok(dto));
    const { container } = comSessao(<Catalogo cliente={cliente} />, 3);
    await waitFor(() => expect(container.querySelector('.bau__item-nome')).not.toBeNull());
    expect(container.querySelector('.bau__item-nome')!.textContent).toBe(h);
    expect(screen.getByRole('button', { name: `Remover ${h}` })).toBeInTheDocument();
    semElementosInjetados(container);
  });

  it('AjusteTabela: nome do item na tabela e na prévia', async () => {
    const cat: CatalogoDTO = { categorias: [{ id: 'a', nome: h, emoji: '', total: 1, itens: [{ id: 'x', nome: h }] }] };
    const bau: BauDTO = { tipo: 'membros', versao: 1, categorias: [{ id: 'a', nome: h, emoji: '', itens: [{ id: 'x', nome: h, quantidade: 3 }] }] };
    const { cliente } = clienteFalso((c) => {
      if (c.url.endsWith('/ajuste/previa')) {
        return ok({ tipo: 'membros', versao: 1, alterados: 1, linhas: [{ categoriaId: 'a', itemId: 'x', nome: h, quantidade: 5, antes: 3, depois: 5 }] });
      }
      if (c.url === '/api/catalogo') return ok(cat);
      if (c.url === '/api/bau/membros') return ok(bau);
      return falha(404, 'NAO_ENCONTRADO', 'x');
    });
    const { container } = comSessao(<AjusteTabela tipo="membros" titulo="Ajuste" cliente={cliente} />, 2);
    await waitFor(() => expect(container.querySelector('th[scope="row"]')).not.toBeNull());
    expect(container.querySelector('th[scope="row"]')!.textContent).toBe(h);
    semElementosInjetados(container);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));
    await waitFor(() => expect(achar(container, h).length).toBeGreaterThan(0));
    semElementosInjetados(document.body);
  });

  it('Caixa: anotação e autor', async () => {
    const mov: LogDTO = { id: 'm1', acao: 'entrada', tipo: 'limpo', valor: 1000, anotacao: h, saldoResultante: 5, usuario: { id: '9', nome: h }, data: '2026-11-05T15:30:00.000Z' };
    const { cliente } = clienteFalso((c) => (c.url.startsWith('/api/caixa/historico') ? ok({ itens: [mov], proximoCursor: null }) : ok({ sujo: 1, limpo: 2 } satisfies SaldoDTO)));
    const { container } = comSessao(<Caixa cliente={cliente} />, 2);
    await waitFor(() => expect(container.querySelector('.caixa__mov-nota')).not.toBeNull());
    expect(container.querySelector('.caixa__mov-nota')!.textContent).toBe(h);
    expect(container.querySelector('.caixa__mov-meta bdi')!.textContent).toBe(h);
    semElementosInjetados(container);
  });

  it('Logs: item, categoria, resumo, anotação e autor (baú e caixa)', async () => {
    const bau = { id: 'b1', acao: 'adicionar', usuario: { id: '1', nome: h }, data: '2026-11-05T02:30:00.000Z', versao: 1, categoriaId: 'a', itemId: 'x', nomeItem: h, nomeCategoria: h, quantidade: 5, saldoResultante: 9, resumo: null, auditoriaId: null } as LogDTO;
    const cx = { id: 'c1', acao: 'saida', tipo: 'sujo', valor: 5, anotacao: h, saldoResultante: 1, usuario: { id: '1', nome: h }, data: '2026-11-05T15:30:00.000Z' } as LogDTO;
    const { cliente } = clienteFalso((c) => ok({ itens: [c.url.includes('/caixa') ? cx : bau], proximoCursor: null }));
    const { container } = render(<Logs nivel={2} cliente={cliente} />);
    await waitFor(() => expect(container.querySelector('.logs__texto')).not.toBeNull());
    expect(container.querySelector('.logs__texto')!.textContent).toBe(`5× ${h} (${h})`);
    expect(container.querySelector('.logs__meta bdi')!.textContent).toBe(h);
    semElementosInjetados(container);
    fireEvent.click(screen.getByRole('tab', { name: 'Caixa' }));
    await waitFor(() => expect(container.querySelector('[id$="-painel-caixa"] .logs__texto')).not.toBeNull());
    expect(container.querySelector('[id$="-painel-caixa"] .logs__texto')!.textContent).toBe(h);
    expect(container.querySelector('[id$="-painel-caixa"] bdi')!.textContent).toBe(h);
    semElementosInjetados(container);
  });

  it('Auditoria: resumo, autor e detalhe (chaves e JSON)', async () => {
    const reg: AuditoriaResumoDTO = { id: 'a1', acao: 'bau.ajuste_massa', usuario: { id: '9', nome: h }, data: '2026-11-05T02:30:00.000Z', resumo: h };
    const { cliente } = clienteFalso((c) =>
      c.url.startsWith('/api/auditoria/a1') ? ok({ ...reg, alvo: {}, antes: { [h]: { [h]: 1 } }, depois: { texto: h } }) : ok({ itens: [reg], proximoCursor: null }),
    );
    const { container } = render(<Auditoria cliente={cliente} />);
    await waitFor(() => expect(container.querySelector('.logs__texto')).not.toBeNull());
    expect(container.querySelector('.logs__texto')!.textContent).toBe(h);
    expect(container.querySelector('.logs__meta bdi')!.textContent).toBe(h);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    await waitFor(() => expect(container.querySelector('.auditoria__comparacao')).not.toBeNull());
    expect(container.querySelector('.auditoria__grupo-titulo')!.textContent).toBe(h);
    expect(container.querySelector('.auditoria__json')!.textContent).toContain(JSON.stringify({ texto: h }, null, 2).slice(1, -1).trim());
    semElementosInjetados(container);
  });
});

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

describe('varredura de código', () => {
  it('não há dangerouslySetInnerHTML nem innerHTML/outerHTML/insertAdjacentHTML em src/app e src/components', () => {
    const alvos = [...arquivos(join(process.cwd(), 'src/app')), ...arquivos(join(process.cwd(), 'src/components'))];
    expect(alvos.length).toBeGreaterThan(10);
    const achados = alvos.filter((f) => /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });
});

describe('isolamento de direção (unicode-bidi)', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const bloco = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((b) => b.trim()).find((b) => /unicode-bidi:\s*isolate/.test(b)) ?? '';
  const seletores = bloco.split('{')[0]!.split(',').map((s) => s.trim());

  it.each(['.bau__item-nome', '.caixa__mov-nota', '.caixa__mov-meta', '.logs__texto', '.logs__meta', '.ajuste__tabela th', '.ajuste__tabela td', 'bdi'])(
    '%s tem unicode-bidi: isolate',
    (seletor) => {
      expect(seletores).toContain(seletor);
    },
  );

  it('os componentes usam essas classes e <bdi> no autor', () => {
    const ler = (f: string) => readFileSync(join(process.cwd(), 'src/components', f), 'utf8');
    expect(ler('Bau.tsx')).toContain('bau__item-nome');
    expect(ler('Catalogo.tsx')).toContain('bau__item-nome');
    expect(ler('Caixa.tsx')).toMatch(/<bdi>\{m\.usuario\.nome\}<\/bdi>/);
    expect(ler('Logs.tsx')).toMatch(/<bdi>\{nome\}<\/bdi>/);
    expect(ler('Auditoria.tsx')).toMatch(/<bdi>\{registro\.usuario\.nome\}<\/bdi>/);
  });

  it('RLO no autor fica dentro do <bdi>, sem escapar para a data', async () => {
    const mov = { id: 'c1', acao: 'saida', tipo: 'sujo', valor: 5, anotacao: 'n', saldoResultante: 1, usuario: { id: '1', nome: `${RLO}Ana` }, data: '2026-11-05T15:30:00.000Z' } as LogDTO;
    const { cliente } = clienteFalso(() => ok({ itens: [mov], proximoCursor: null }));
    const { container } = render(<Logs nivel={2} cliente={cliente} />);
    await waitFor(() => expect(container.querySelector('.logs__meta bdi')).not.toBeNull());
    const bdi = container.querySelector('.logs__meta bdi')!;
    expect(bdi.textContent).toBe(`${RLO}Ana`);
    expect(bdi.parentElement!.querySelector('time')!.textContent).not.toContain(RLO);
  });
});
