import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaAuditoria from '@/app/(protegido)/auditoria/page';
import type { AuditoriaDetalheDTO, AuditoriaResumoDTO } from '@/compartilhado/api-tipos';
import { criarClienteApi } from '@/components/api';
import { Auditoria } from '@/components/Auditoria';

const exigirPagina = vi.fn();
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });
type Resp = Response | Promise<Response>;

function reg(i: number, extra: Partial<AuditoriaResumoDTO> = {}): AuditoriaResumoDTO {
  return { id: `a${i}`, acao: 'catalogo.remover_item', usuario: { id: '9', nome: 'Dono' }, data: '2026-11-05T02:30:00.000Z', resumo: `Resumo ${i}`, ...extra };
}
const detalhe = (r: AuditoriaResumoDTO, antes: unknown, depois: unknown): AuditoriaDetalheDTO => ({ ...r, alvo: {}, antes, depois });

function montar(resp: (url: string) => Resp) {
  const chamadas: string[] = [];
  const fetchFalso = vi.fn(async (url: string) => {
    chamadas.push(url);
    return resp(url);
  });
  const cliente = criarClienteApi({ fetch: fetchFalso as unknown as typeof fetch, navegar: vi.fn() });
  render(<Auditoria cliente={cliente} />);
  return chamadas;
}
const lista = (itens: AuditoriaResumoDTO[], proximoCursor: string | null = null) => ok({ itens, proximoCursor });

beforeEach(() => exigirPagina.mockReset());

describe('WEB-064 AC1: lista', () => {
  it('mostra ação em português, quem, quando (São Paulo) e resumo', async () => {
    montar(() => lista([reg(1), reg(2, { acao: 'bau.zerar' }), reg(3, { acao: 'bau.ajuste_massa' }), reg(4, { acao: 'catalogo.adicionar_item' })]));
    await screen.findByText('Resumo 1');
    for (const t of ['Item removido do catálogo', 'Baú zerado', 'Ajuste em massa', 'Item adicionado ao catálogo']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Dono,/)).toHaveLength(4);
    expect(screen.getAllByText('04/11/2026 23:30')[0]).toHaveAttribute('datetime', '2026-11-05T02:30:00.000Z');
  });

  it('estados: carregando, vazio e erro', async () => {
    montar(() => new Promise<Response>(() => {}));
    expect(screen.getByRole('status')).toHaveTextContent('Carregando a auditoria');
  });

  it('vazio', async () => {
    montar(() => lista([]));
    expect(await screen.findByText('Nenhum registro')).toBeInTheDocument();
  });

  it('erro com tentar de novo', async () => {
    let n = 0;
    montar(() => (++n === 1 ? json({ ok: false, codigo: 'INTERNO', erro: 'x' }, 500) : lista([reg(1)])));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ocorreu um erro'));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText('Resumo 1');
  });
});

describe('WEB-064 AC2: filtro por ação', () => {
  it('chama a API com o parâmetro acao e volta ao sem filtro', async () => {
    const chamadas = montar(() => lista([reg(1)]));
    await screen.findByText('Resumo 1');
    expect(chamadas).toEqual(['/api/auditoria?limite=20']);
    fireEvent.change(screen.getByLabelText('Filtrar por ação'), { target: { value: 'bau.zerar' } });
    await waitFor(() => expect(chamadas).toContain('/api/auditoria?limite=20&acao=bau.zerar'));
    fireEvent.change(screen.getByLabelText('Filtrar por ação'), { target: { value: '' } });
    await waitFor(() => expect(chamadas.at(-1)).toBe('/api/auditoria?limite=20'));
    const opcoes = within(screen.getByLabelText('Filtrar por ação')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(opcoes).toEqual(['', 'catalogo.adicionar_item', 'catalogo.remover_item', 'bau.zerar', 'bau.ajuste_massa']);
  });

  it('com filtro e sem resultado explica que não há ações daquele tipo', async () => {
    montar((url) => (url.includes('acao=') ? lista([]) : lista([reg(1)])));
    await screen.findByText('Resumo 1');
    fireEvent.change(screen.getByLabelText('Filtrar por ação'), { target: { value: 'bau.zerar' } });
    expect(await screen.findByText('Nenhuma ação deste tipo foi registrada.')).toBeInTheDocument();
  });

  it('resposta antiga de um filtro anterior não sobrescreve a atual', async () => {
    let soltar: (r: Response) => void = () => {};
    montar((url) => (url.includes('acao=') ? lista([reg(2)]) : new Promise<Response>((r) => (soltar = r))));
    fireEvent.change(await screen.findByLabelText('Filtrar por ação'), { target: { value: 'bau.zerar' } });
    await screen.findByText('Resumo 2');
    soltar(await lista([reg(1)]));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('Resumo 1')).toBeNull();
  });
});

