import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** Cartão de um item: o <li> que contém o campo "Quantidade de <nome>". */
function cartao(nome: string): HTMLElement {
  return screen.getByRole('textbox', { name: `Quantidade de ${nome}` }).closest('li')!;
}
const campo = (nome: string) => screen.getByRole('textbox', { name: `Quantidade de ${nome}` });
const posts = <T extends { metodo: string }>(chamadas: T[]) => chamadas.filter((c) => c.metodo === 'POST');

describe('estados de carregamento, vazio e erro', () => {
  it('mostra carregando e depois o conteúdo', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 3 } })) });
    renderizar(cliente);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o baú…');
    expect(await screen.findByText('Pistola')).toBeInTheDocument();
  });

  it('agrupa por categoria, mostra quantidades e mantém itens zerados esmaecidos', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 1500, faca: 2 } })) });
    renderizar(cliente);
    const armas = await screen.findByRole('region', { name: /Armas/ });
    expect(within(armas).getByText('Pistola')).toBeInTheDocument();
    expect(within(armas).getByText('1.500')).toBeInTheDocument();
    expect(within(armas).getByText('Faca')).toBeInTheDocument();
    // o catálogo manda: Weed está sem estoque, mas continua na grade, esmaecido
    const drogas = screen.getByRole('region', { name: /Drogas/ });
    expect(within(drogas).getByText('Weed').closest('li')).toHaveClass('bau__item--zerado');
    expect(screen.getByRole('heading', { level: 1, name: 'Baú dos Membros' })).toBeInTheDocument();
  });

  it('cartões-resumo: total de itens, tipos com estoque e categorias', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 1500, faca: 2 } })) });
    renderizar(cliente);
    const resumo = await screen.findByLabelText('Resumo do baú');
    expect(within(resumo).getByText('Itens no baú').nextSibling).toHaveTextContent('1.502');
    expect(within(resumo).getByText('Tipos com estoque').nextSibling).toHaveTextContent('2 de 3');
    expect(within(resumo).getByText('Categorias').nextSibling).toHaveTextContent('2');
  });

  it('baú sem estoque mostra a grade toda zerada e Retirar desabilitado', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({})) });
    renderizar(cliente);
    await screen.findByText('Pistola');
    expect(screen.getByRole('button', { name: 'Adicionar Pistola' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retirar Pistola' })).toBeDisabled();
  });

  it('catálogo vazio mostra o estado vazio', async () => {
    const { cliente } = montar({ bau: () => ok({ tipo: 'membros', versao: 1, categorias: [] }), catalogo: () => ok({ categorias: [] }) });
    renderizar(cliente);
    expect(await screen.findByRole('heading', { name: 'Catálogo vazio' })).toBeInTheDocument();
  });

  it('item com estoque que saiu do catálogo continua visível', async () => {
    const { cliente } = montar({
      bau: () => ok({ tipo: 'membros', versao: 1, categorias: [{ id: 'armas', nome: 'Armas', emoji: '', itens: [{ id: 'bazuca', nome: 'Bazuca', quantidade: 4 }] }] }),
    });
    renderizar(cliente);
    expect(await screen.findByText('Bazuca')).toBeInTheDocument();
    expect(within(cartao('Bazuca')).getByText('4')).toBeInTheDocument();
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

describe('filtros por categoria e busca', () => {
  async function pronto() {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5, faca: 2 }, drogas: { weed: 9 } })) });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    return m;
  }

  it('Todos mostra tudo; escolher uma categoria esconde as outras (aria-pressed)', async () => {
    await pronto();
    const grupo = screen.getByRole('group', { name: 'Filtrar por categoria' });
    expect(within(grupo).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(grupo).getByRole('button', { name: 'Drogas' }));
    expect(within(grupo).getByRole('button', { name: 'Drogas' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(grupo).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Weed')).toBeInTheDocument();
    expect(screen.queryByText('Pistola')).toBeNull();
    fireEvent.click(within(grupo).getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Pistola')).toBeInTheDocument();
  });

  it('a busca ignora maiúsculas e acentos e combina com o filtro', async () => {
    await pronto();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar item' }), { target: { value: 'PISTÓLA' } });
    expect(screen.getByText('Pistola')).toBeInTheDocument();
    expect(screen.queryByText('Faca')).toBeNull();
    expect(screen.queryByText('Weed')).toBeNull();
  });

  it('busca sem resultado mostra a mensagem e limpar a busca traz os itens de volta', async () => {
    await pronto();
    const busca = screen.getByRole('searchbox', { name: 'Buscar item' });
    fireEvent.change(busca, { target: { value: 'xyz' } });
    expect(screen.getByRole('heading', { name: 'Nenhum item encontrado' })).toBeInTheDocument();
    fireEvent.change(busca, { target: { value: '' } });
    expect(screen.getByText('Faca')).toBeInTheDocument();
  });
});

describe('quantidade pendente: − e + não chamam a API', () => {
  async function pronto() {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5 } })), post: () => ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 6, versao: 2 }) });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    return m;
  }

  it('começa em 1, sobe e desce sem passar de 1 para baixo e sem chamar a API', async () => {
    const { chamadas } = await pronto();
    const antes = chamadas.length;
    expect(campo('Pistola')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Pistola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Pistola' }));
    expect(campo('Pistola')).toHaveValue('3');
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Diminuir quantidade de Pistola' }));
    expect(campo('Pistola')).toHaveValue('1');
    expect(chamadas.length).toBe(antes);
  });

  it('o + respeita o limite de 100.000 e valor inválido volta a 1', async () => {
    await pronto();
    fireEvent.change(campo('Pistola'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Pistola' }));
    expect(campo('Pistola')).toHaveValue('100000');
    fireEvent.change(campo('Pistola'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Pistola' }));
    expect(campo('Pistola')).toHaveValue('1');
  });

  it('cada item guarda a sua quantidade pendente', async () => {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5, faca: 2 } })), post: () => ok({}) });
    renderizar(m.cliente);
    await screen.findByText('Faca');
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Faca' }));
    expect(campo('Faca')).toHaveValue('2');
    expect(campo('Pistola')).toHaveValue('1');
  });

  it('tem inputMode numérico e nome acessível', async () => {
    await pronto();
    expect(campo('Pistola')).toHaveAttribute('inputmode', 'numeric');
  });

  it.each(['0', '-3', '1.5', '2,5', 'abc', '10abc', '100001', ''])('rejeita "%s" ao confirmar, com mensagem, sem chamar a API', async (valor) => {
    const { chamadas } = await pronto();
    const antes = chamadas.length;
    fireEvent.change(campo('Pistola'), { target: { value: valor } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
    const msg = await screen.findByRole('alert');
    expect(msg.textContent?.length).toBeGreaterThan(5);
    expect(campo('Pistola')).toHaveAttribute('aria-invalid', 'true');
    expect(campo('Pistola').getAttribute('aria-describedby')).toBe(msg.id);
    expect(chamadas.length).toBe(antes);
  });

  it('aceita o limite de 100.000', async () => {
    const { chamadas } = await pronto();
    fireEvent.change(campo('Pistola'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
    await waitFor(() => expect(posts(chamadas)).toHaveLength(1));
    expect(posts(chamadas)[0]).toMatchObject({ corpo: { quantidade: 100000 } });
  });

  it('valor aceito pelo cliente mas recusado pelo servidor (400) mostra o erro da API em aviso', async () => {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5 } })), post: () => erro(400, 'VALIDACAO', 'Quantidade inválida no servidor.') });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(campo('Pistola'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Quantidade inválida no servidor.');
  });
});

