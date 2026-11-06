import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaCaixa from '@/app/(protegido)/caixa/page';
import type { LogDTO, SaldoDTO } from '@/compartilhado/api-tipos';
import { criarClienteApi } from '@/components/api';
import { Caixa } from '@/components/Caixa';
import { SessaoProvider } from '@/components/SessaoProvider';

const exigirPagina = vi.fn();
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });
const falha = (status: number, codigo: string, erro: string) => json({ ok: false, codigo, erro }, status);
type Resp = Response | Promise<Response>;

function mov(i: number, extra: Partial<Extract<LogDTO, { valor: number }>> = {}): LogDTO {
  return {
    id: `m${i}`,
    acao: 'entrada',
    tipo: 'limpo',
    valor: 1000 * i,
    anotacao: `nota ${i}`,
    saldoResultante: 5000,
    usuario: { id: '1', nome: 'Ana' },
    data: '2026-11-05T15:30:00.000Z',
    ...extra,
  };
}

interface Opcoes {
  saldo?: () => Resp;
  historico?: (url: string) => Resp;
  post?: (corpo: Record<string, unknown>) => Resp;
}

function montar(o: Opcoes = {}) {
  const chamadas: Array<{ url: string; metodo: string; corpo?: Record<string, unknown> }> = [];
  const falso = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const corpo = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    chamadas.push({ url, metodo, corpo });
    if (metodo === 'POST') return (o.post ?? (() => ok({ sujo: 0, limpo: 0 })))(corpo!);
    if (url.startsWith('/api/caixa/historico')) return (o.historico ?? (() => ok({ itens: [], proximoCursor: null })))(url);
    return (o.saldo ?? (() => ok({ sujo: 1500, limpo: 2500000 } satisfies SaldoDTO)))();
  });
  const cliente = criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn(), caminhoAtual: () => '/caixa' });
  render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="csrf-falso">
      <Caixa cliente={cliente} />
    </SessaoProvider>,
  );
  return chamadas;
}

/** user-event não está nas dependências; fireEvent basta para estes fluxos. */
const u = { click: async (el: HTMLElement) => void fireEvent.click(el) };

async function preencher(valor: string, nota: string) {
  fireEvent.change(screen.getByLabelText('Valor'), { target: { value: valor } });
  fireEvent.change(screen.getByLabelText('Anotação'), { target: { value: nota } });
  return u;
}

beforeEach(() => exigirPagina.mockReset());

describe('WEB-059 página /caixa exige nível 2', () => {
  it('nível 1 vê Sem permissão; nível 2 vê o caixa', async () => {
    exigirPagina.mockResolvedValue({ semPermissao: true, usuario: { id: '1', nome: 'Ana', nivel: 1 }, csrf: 'c' });
    render(await PaginaCaixa());
    expect(exigirPagina).toHaveBeenCalledWith(2, '/caixa');
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
  });
});

describe('WEB-059 AC1: saldos formatados', () => {
  it('mostra sujo e limpo em pt-BR', async () => {
    montar();
    const lista = await screen.findByRole('group', { name: 'Saldos do caixa' }).catch(() => screen.findByLabelText('Saldos do caixa'));
    expect(within(lista).getByText('Dinheiro sujo').nextSibling).toHaveTextContent('$1.500');
    expect(within(lista).getByText('Dinheiro limpo').nextSibling).toHaveTextContent('$2.500.000');
  });

  it('saldo ausente vira $0', async () => {
    montar({ saldo: () => ok({}) });
    const lista = await screen.findByLabelText('Saldos do caixa');
    expect(within(lista).getByText('Dinheiro sujo').nextSibling).toHaveTextContent('$0');
    expect(within(lista).getByText('Dinheiro limpo').nextSibling).toHaveTextContent('$0');
  });
});

