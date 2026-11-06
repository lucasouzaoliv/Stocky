import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoPagina } from '@/server/auth/pagina';
import LayoutProtegido from '@/app/(protegido)/layout';
import { NIVEL_POR_PAGINA, nivelDaPagina } from '@/app/(protegido)/paginas';
import { ITENS_MENU } from '@/components/Navegacao';
import { SemPermissao } from '@/components/SemPermissao';
import { useSessao } from '@/components/SessaoProvider';

let caminho = '/bau/membros';
let estadoSessao: EstadoPagina;
const obterUsuarioPagina = vi.fn(async () => estadoSessao);
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock('next/navigation', () => ({
  usePathname: () => caminho,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  redirect: (d: string) => redirect(d),
}));
vi.mock('@/server/auth/pagina', () => ({ obterUsuarioPagina: () => obterUsuarioPagina() }));

const ok = (nivel: 1 | 2 | 3): EstadoPagina => ({ estado: 'ok', usuario: { id: '1', nome: 'Ana', nivel }, csrf: 'csrf-falso' });

async function renderizar(filho = <p>DADOS DA PÁGINA</p>) {
  const elemento = await LayoutProtegido({ children: filho });
  return render(elemento);
}

beforeEach(() => {
  caminho = '/bau/membros';
  estadoSessao = ok(1);
  obterUsuarioPagina.mockClear();
  redirect.mockClear();
});

describe('WEB-054 AC1: sem sessão redireciona a /login sem renderizar dados', () => {
  it('redireciona e não monta filhos', async () => {
    estadoSessao = { estado: 'sem_sessao' };
    await expect(renderizar()).rejects.toThrow('REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('DADOS DA PÁGINA')).toBeNull();
  });
});

describe('WEB-054 AC4: sessão a revalidar volta ao início do OAuth', () => {
  it('redireciona para /api/auth/login', async () => {
    estadoSessao = { estado: 'revalidar' };
    await expect(renderizar()).rejects.toThrow(/REDIRECT:\/api\/auth\/login\?volta=/);
  });
});

describe('WEB-054 AC2: nível insuficiente mostra a página 403 em português', () => {
  it.each(['/bau/gerencia', '/caixa', '/painel', '/ajuste/membros', '/ajuste/gerencia', '/auditoria'])('nível 1 em %s', async (rota) => {
    caminho = rota;
    estadoSessao = ok(1);
    await renderizar();
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(screen.queryByText('DADOS DA PÁGINA')).toBeNull();
  });

  it('/logs é nível 1: nível 1 acessa', async () => {
    caminho = '/logs';
    await renderizar();
    expect(screen.getByText('DADOS DA PÁGINA')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sem permissão' })).toBeNull();
  });

  it('nível 2 acessa a gerência', async () => {
    caminho = '/bau/gerencia';
    estadoSessao = ok(2);
    await renderizar();
    expect(screen.getByText('DADOS DA PÁGINA')).toBeInTheDocument();
  });

  it('a página sem permissão tem um caminho de volta', () => {
    render(<SemPermissao />);
    expect(screen.getByRole('link', { name: /Baú dos Membros/ })).toHaveAttribute('href', '/bau/membros');
  });
});

describe('WEB-054 AC3: tabela página × nível coerente com o menu', () => {
  it.each(ITENS_MENU.map((i) => [i.rotulo, i.href, i.nivelMinimo] as const))('%s (%s) exige o nível do menu', (_r, href, nivelMenu) => {
    expect(nivelDaPagina(href)).toBe(nivelMenu);
  });

  it.each([1, 2, 3] as const)('para cada página, o menu aparece se e somente se o nível basta (nível %i)', async (nivel) => {
    for (const { prefixo, nivel: exigido } of NIVEL_POR_PAGINA) {
      caminho = prefixo;
      estadoSessao = ok(nivel);
      const { unmount } = await renderizar();
      const ver = nivel >= exigido;
      expect(screen.queryByText('DADOS DA PÁGINA') !== null).toBe(ver);
      expect(screen.queryByRole('heading', { name: 'Sem permissão' }) !== null).toBe(!ver);
      unmount();
    }
  });

  it('caminhos de ajuste e desconhecidos', () => {
    expect(nivelDaPagina('/ajuste/membros')).toBe(2);
    expect(nivelDaPagina('/caixa?x=1')).toBe(2);
    expect(nivelDaPagina('/caixas')).toBe(1);
  });
});

describe('WEB-054 layout: sessão e navegação', () => {
  it('repassa usuário e csrf pelo SessaoProvider e usa a Navegacao pelo nível', async () => {
    estadoSessao = ok(2);
    function Sonda() {
      const { usuario, csrf } = useSessao();
      return <p>{`${usuario.nome}|${usuario.nivel}|${csrf}`}</p>;
    }
    await renderizar(<Sonda />);
    expect(screen.getByText('Ana|2|csrf-falso')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Caixa' })).toBeInTheDocument();
  });

  it('nível 1 não vê itens de gerência no menu', async () => {
    await renderizar();
    expect(screen.queryByRole('link', { name: 'Caixa' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Logs' })).toBeInTheDocument();
  });

  it('useSessao fora do provider falha de forma clara', () => {
    function Sonda() {
      useSessao();
      return null;
    }
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Sonda />)).toThrow('useSessao fora do SessaoProvider');
    erro.mockRestore();
  });
});