describe('confirmação: uma chamada por clique em Adicionar/Retirar', () => {
  it('desabilita os botões durante o envio, atualiza a lista e avisa em aria-live', async () => {
    let atual = bauCom({ armas: { pistola: 5 } });
    let liberar!: (r: Response) => void;
    const m = montar({
      bau: () => ok(atual),
      post: () => new Promise<Response>((r) => { liberar = r; }),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(campo('Pistola'), { target: { value: '3' } });
    const botao = screen.getByRole('button', { name: 'Adicionar Pistola' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(botao).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Retirar Pistola' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adicionar Faca' })).toBeDisabled();
    expect(posts(m.chamadas)).toHaveLength(1);

    atual = bauCom({ armas: { pistola: 8 } }, 2);
    liberar(await ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 8, versao: 2 }));

    await waitFor(() => expect(botao).toBeEnabled());
    expect(within(cartao('Pistola')).getByText('8')).toBeInTheDocument();
    const aviso = screen.getByText(/Adicionado: 3 × Pistola/);
    expect(aviso.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(campo('Pistola')).toHaveValue('1');
    const post = posts(m.chamadas)[0]!;
    expect(post.url).toBe('/api/bau/membros/adicionar');
    expect(post.corpo).toEqual({ categoriaId: 'armas', itemId: 'pistola', quantidade: 3 });
    expect(post.headers['x-csrf-token']).toBe('csrf-falso');
  });

  it('Retirar manda a ação "remover" com o item e a quantidade do cartão', async () => {
    const m = montar({ bau: () => ok(bauCom({ armas: { pistola: 5, faca: 2 } })), post: () => ok({ categoriaId: 'armas', itemId: 'faca', quantidade: 1, versao: 2 }) });
    renderizar(m.cliente);
    await screen.findByText('Faca');
    fireEvent.change(campo('Faca'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar Faca' }));
    await screen.findByText(/Removido: 1 × Faca/);
    expect(posts(m.chamadas)).toHaveLength(1);
    expect(posts(m.chamadas)[0]).toMatchObject({ url: '/api/bau/membros/remover', corpo: { categoriaId: 'armas', itemId: 'faca', quantidade: 1 } });
  });

  it('se a lista não puder ser atualizada depois do sucesso, avisa sem mentir', async () => {
    let n = 0;
    const m = montar({
      bau: () => (n++ === 0 ? ok(bauCom({ armas: { pistola: 5 } })) : erro(500, 'INTERNO', 'x')),
      post: () => ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 6, versao: 2 }),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não foi possível atualizar a lista');
  });

  it('o aviso de sucesso some sozinho e o de erro pode ser fechado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let falhar = false;
      const m = montar({
        bau: () => ok(bauCom({ armas: { pistola: 5 } })),
        post: () => (falhar ? erro(409, 'ESTOQUE_INSUFICIENTE', 'Estoque insuficiente. Disponível: 5.') : ok({ categoriaId: 'armas', itemId: 'pistola', quantidade: 6, versao: 2 })),
      });
      renderizar(m.cliente);
      await screen.findByText('Pistola');
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
      await screen.findByText(/Adicionado: 1 × Pistola/);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(screen.queryByText(/Adicionado: 1 × Pistola/)).toBeNull();

      falhar = true;
      fireEvent.click(screen.getByRole('button', { name: 'Retirar Pistola' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Estoque insuficiente');
      fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('estoque insuficiente (409)', () => {
  it('mostra a mensagem, mantém o valor digitado e libera os botões', async () => {
    const m = montar({
      bau: () => ok(bauCom({ armas: { pistola: 2 } })),
      post: () => erro(409, 'ESTOQUE_INSUFICIENTE', 'Estoque insuficiente. Disponível: 2.'),
    });
    renderizar(m.cliente);
    await screen.findByText('Pistola');
    fireEvent.change(campo('Pistola'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar Pistola' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Estoque insuficiente. Disponível: 2.');
    expect(campo('Pistola')).toHaveValue('9');
    expect(screen.getByRole('button', { name: 'Adicionar Pistola' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retirar Pistola' })).toBeEnabled();
  });
});

describe('Retirar só com quantidade > 0', () => {
  it('fica desabilitado em itens zerados, que continuam adicionáveis', async () => {
    const { cliente } = montar({ bau: () => ok(bauCom({ armas: { pistola: 4 } })) });
    renderizar(cliente);
    await screen.findByText('Pistola');
    expect(screen.getByRole('button', { name: 'Retirar Pistola' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retirar Faca' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adicionar Faca' })).toBeEnabled();
  });
});

describe('sessão e baú da gerência', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pistola' }));
    await screen.findByText(/Adicionado/);
    expect(chamadas).toContain('GET /api/bau/gerencia');
    expect(chamadas).toContain('GET /api/csrf');
    expect(chamadas).toContain('POST /api/bau/gerencia/adicionar');
  });
});
