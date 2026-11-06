import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Navegacao } from '@/components/Navegacao';

let caminho = '/bau/membros';
const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => caminho, useRouter: () => ({ replace, refresh }) }));

const fetchFalso = vi.fn();

beforeEach(() => {
  caminho = '/bau/membros';
  fetchFalso.mockReset();
  replace.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const GERENCIA = ['Baú da Gerência', 'Caixa', 'Painel', 'Auditoria'];

describe('WEB-053 navegação por nível (AC2)', () => {
  it('nível 1 vê Baú dos Membros e Logs, sem itens de gerência', () => {
    render(<Navegacao nivel={1} csrf="tok" />);
    expect(screen.getByRole('link', { name: 'Baú dos Membros' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logs' })).toBeInTheDocument();
    for (const nome of GERENCIA) expect(screen.queryByRole('link', { name: nome })).toBeNull();
  });

  it.each([2, 3] as const)('nível %i vê todos os itens', (nivel) => {
    render(<Navegacao nivel={nivel} csrf="tok" />);
    for (const nome of ['Baú dos Membros', 'Logs', ...GERENCIA]) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument();
    }
  });
});

describe('WEB-053 teclado e item atual (AC3)', () => {
  it('marca só o item atual com aria-current="page"', () => {
    caminho = '/bau/membros';
    render(<Navegacao nivel={3} csrf="tok" />);
    expect(screen.getByRole('link', { name: 'Baú dos Membros' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Baú da Gerência' })).not.toHaveAttribute('aria-current');
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('reconhece subcaminhos (ajuste de um baú não é item do menu e nada fica marcado)', () => {
    caminho = '/ajuste/membros';
    render(<Navegacao nivel={3} csrf="tok" />);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it('todos os controles são focáveis por Tab e acessíveis por nome, na ordem do menu', () => {
    render(<Navegacao nivel={3} csrf="tok" />);
    const controles = [...screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a, button')];
    expect(controles.map((c) => c.textContent)).toEqual([
      'Baú dos Membros', 'Baú da Gerência', 'Caixa', 'Painel', 'Logs', 'Auditoria', 'Sair',
    ]);
    for (const c of controles) expect((c as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0);
    // links são <a href> e o botão é <button>: Enter ativa ambos nativamente
    expect(screen.getAllByRole('link').every((a) => a.hasAttribute('href'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Sair' }).tagName).toBe('BUTTON');
  });
});

describe('WEB-053 sair (AC5)', () => {
  it('envia POST de logout com JSON e token CSRF', async () => {
    fetchFalso.mockResolvedValue({ ok: true });
    render(<Navegacao nivel={1} csrf="token-falso" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(refresh).toHaveBeenCalled();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'token-falso', 'content-type': 'application/json' });
  });

  it('mostra erro curto e reabilita o botão quando o logout falha', async () => {
    fetchFalso.mockResolvedValue({ ok: false });
    render(<Navegacao nivel={1} csrf="tok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível sair. Tente de novo.');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('mostra erro quando a rede cai', async () => {
    fetchFalso.mockRejectedValue(new Error('rede'));
    render(<Navegacao nivel={1} csrf="tok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
