import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BauDTO, CatalogoDTO } from '@/compartilhado/api-tipos';
import { Bau } from '@/components/Bau';
import { criarClienteApi } from '@/components/api';
import { SessaoProvider } from '@/components/SessaoProvider';

const CATALOGO: CatalogoDTO = {
  categorias: [
    { id: 'armas', nome: 'Armas', emoji: '🔫', total: 2, itens: [{ id: 'pistola', nome: 'Pistola' }, { id: 'faca', nome: 'Faca' }] },
    { id: 'drogas', nome: 'Drogas', emoji: '💊', total: 1, itens: [{ id: 'weed', nome: 'Weed' }] },
  ],
};

function bauCom(itens: Record<string, Record<string, number>>, versao = 1): BauDTO {
  const nomes: Record<string, string> = { pistola: 'Pistola', faca: 'Faca', weed: 'Weed' };
  return {
    tipo: 'membros',
    versao,
    categorias: CATALOGO.categorias.map((c) => ({
      id: c.id,
      nome: c.nome,
      emoji: c.emoji,
      itens: Object.entries(itens[c.id] ?? {}).map(([id, quantidade]) => ({ id, nome: nomes[id]!, quantidade })),
    })),
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });
const erro = (status: number, codigo: string, mensagem: string) => json({ ok: false, codigo, erro: mensagem }, status);

type Resp = Response | Promise<Response>;
function montar(opts: { bau?: () => Resp; catalogo?: () => Resp; post?: (url: string, corpo: unknown) => Resp }) {
  const chamadas: Array<{ url: string; metodo: string; corpo?: unknown; headers: Record<string, string> }> = [];
  const falso = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const corpo = init?.body ? JSON.parse(init.body as string) : undefined;
    chamadas.push({ url, metodo, corpo, headers: (init?.headers ?? {}) as Record<string, string> });
    if (metodo === 'POST') return opts.post!(url, corpo);
    if (url === '/api/catalogo') return (opts.catalogo ?? (() => ok(CATALOGO)))();
    return opts.bau!();
  });
  const cliente = criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn(), caminhoAtual: () => '/bau/membros' });
  return { cliente, chamadas };
}

function renderizar(cliente: ReturnType<typeof criarClienteApi>) {
  return render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 1 }} csrf="csrf-falso">
      <Bau tipo="membros" titulo="Baú dos Membros" cliente={cliente} />
    </SessaoProvider>,
  );
}

describe('WEB-057 estados de carregamento, vazio e erro', () => {
  it('mostra carregando e depois o conteúdo', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 3 } })) });
    renderizar(cliente);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o baú…');
    expect(await screen.findByText('Pistola')).toBeInTheDocument();
  });

  it('AC1: agrupa por categoria, mostra quantidades e esconde categorias vazias', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 1500, faca: 2 } })) });
    renderizar(cliente);
    const armas = await screen.findByRole('region', { name: /Armas/ });
    expect(within(armas).getByText('Pistola')).toBeInTheDocument();
    expect(within(armas).getByText('1.500')).toBeInTheDocument();
    expect(within(armas).getByText('Faca')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Drogas/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Baú dos Membros' })).toBeInTheDocument();
  });

  it('AC1: baú sem itens mostra "Nenhum item" e mantém o formulário', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({})) });
    renderizar(cliente);
    expect(await screen.findByRole('heading', { name: 'Nenhum item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
  });

  it('erro do baú mostra alerta e "Tentar de novo" recarrega', async () => {
    let falhar = true;
    const { cliente } = montar({ bau: () => (falhar ? erro(500, 'INTERNO', 'stack interno') : ok(bauCom({ armas: { faca: 1 } }))) });
    renderizar(cliente);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Ocorreu um erro. Tente de novo em instantes.');
    expect(alerta).not.toHaveTextContent('stack');
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Faca')).toBeInTheDocument();
  });

  it('erro do catálogo também vira erro de tela', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({})), catalogo: () => erro(403, 'SEM_PERMISSAO', 'x') });
    renderizar(cliente);
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
  });

  it('sem conexão mostra mensagem de rede', async () => {
    const cliente = criarClienteApi({ fetch: (async () => { throw new Error('off'); }) as unknown as typeof fetch, navegar: vi.fn() });
    renderizar(cliente);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
  });
});

describe('WEB-057 AC2: campo de quantidade', () => {
  async function pronto() {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5 } })), post: () => ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 6, versao: 2 }) });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    return m;
  }

  it('tem rótulo associado e inputMode numérico', async () => {
    await pronto();
    const campo = screen.getByLabelText('Quantidade');
    expect(campo).toHaveAttribute('inputmode', 'numeric');
  });

  it.each(['0', '-3', '1.5', '2,5', 'abc', '10abc', '100001', ''])('rejeita "%s" no cliente, com mensagem, sem chamar a API', async (valor) => {
    const { chamadas } = await pronto();
    const antes = chamadas.length;
    const campo = screen.getByLabelText('Quantidade');
    fireEvent.change(campo, { target: { value: valor } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const msg = await screen.findByRole('alert');
    expect(msg.textContent?.length).toBeGreaterThan(5);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo.getAttribute('aria-describedby')).toBe(msg.id);
    expect(chamadas.length).toBe(antes);
  });

  it('aceita o limite de 100.000', async () => {
    const { chamadas } = await pronto();
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'POST')!.corpo).toMatchObject({ quantidade: 100000 });
  });

  it('valor aceito pelo cliente mas recusado pelo servidor (400) mostra o erro da API', async () => {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5 } })), post: () => erro(400, 'VALIDACAO', 'Quantidade inválida no servidor.') });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Quantidade inválida no servidor.');
  });
});

