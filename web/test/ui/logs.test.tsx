import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaLogs from '@/app/(protegido)/logs/page';
import type { LogDTO } from '@/compartilhado/api-tipos';
import { criarClienteApi } from '@/components/api';
import { Logs } from '@/components/Logs';

const exigirPagina = vi.fn();
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });
type Resp = Response | Promise<Response>;

function bau(i: number, extra: Record<string, unknown> = {}): LogDTO {
  return {
    id: `b${i}`, acao: 'adicionar', usuario: { id: '1', nome: 'Ana' }, data: '2026-11-05T02:30:00.000Z', versao: i,
    categoriaId: 'armas', itemId: 'pistola', nomeItem: 'Pistola', nomeCategoria: 'Armas', quantidade: 5, saldoResultante: 9,
    resumo: null, auditoriaId: null, ...extra,
  } as LogDTO;
}
function caixa(i: number, extra: Record<string, unknown> = {}): LogDTO {
  return { id: `c${i}`, acao: 'saida', tipo: 'sujo', valor: 2500, anotacao: `nota ${i}`, saldoResultante: 1000, usuario: { id: '1', nome: 'Bia' }, data: '2026-11-05T15:30:00.000Z', ...extra } as LogDTO;
}

function montar(nivel: 1 | 2 | 3, resp: (url: string) => Resp = () => ok({ itens: [], proximoCursor: null })) {
  const chamadas: string[] = [];
  const fetchFalso = vi.fn(async (url: string) => {
    chamadas.push(url);
    return resp(url);
  });
  const cliente = criarClienteApi({ fetch: fetchFalso as unknown as typeof fetch, navegar: vi.fn() });
  render(<Logs nivel={nivel} cliente={cliente} />);
  return chamadas;
}

beforeEach(() => exigirPagina.mockReset());

describe('WEB-063 AC1: abas por nível', () => {
  it('nível 1 só tem a aba Baú dos Membros e não requisita as outras', async () => {
    const chamadas = montar(1, () => ok({ itens: [bau(1)], proximoCursor: null }));
    await screen.findByText(/Pistola/);
    const abas = screen.getAllByRole('tab');
    expect(abas.map((a) => a.textContent)).toEqual(['Baú dos Membros']);
    expect(chamadas).toEqual(['/api/logs/bau/membros?limite=20']);
  });

  it.each([2, 3] as const)('nível %i vê as três abas, cada uma carrega o seu log só ao abrir', async (nivel) => {
    const chamadas = montar(nivel, (url) =>
      ok({ itens: [url.includes('caixa') ? caixa(1) : bau(1, { nomeItem: url.includes('gerencia') ? 'Colete' : 'Pistola' })], proximoCursor: null }),
    );
    await screen.findByText(/Pistola/);
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Baú dos Membros', 'Baú da Gerência', 'Caixa']);
    expect(chamadas).toEqual(['/api/logs/bau/membros?limite=20']);
    fireEvent.click(screen.getByRole('tab', { name: 'Baú da Gerência' }));
    await screen.findByText(/Colete/);
    fireEvent.click(screen.getByRole('tab', { name: 'Caixa' }));
    await screen.findByText('nota 1');
    expect(chamadas).toEqual(['/api/logs/bau/membros?limite=20', '/api/logs/bau/gerencia?limite=20', '/api/logs/caixa?limite=20']);
  });

  it('navega por teclado (setas, Home, End) com tabindex móvel e aria-selected', async () => {
    montar(2);
    await screen.findByText('Nenhum registro');
    const [a1, a2, a3] = screen.getAllByRole('tab');
    expect(a1).toHaveAttribute('aria-selected', 'true');
    expect(a2).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(a1!, { key: 'ArrowRight' });
    expect(a2).toHaveAttribute('aria-selected', 'true');
    expect(a2).toHaveFocus();
    fireEvent.keyDown(a2!, { key: 'End' });
    expect(a3).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(a3!, { key: 'ArrowRight' });
    expect(a1).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(a1!, { key: 'ArrowLeft' });
    expect(a3).toHaveFocus();
    fireEvent.keyDown(a3!, { key: 'Home' });
    expect(a1).toHaveFocus();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', a1!.id);
  });
});

