import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { criarClienteApi } from '@/components/api';
import { Calculadora } from '@/components/Calculadora';
import { Dados } from '@/components/Dados';
import { Drogas } from '@/components/Drogas';
import { SessaoProvider } from '@/components/SessaoProvider';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });

function montar(componente: (c: ReturnType<typeof criarClienteApi>) => React.ReactElement, rotas: Record<string, (corpo?: Record<string, unknown>) => Response>, nivel: 1 | 2 = 1) {
  const chamadas: Array<{ url: string; metodo: string; corpo?: Record<string, unknown> }> = [];
  const falso = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const corpo = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    chamadas.push({ url, metodo, corpo });
    return (rotas[`${metodo} ${url}`] ?? (() => ok({})))(corpo);
  });
  const cliente = criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn(), caminhoAtual: () => '/x' });
  render(<SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel }} csrf="csrf-falso">{componente(cliente)}</SessaoProvider>);
  return chamadas;
}

describe('Calculadora', () => {
  it('calcula pista, atacado acima de 300 e parceria sem registrar nada', () => {
    render(<Calculadora />);
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '10' } });
    expect(screen.getByRole('status')).toHaveTextContent('$2.300');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '400' } });
    expect(screen.getByRole('status')).toHaveTextContent('$86.000');
    fireEvent.click(screen.getByLabelText(/Parceria/));
    expect(screen.getByRole('status')).toHaveTextContent('$80.000');
  });
});

describe('Drogas', () => {
  const estado = (pend: number) => ok({ tipo: 'membros', versao: 1, estoque: 120, minhaPendencia: pend });

  it('retirar para venda abre a janela com o cálculo e só registra ao confirmar', async () => {
    const chamadas = montar((c) => <Drogas cliente={c} />, {
      'GET /api/drogas/membros': () => estado(0),
      'POST /api/drogas/membros/movimentar': () => ok({ estoque: 110, versao: 2, esperado: 2300, devido: 2300 }),
    });
    await screen.findByText('120');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'pista' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    const janela = await screen.findByRole('dialog');
    expect(within(janela).getByText('$2.300')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
    fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar retirada' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({ acao: 'retirar', quantidade: 10, motivo: 'pista' }));
    expect(await screen.findByText(/Falta depositar \$2\.300/)).toBeInTheDocument();
  });

  it('mostra o aviso de pendência e registra o depósito', async () => {
    const chamadas = montar((c) => <Drogas cliente={c} />, {
      'GET /api/drogas/membros': () => estado(1500),
      'POST /api/drogas/depositar': () => ok({ devido: 0 }),
    });
    expect(await screen.findByRole('alert', { name: 'Pendência de depósito' })).toHaveTextContent('$1.500');
    fireEvent.change(screen.getByLabelText('Valor depositado'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar depósito' }));
    await waitFor(() => expect(chamadas.find((c) => c.url === '/api/drogas/depositar')?.corpo).toEqual({ valor: 1500 }));
  });

  it('exige quantidade e motivo, e só a gerência escolhe o baú', async () => {
    montar((c) => <Drogas cliente={c} />, { 'GET /api/drogas/membros': () => estado(0) });
    await screen.findByText('120');
    expect(screen.queryByText('Gerência')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Escolha o motivo.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Dados', () => {
  it('mostra pendentes e rankings', async () => {
    montar((c) => <Dados cliente={c} />, {
      'GET /api/dados': () =>
        ok({
          amostra: { droga: 3, caixa: 2 },
          retiradasDroga: [{ usuarioId: '1', nome: 'Ana', valor: 20 }],
          depositosCaixa: [],
          retiradasCaixa: [],
          vendas: [{ usuarioId: '1', nome: 'Ana', vendido: 4600, depositado: 0, falta: 4600 }],
          pendentes: [{ usuarioId: '1', nome: 'Ana', devido: 4600, desde: '2026-11-07T10:00:00.000Z' }],
        }),
    }, 2);
    expect(await screen.findByText('Quem pegou droga e não depositou')).toBeInTheDocument();
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(1);
    expect(screen.getByText('Falta $4.600')).toBeInTheDocument();
  });
});
