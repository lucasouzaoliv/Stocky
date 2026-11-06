import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaBau, { generateMetadata } from '@/app/(protegido)/bau/[tipo]/page';

const exigirPagina = vi.fn();
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => notFound(), usePathname: () => '/bau/membros' }));

const usuario = (nivel: 1 | 2 | 3) => ({ usuario: { id: '1', nome: 'Ana', nivel }, csrf: 'csrf-falso' });
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const CAT = { categorias: [{ id: 'armas', nome: 'Armas', emoji: 'x', total: 1, itens: [{ id: 'pistola', nome: 'Pistola' }] }] };

function simularFetch(opts: { bau?: () => Response | Promise<Response> } = {}) {
  const chamadas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url === '/api/catalogo') return json({ ok: true, dados: CAT });
      return (opts.bau ?? (() => json({ ok: true, dados: { tipo: 'x', versao: 1, categorias: [{ id: 'armas', nome: 'Armas', emoji: 'x', itens: [{ id: 'pistola', nome: 'Pistola', quantidade: 4 }] }] } })))();
    }),
  );
  return chamadas;
}

async function abrir(tipo: string) {
  const elemento = await PaginaBau({ params: Promise.resolve({ tipo }) });
  return render(elemento);
}

beforeEach(() => {
  exigirPagina.mockReset();
  notFound.mockClear();
  vi.unstubAllGlobals();
});

describe('WEB-058 AC1: só consome /api/bau/<tipo> e /api/catalogo', () => {
  it('chama as rotas do tipo certo', async () => {
    exigirPagina.mockResolvedValue(usuario(1));
    const chamadas = simularFetch();
    await abrir('membros');
    await screen.findByText('Pistola');
    expect(chamadas.sort()).toEqual(['/api/bau/membros', '/api/catalogo']);
  });
});

describe('WEB-058 AC2: nível por baú', () => {
  it('membros exige nível 1 e gerência exige nível 2 no servidor', async () => {
    exigirPagina.mockResolvedValue(usuario(2));
    simularFetch();
    await abrir('membros');
    expect(exigirPagina).toHaveBeenLastCalledWith(1, '/bau/membros');
    await abrir('gerencia');
    expect(exigirPagina).toHaveBeenLastCalledWith(2, '/bau/gerencia');
  });

  it('nível 1 em /bau/gerencia vê "Sem permissão" e nenhuma chamada de dados', async () => {
    exigirPagina.mockResolvedValue({ semPermissao: true, ...usuario(1) });
    const chamadas = simularFetch();
    await abrir('gerencia');
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
  });

  it('nível 2 renderiza o baú da gerência', async () => {
    exigirPagina.mockResolvedValue(usuario(2));
    simularFetch();
    await abrir('gerencia');
    expect(await screen.findByText('Pistola')).toBeInTheDocument();
  });

  it('tipo desconhecido vira 404 sem consultar a sessão', async () => {
    await expect(abrir('outro')).rejects.toThrow('NOT_FOUND');
    expect(exigirPagina).not.toHaveBeenCalled();
  });
});

describe('WEB-058 AC3: estados', () => {
  beforeEach(() => exigirPagina.mockResolvedValue(usuario(1)));

  it('carregando', async () => {
    simularFetch({ bau: () => new Promise<Response>(() => {}) });
    await abrir('membros');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o baú…');
  });

  it('vazio', async () => {
    simularFetch({ bau: () => json({ ok: true, dados: { tipo: 'membros', versao: 1, categorias: [] } }) });
    await abrir('membros');
    // baú sem estoque: o resumo zera e todo item do catálogo aparece sem quantidade
    const resumo = await screen.findByLabelText('Resumo do baú');
    expect(resumo.querySelector('dd')).toHaveTextContent('0');
    expect(screen.queryAllByRole('button', { name: /^Retirar / }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('erro', async () => {
    simularFetch({ bau: () => json({ ok: false, codigo: 'INTERNO', erro: 'x' }, 500) });
    await abrir('membros');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ocorreu um erro'));
  });
});

describe('WEB-058 AC4: título e nome acessível distintos', () => {
  it.each([
    ['membros', 'Baú dos Membros', 1],
    ['gerencia', 'Baú da Gerência', 2],
  ] as const)('%s', async (tipo, titulo, nivel) => {
    exigirPagina.mockResolvedValue(usuario(nivel));
    simularFetch();
    await abrir(tipo);
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: titulo })).toBeInTheDocument();
    expect(await generateMetadata({ params: Promise.resolve({ tipo }) })).toEqual({ title: titulo });
  });
});