describe('WEB-063 AC2: datas em São Paulo', () => {
  it('02:30 UTC aparece como 04/11/2026 23:30', async () => {
    montar(1, () => ok({ itens: [bau(1)], proximoCursor: null }));
    await screen.findByText(/Pistola/);
    expect(screen.getByText('04/11/2026 23:30')).toHaveAttribute('datetime', '2026-11-05T02:30:00.000Z');
    expect(screen.getByText(/Ana,/)).toBeInTheDocument();
    expect(screen.getByText('Adicionou')).toBeInTheDocument();
  });

  it('ações de baú e de caixa mostram autor, ação e valores', async () => {
    montar(2, (url) =>
      ok({ itens: url.includes('caixa') ? [caixa(1)] : [bau(1, { acao: 'zerar', nomeItem: null, quantidade: null, saldoResultante: null, resumo: 'Zerou 3 itens' })], proximoCursor: null }),
    );
    await screen.findByText('Zerou 3 itens');
    expect(screen.getByText('Zerou o baú')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Caixa' }));
    await screen.findByText('nota 1');
    expect(screen.getByText('$2.500')).toBeInTheDocument();
    expect(screen.getByText('Saída:')).toBeInTheDocument();
    expect(screen.getByText('Dinheiro sujo')).toBeInTheDocument();
    expect(screen.getByText(/Bia,/)).toBeInTheDocument();
  });
});

describe('WEB-063 AC3: estados e paginação por cursor', () => {
  it('carregando', () => {
    montar(1, () => new Promise<Response>(() => {}));
    expect(screen.getByRole('status')).toHaveTextContent('Carregando os logs');
  });

  it('vazio', async () => {
    montar(1);
    expect(await screen.findByText('Nenhum registro')).toBeInTheDocument();
  });

  it('erro com "Tentar de novo" que refaz a chamada', async () => {
    let n = 0;
    const chamadas = montar(1, () => (++n === 1 ? json({ ok: false, codigo: 'INTERNO', erro: 'x' }, 500) : ok({ itens: [bau(1)], proximoCursor: null })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ocorreu um erro'));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText(/Pistola/);
    expect(chamadas).toHaveLength(2);
  });

  it('carregar mais usa o cursor, acrescenta e some quando acaba', async () => {
    const chamadas = montar(1, (url) =>
      url.includes('cursor=b1') ? ok({ itens: [bau(2, { nomeItem: 'Faca' })], proximoCursor: null }) : ok({ itens: [bau(1)], proximoCursor: 'b1' }),
    );
    await screen.findByText(/Pistola/);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await screen.findByText(/Faca/);
    expect(chamadas[1]).toBe('/api/logs/bau/membros?limite=20&cursor=b1');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull();
  });

  it('falha em "carregar mais" mantém a lista e permite tentar de novo', async () => {
    let n = 0;
    montar(1, (url) => {
      if (!url.includes('cursor')) return ok({ itens: [bau(1)], proximoCursor: 'b1' });
      return ++n === 1 ? json({ ok: false, codigo: 'INTERNO', erro: 'x' }, 500) : ok({ itens: [bau(2, { nomeItem: 'Faca' })], proximoCursor: null });
    });
    await screen.findByText(/Pistola/);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ocorreu um erro'));
    expect(screen.getByText(/Pistola/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await screen.findByText(/Faca/);
  });
});

describe('WEB-063 AC4: textos de usuário são texto', () => {
  it('não interpreta HTML em nome, item e anotação', async () => {
    const ataque = '<img src=x onerror=alert(1)>';
    montar(2, (url) =>
      ok({ itens: [url.includes('caixa') ? caixa(1, { anotacao: ataque, usuario: { id: '1', nome: ataque } }) : bau(1, { nomeItem: ataque, usuario: { id: '1', nome: ataque } })], proximoCursor: null }),
    );
    await screen.findAllByText(new RegExp(ataque.replace(/[()]/g, '\\$&')));
    fireEvent.click(screen.getByRole('tab', { name: 'Caixa' }));
    await screen.findByText(ataque);
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('página /logs', () => {
  it('exige nível 1 e passa o nível da sessão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ itens: [], proximoCursor: null })));
    exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 1 }, csrf: 'c' });
    render(await PaginaLogs());
    expect(exigirPagina).toHaveBeenCalledWith(1, '/logs');
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    await within(screen.getByRole('tabpanel')).findByText('Nenhum registro');
    vi.unstubAllGlobals();
  });
});