describe('WEB-064 AC3: detalhe antes/depois e paginação', () => {
  it('remover_item: {membros, gerencia} antes, depois vazio', async () => {
    const r = reg(1);
    const chamadas = montar((url) => (url === '/api/auditoria/a1' ? ok(detalhe(r, { membros: 3, gerencia: 1200 }, null)) : lista([r])));
    await screen.findByText('Resumo 1');
    const botao = screen.getByRole('button', { name: 'Ver detalhes' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    const antes = await screen.findByRole('region', { name: 'Antes' });
    expect(within(antes).getByText('Baú dos Membros')).toBeInTheDocument();
    expect(within(antes).getByText('3')).toBeInTheDocument();
    expect(within(antes).getByText('1.200')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Depois' })).getByText('Não se aplica')).toBeInTheDocument();
    expect(chamadas).toContain('/api/auditoria/a1');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar detalhes' }));
    expect(screen.queryByRole('region', { name: 'Antes' })).toBeNull();
  });

  it('zerar: um grupo por baú com categoria, item e quantidade; depois {} = Nada', async () => {
    const r = reg(1, { acao: 'bau.zerar' });
    montar((url) =>
      url === '/api/auditoria/a1'
        ? ok(detalhe(r, { membros: { armas: { pistola: 4 } }, gerencia: { drogas: { cafe: 7 } } }, {}))
        : lista([r]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    const antes = await screen.findByRole('region', { name: 'Antes' });
    const membros = within(antes).getByRole('region', { name: 'Baú dos Membros' });
    expect(within(membros).getByText('armas')).toBeInTheDocument();
    expect(within(membros).getByText('pistola')).toBeInTheDocument();
    expect(within(membros).getByText('4')).toBeInTheDocument();
    expect(within(within(antes).getByRole('region', { name: 'Baú da Gerência' })).getByText('cafe')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Depois' })).getByText('Nada')).toBeInTheDocument();
  });

  it('ajuste_massa: mapas categoria→item→qtd lado a lado', async () => {
    const r = reg(1, { acao: 'bau.ajuste_massa' });
    montar((url) =>
      url === '/api/auditoria/a1' ? ok(detalhe(r, { armas: { pistola: 4 } }, { armas: { pistola: 10 }, extras: { radio: 1 } })) : lista([r]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    const depois = await screen.findByRole('region', { name: 'Depois' });
    expect(within(depois).getByText('10')).toBeInTheDocument();
    expect(within(depois).getByRole('region', { name: 'Categoria extras' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Antes' })).getByText('4')).toBeInTheDocument();
  });

  it('formato desconhecido cai em JSON como texto; falha de detalhe tem tentar de novo', async () => {
    const r = reg(1);
    let n = 0;
    montar((url) => {
      if (url !== '/api/auditoria/a1') return lista([r]);
      return ++n === 1 ? json({ ok: false, codigo: 'NAO_ENCONTRADO', erro: 'Registro não encontrado.' }, 404) : ok(detalhe(r, { x: '<img src=x onerror=alert(1)>' }, null));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    await screen.findByText('Registro não encontrado.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText(/onerror=alert/);
    expect(document.querySelector('img')).toBeNull();
  });

  it('só um detalhe aberto por vez', async () => {
    const r1 = reg(1);
    const r2 = reg(2);
    montar((url) => (url.startsWith('/api/auditoria/') ? ok(detalhe(r1, { membros: 1 }, null)) : lista([r1, r2])));
    const botoes = await screen.findAllByRole('button', { name: 'Ver detalhes' });
    fireEvent.click(botoes[0]!);
    await screen.findByRole('region', { name: 'Antes' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalhes' })[0]!);
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Antes' })).toHaveLength(1));
  });

  it('carregar mais usa o cursor e mantém o filtro', async () => {
    const chamadas = montar((url) => (url.includes('cursor=a1') ? lista([reg(2)]) : lista([reg(1)], 'a1')));
    await screen.findByText('Resumo 1');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await screen.findByText('Resumo 2');
    expect(chamadas[1]).toBe('/api/auditoria?limite=20&cursor=a1');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });
});

describe('WEB-064 AC4: somente leitura', () => {
  it('só há botões de ver detalhes e carregar mais; nenhuma chamada altera dados', async () => {
    const r = reg(1);
    const metodos: string[] = [];
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      metodos.push(init?.method ?? 'GET');
      return url === '/api/auditoria/a1' ? ok(detalhe(r, null, null)) : lista([r], 'a1');
    });
    render(<Auditoria cliente={criarClienteApi({ fetch: fetchFalso as unknown as typeof fetch })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    await screen.findByRole('region', { name: 'Antes' });
    const nomes = screen.getAllByRole('button').map((b) => b.textContent);
    expect(nomes.sort()).toEqual(['Carregar mais', 'Ocultar detalhes']);
    expect(metodos.every((m) => m === 'GET')).toBe(true);
    expect(document.querySelector('form, input[type=text], textarea')).toBeNull();
  });
});

describe('página /auditoria', () => {
  it('exige nível 2 no servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => lista([])));
    exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 2 }, csrf: 'c' });
    render(await PaginaAuditoria());
    expect(exigirPagina).toHaveBeenCalledWith(2, '/auditoria');
    expect(await screen.findByRole('heading', { level: 1, name: 'Auditoria' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('nível 1 vê Sem permissão e nenhuma chamada de dados', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    exigirPagina.mockResolvedValue({ semPermissao: true, usuario: { id: '1', nome: 'Ana', nivel: 1 }, csrf: 'c' });
    render(await PaginaAuditoria());
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
