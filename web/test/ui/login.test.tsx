import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelaLogin, MENSAGEM_LOGIN_GENERICA } from '@/components/TelaLogin';
import { MENSAGENS_LOGIN } from '@/compartilhado/erros';

const redirecionar = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});
vi.mock('next/navigation', () => ({ redirect: (d: string) => redirecionar(d) }));
const haSessaoValida = vi.fn();
vi.mock('@/app/login/usuario-logado', () => ({ haSessaoValida: () => haSessaoValida() }));

beforeEach(() => {
  redirecionar.mockClear();
  haSessaoValida.mockReset();
});

describe('WEB-055 AC1: botão', () => {
  it('mostra "Entrar com Discord" apontando para /api/auth/login', () => {
    render(<TelaLogin />);
    const link = screen.getByRole('link', { name: 'Entrar com Discord' });
    expect(link).toHaveAttribute('href', '/api/auth/login');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('WEB-055 AC2: mensagens de erro', () => {
  it.each(Object.entries(MENSAGENS_LOGIN))('código %s mostra a mensagem em português', (codigo, mensagem) => {
    render(<TelaLogin erro={codigo} />);
    expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
  });

  it.each(['<img src=x onerror=alert(1)>', 'inventado', '__proto__', 'constructor', 'toString'])(
    'código desconhecido %s mostra mensagem genérica sem refletir o valor',
    (valor) => {
      const { container } = render(<TelaLogin erro={valor} />);
      expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM_LOGIN_GENERICA);
      expect(container.innerHTML).not.toContain(valor === 'inventado' ? 'inventado' : '<img');
      expect(container.querySelector('img')).toBeNull();
      if (valor !== 'inventado') expect(container.textContent).not.toContain(valor);
    },
  );
});

describe('WEB-055 AC3: usuário já logado', () => {
  it('redireciona ao início', async () => {
    haSessaoValida.mockResolvedValue(true);
    const { default: Login } = await import('@/app/login/page');
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/');
    expect(redirecionar).toHaveBeenCalledWith('/');
  });

  it('sem sessão renderiza a tela, repassando ?erro=', async () => {
    haSessaoValida.mockResolvedValue(false);
    const { default: Login } = await import('@/app/login/page');
    render(await Login({ searchParams: Promise.resolve({ erro: 'negado' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent(MENSAGENS_LOGIN.negado!);
    expect(redirecionar).not.toHaveBeenCalled();
  });

  it('?erro= repetido usa só o primeiro valor', async () => {
    haSessaoValida.mockResolvedValue(false);
    const { default: Login } = await import('@/app/login/page');
    render(await Login({ searchParams: Promise.resolve({ erro: ['state', 'negado'] }) }));
    expect(screen.getByRole('alert')).toHaveTextContent(MENSAGENS_LOGIN.state!);
  });
});

describe('WEB-055 AC4: sem variáveis de ambiente', () => {
  it('a tela não importa env nem lê process.env', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    for (const arq of ['src/components/TelaLogin.tsx', 'src/app/login/page.tsx']) {
      const fonte = await readFile(path.resolve(process.cwd(), arq), 'utf8');
      expect(fonte).not.toMatch(/process\.env|server\/env|getEnv/);
    }
  });
});
