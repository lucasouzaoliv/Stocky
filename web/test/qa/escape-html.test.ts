// @vitest-environment jsdom
/**
 * QA ciclo 2: nome de item com HTML é mostrado como texto no Baú e no Catálogo (nunca vira elemento).
 * A mutação "nome renderizado com dangerouslySetInnerHTML no Bau" sobreviveu a toda a suíte dos devs.
 * Arquivo .ts com createElement porque o projeto de testes do QA só inclui test/qa/**\/*.test.ts.
 */
import { createElement, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BauDTO, CatalogoDTO } from '@/compartilhado/api-tipos';
import { Bau } from '@/components/Bau';
import { Catalogo } from '@/components/Catalogo';
import { criarClienteApi } from '@/components/api';
import { SessaoProvider } from '@/components/SessaoProvider';

const HOSTIL = '<img src=x onerror="window.__xss=1"><b>Colt</b>';
const CATALOGO: CatalogoDTO = {
  categorias: [{ id: 'armas', nome: 'Armas <i>x</i>', emoji: '🔫', total: 1, itens: [{ id: 'img_src_x', nome: HOSTIL }] }],
};
const BAU: BauDTO = {
  tipo: 'membros',
  versao: 1,
  categorias: [{ id: 'armas', nome: 'Armas <i>x</i>', emoji: '🔫', itens: [{ id: 'img_src_x', nome: HOSTIL, quantidade: 3 }] }],
};

function cliente() {
  const ok = (dados: unknown) => new Response(JSON.stringify({ ok: true, dados }), { status: 200 });
  const falso = vi.fn(async (url: string) => (url.startsWith('/api/catalogo') ? ok(CATALOGO) : ok(BAU)));
  return criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn(), caminhoAtual: () => '/bau/membros' });
}

function comSessao(nivel: 1 | 2 | 3, filho: ReturnType<typeof createElement>) {
  const Envoltorio = ({ children }: { children: ReactNode }) =>
    createElement(SessaoProvider, { usuario: { id: '1', nome: '<b>Ana</b>', nivel }, csrf: 'csrf-falso' } as Parameters<typeof SessaoProvider>[0], children);
  return render(filho, { wrapper: Envoltorio });
}

describe('QA escape de HTML nos nomes (Baú e Catálogo)', () => {
  it('Baú: o nome aparece literal e nenhum <img>/<b>/<i> é criado', async () => {
    const { container } = comSessao(1, createElement(Bau, { tipo: 'membros', titulo: 'Baú dos Membros', cliente: cliente() }));
    expect((await screen.findAllByText(HOSTIL, { exact: false })).length).toBeGreaterThan(0);
    expect(container.querySelector('img, b, i')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('Catálogo: o nome aparece literal e nenhum <img>/<b>/<i> é criado', async () => {
    const { container } = comSessao(3, createElement(Catalogo, { cliente: cliente() }));
    expect((await screen.findAllByText(HOSTIL, { exact: false })).length).toBeGreaterThan(0);
    expect(container.querySelector('img, b, i')).toBeNull();
  });
});