describe('WEB-057 AC3: envio, bloqueio de duplo envio e aviso', () => {
  it('desabilita os botões durante o envio, atualiza a lista e avisa em aria-live', async () => {
    let atual = bauCom({ armas: { pistola: 5 } });
    let liberar!: (r: Response) => void;
    const m = montar({
      bau: () => ok(atual),
      post: () => new Promise<Response>((r) => { liberar = r; }),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    const botao = screen.getByRole('button', { name: 'Adicionar' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(botao).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Remover' })).toBeDisabled();
    expect(m.chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(1);

    atual = bauCom({ armas: { pistola: 8 } }, 2);
    liberar(await ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 8, versao: 2 }));

    await waitFor(() => expect(botao).toBeEnabled());
    expect(await screen.findByText('8')).toBeInTheDocument();
    const aviso = screen.getByText(/Adicionado: 3 × Pistola/);
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Quantidade')).toHaveValue('');
    const post = m.chamadas.find((c) => c.metodo === 'POST')!;
    expect(post.url).toBe('/api/bau/membros/adicionar');
    expect(post.corpo).toEqual({ categoriaId: 'armas', itemId: 'pistola', quantidade: 3 });
    expect(post.headers['x-csrf-token']).toBe('csrf-falso');
  });

  it('remove com o item e a quantidade escolhidos', async () => {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5, faca: 2 } })), post: () => ok({ categoriaId: 'armas', itemId: 'faca', quantidade: 1, versao: 2 }) });
    renderizar(m.cliente);
    await screen.findByText('Faca', { selector: '.bau__item-nome' });
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'faca' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await screen.findByText(/Removido: 1 × Faca/);
    expect(m.chamadas.find((c) => c.metodo === 'POST')).toMatchObject({ url: '/api/bau/membros/remover', corpo: { categoriaId: 'armas', itemId: 'faca', quantidade: 1 } });
  });

  it('se a lista não puder ser atualizada depois do sucesso, avisa sem mentir', async () => {
    let n = 0;
    const m = montar({
      bau: () => (n++ === 0 ? ok(bauCom({ armas: { pistola: 5 } })) : erro(500, 'INTERNO', 'x')),
      post: () => ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 6, versao: 2 }),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não foi possível atualizar a lista');
  });
});

describe('WEB-057 AC4: estoque insuficiente (409)', () => {
  it('mostra a mensagem, mantém o formulário e o valor digitado', async () => {
    const m = montar({
      bau: () => ok(bauCom({ armas: { pistola: 2 } })),
      post: () => erro(409, 'ESTOQUE_INSUFICIENTE', 'Estoque insuficiente. Disponível: 2.'),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola', { selector: '.bau__item-nome' });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Estoque insuficiente. Disponível: 2.');
    expect(screen.getByLabelText('Quantidade')).toHaveValue('9');
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeEnabled();
  });
});

describe('WEB-057 AC5: remover só para item com quantidade > 0', () => {
  it('o botão Remover aparece e some conforme o item escolhido', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 4 } })) });
    renderizar(cliente);
    await screen.findByText('Pistola', { selector: '.bau__item-nome' });
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'faca' } });
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'drogas' } });
    expect(screen.getByLabelText('Item')).toHaveValue('weed');
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
  });
});

describe('WEB-057 sessão e baú da gerência', () => {
  it('sem provider, busca o token em /api/csrf', async () => {
    const chamadas: string[] = [];
    const falso = vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/csrf') return ok({ csrf: 'do-servidor' });
      if (init?.method === 'POST') return ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 2, versao: 2 });
      if (url === '/api/catalogo') return ok(CATALOGO);
      return ok({ ...bauCom({ armas: { pistola: 1 } }), tipo: 'gerencia' });
    });
    const cliente = criarClienteApi({ fetch: falso as unknown as typeof fetch, navegar: vi.fn() });
    render(<Bau tipo="gerencia" titulo="Baú da Gerência" cliente={cliente} />);
    await screen.findByText('Pistola', { selector: '.bau__item-nome' });
    expect(screen.getByRole('heading', { level: 1, name: 'Baú da Gerência' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await screen.findByText(/Adicionado/);
    expect(chamadas).toContain('GET /api/bau/gerencia');
    expect(chamadas).toContain('GET /api/csrf');
    expect(chamadas).toContain('POST /api/bau/gerencia/adicionar');
  });
});
