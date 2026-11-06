import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Erro from '@/app/error';
import CarregandoRota from '@/app/(protegido)/loading';
import NaoEncontrada from '@/app/not-found';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';

describe('WEB-056 Carregando', () => {
  it('tem role="status" e texto acessível', () => {
    render(<Carregando />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });
  it('aceita mensagem própria', () => {
    render(<Carregando mensagem="Buscando o baú…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando o baú…');
  });
});

describe('WEB-056 Vazio', () => {
  it('mostra título, descrição e ação recebidos por props', () => {
    render(<Vazio titulo="Baú vazio" descricao="Adicione o primeiro item." acao={<button>Adicionar</button>} />);
    expect(screen.getByRole('heading', { name: 'Baú vazio' })).toBeInTheDocument();
    expect(screen.getByText('Adicione o primeiro item.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
  });
  it('funciona sem descrição nem ação', () => {
    render(<Vazio titulo="Nada por aqui" />);
    expect(screen.getByRole('heading', { name: 'Nada por aqui' })).toBeInTheDocument();
  });
});

describe('WEB-056 ErroTela', () => {
  it('tem role="alert" com a mensagem recebida', () => {
    render(<ErroTela mensagem="Não foi possível carregar o baú." aoTentarNovamente={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o baú.');
  });
  it('"Tentar de novo" chama o callback', () => {
    const cb = vi.fn();
    render(<ErroTela mensagem="Falhou." aoTentarNovamente={cb} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it('sem callback não mostra o botão', () => {
    render(<ErroTela mensagem="Falhou." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('WEB-056 páginas de estado das rotas', () => {
  it('error.tsx não exibe texto técnico nem stack e chama reset', () => {
    const reset = vi.fn();
    const erro = Object.assign(new Error('ECONNREFUSED firestore stack secreta'), { digest: 'abc123' });
    render(<Erro error={erro} reset={reset} />);
    const alerta = screen.getByRole('alert');
    expect(alerta).not.toHaveTextContent(/ECONNREFUSED|firestore|stack|abc123/i);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
  it('loading.tsx mostra o estado de carregamento', () => {
    render(<CarregandoRota />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('not-found.tsx oferece caminho de volta', () => {
    render(<NaoEncontrada />);
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