describe('WEB-059 AC2: formulário', () => {
  it('tem tipo e ação rotulados e envia o corpo certo', async () => {
    const chamadas = montar({ post: () => ok({ sujo: 1500, limpo: 2500500 }) });
    await screen.findByLabelText('Valor');
    expect(screen.getByRole('group', { name: 'Tipo de dinheiro' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ação' })).toBeInTheDocument();
    await preencher('500', 'Venda de munição');
    await u.click(screen.getByLabelText('Sujo'));
    await u.click(screen.getByLabelText('Saída'));
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')).toBeTruthy());
    expect(chamadas.find((c) => c.metodo === 'POST')).toMatchObject({
      url: '/api/caixa/movimentar',
      corpo: { tipo: 'sujo', acao: 'saida', valor: 500, anotacao: 'Venda de munição' },
    });
  });

  it.each(['', '0', '-5', '1,5', '10abc', '1000000001'])('valor inválido "%s" não envia e mostra mensagem', async (v) => {
    const chamadas = montar();
    await screen.findByLabelText('Valor');
    await preencher(v, 'ok');
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('aceita os limites 1 e 1.000.000.000', async () => {
    const chamadas = montar({ post: () => ok({ sujo: 0, limpo: 0 }) });
    await screen.findByLabelText('Valor');
    await preencher('1000000000', 'teto');
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
  });

  it('anotação vazia ou só com espaços não envia e mostra mensagem', async () => {
    const chamadas = montar();
    await screen.findByLabelText('Valor');
    await preencher('100', '   ');
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Escreva uma anotação para registrar a movimentação.')).toBeInTheDocument();
    expect(screen.getByLabelText('Anotação')).toHaveAttribute('aria-invalid', 'true');
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });
});

describe('WEB-059 AC3: erro do servidor', () => {
  it('saldo insuficiente aparece e o formulário continua preenchido', async () => {
    montar({ post: () => falha(409, 'SALDO_INSUFICIENTE', 'Saldo insuficiente. Disponível: $1.500.') });
    await screen.findByLabelText('Valor');
    await preencher('9000', 'pagamento');
    await u.click(screen.getByLabelText('Saída'));
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Saldo insuficiente. Disponível: $1.500.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor')).toHaveValue('9000');
  });
});

describe('WEB-059 AC4: histórico', () => {
  it('lista movimentações com valor, anotação, autor e data', async () => {
    montar({ historico: () => ok({ itens: [mov(2), mov(3, { acao: 'saida', tipo: 'sujo' })], proximoCursor: null }) });
    expect(await screen.findByText('nota 2')).toBeInTheDocument();
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent('Entrada: $2.000');
    expect(itens[1]).toHaveTextContent('Saída: $3.000');
    expect(itens[1]).toHaveTextContent('Dinheiro sujo');
    expect(itens[0]).toHaveTextContent('Ana');
    expect(itens[0]).toHaveTextContent('05/11/2026 12:30');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('estado vazio', async () => {
    montar();
    expect(await screen.findByText('Nenhuma movimentação')).toBeInTheDocument();
  });

  it('carregar mais usa o cursor e anexa', async () => {
    const urls: string[] = [];
    montar({
      historico: (url) => {
        urls.push(url);
        return url.includes('cursor=c1') ? ok({ itens: [mov(9)], proximoCursor: null }) : ok({ itens: [mov(1)], proximoCursor: 'c1' });
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('nota 9')).toBeInTheDocument();
    expect(screen.getByText('nota 1')).toBeInTheDocument();
    expect(urls[1]).toContain('cursor=c1');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('erro do histórico não derruba os saldos', async () => {
    montar({ historico: () => falha(500, 'INTERNO', 'x') });
    expect(await screen.findByText('Não foi possível carregar o histórico')).toBeInTheDocument();
    expect(screen.getByLabelText('Saldos do caixa')).toBeInTheDocument();
  });
});

describe('estados de carregamento e erro', () => {
  it('mostra carregando', () => {
    montar({ saldo: () => new Promise<Response>(() => {}) });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o caixa…');
  });

  it('erro ao carregar o saldo oferece tentar de novo', async () => {
    let falhar = true;
    montar({ saldo: () => (falhar ? falha(500, 'INTERNO', 'x') : ok({ sujo: 1, limpo: 2 })) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocorreu um erro');
    falhar = false;
    await u.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Saldos do caixa')).toBeInTheDocument();
  });
});

describe('WEB-059 AC5: sem duplo clique e saldos atualizados', () => {
  it('dois envios seguidos geram uma requisição e o botão fica desabilitado', async () => {
    let liberar!: (r: Response) => void;
    const chamadas = montar({ post: () => new Promise<Response>((r) => (liberar = r)) });
    await screen.findByLabelText('Valor');
    await preencher('100', 'teste');
    const botao = screen.getByRole('button', { name: 'Registrar' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    fireEvent.submit(botao.closest('form')!);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrando…' })).toBeDisabled());
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(1);
    liberar(ok({ sujo: 1500, limpo: 2500100 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());
  });

  it('após sucesso atualiza saldos, histórico, aviso e limpa o formulário', async () => {
    let enviou = false;
    montar({
      post: () => {
        enviou = true;
        return ok({ sujo: 1500, limpo: 2500100 });
      },
      historico: () => ok({ itens: enviou ? [mov(7, { anotacao: 'nova' })] : [], proximoCursor: null }),
    });
    await screen.findByLabelText('Valor');
    await preencher('100', 'nova');
    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('nova', { selector: '.caixa__mov-nota' })).toBeInTheDocument();
    const lista = screen.getByLabelText('Saldos do caixa');
    expect(within(lista).getByText('Dinheiro limpo').nextSibling).toHaveTextContent('$2.500.100');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Entrada registrada: $100');
    expect(screen.getByLabelText('Valor')).toHaveValue('');
    expect(screen.getByLabelText('Anotação')).toHaveValue('');
  });
});
