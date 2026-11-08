import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaPainel from '@/app/(protegido)/painel/page';
import type { BauDTO, CatalogoDTO } from '@/compartilhado/api-tipos';
import { Catalogo } from '@/components/Catalogo';
import { SessaoProvider } from '@/components/SessaoProvider';
import { clienteFalso, falha, ok, type Chamada, type Resp } from './helpers-gerencia';

const exigirPagina = vi.fn();
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));

function itens(n: number, prefixo = 'item') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefixo}_${i}`, nome: `${prefixo} ${i}` }));
}

function catalogo(extra: Partial<CatalogoDTO['categorias'][number]>[] = []): CatalogoDTO {
  const base = [
    { id: 'armas', nome: 'Armas', emoji: '🔫', itens: [{ id: 'pistola', nome: 'Pistola' }, { id: 'fuzil', nome: 'Fuzil' }] },
    { id: 'materiais', nome: 'Materiais', emoji: '🧱', itens: [{ id: 'aco', nome: 'Aço' }] },
  ].map((c) => ({ ...c, total: c.itens.length }));
  return { categorias: [...base, ...extra.map((c) => ({ id: 'x', nome: 'X', emoji: '', itens: [], total: 0, ...c }))] };
}

const bau = (tipo: 'membros' | 'gerencia' | 'casa', qtd: number): BauDTO => ({
  tipo,
  versao: 3,
  categorias: [{ id: 'armas', nome: 'Armas', emoji: '', itens: [{ id: 'pistola', nome: 'Pistola', quantidade: qtd }] }],
});

interface Opcoes {
  nivel?: 2 | 3;
  catalogo?: () => CatalogoDTO;
  post?: (c: Chamada) => Resp;
  del?: (c: Chamada) => Resp;
}

function montar(o: Opcoes = {}) {
  const cat = o.catalogo ?? (() => catalogo());
  const { cliente, chamadas } = clienteFalso((c) => {
    if (c.metodo === 'POST') return (o.post ?? (() => ok({ categoriaId: 'armas', item: { id: 'x', nome: 'x' } })))(c);
    if (c.metodo === 'DELETE') return (o.del ?? (() => ok({ item: {}, removidoDe: [] })))(c);
    if (c.url === '/api/catalogo') return ok(cat());
    if (c.url === '/api/bau/membros') return ok(bau('membros', 4));
    if (c.url === '/api/bau/gerencia') return ok(bau('gerencia', 2));
    if (c.url === '/api/bau/casa') return ok(bau('casa', 1));
    return falha(404, 'NAO_ENCONTRADO', 'x');
  });
  render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: o.nivel ?? 3 }} csrf="csrf-falso">
      <Catalogo cliente={cliente} />
    </SessaoProvider>,
  );
  return chamadas;
}

beforeEach(() => exigirPagina.mockReset());

describe('WEB-060 página /painel', () => {
  it('exige nível 2: nível 1 vê Sem permissão', async () => {
    exigirPagina.mockResolvedValue({ semPermissao: true, usuario: { id: '1', nome: 'Ana', nivel: 1 }, csrf: 'c' });
    render(await PaginaPainel());
    expect(exigirPagina).toHaveBeenCalledWith(2, '/painel');
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
  });

  it('nível 2 vê links do ajuste, o catálogo e nenhuma parte do dono', async () => {
    exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 2 }, csrf: 'c' });
    vi.stubGlobal('fetch', vi.fn(async () => ok(catalogo())));
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="c">
        {await PaginaPainel()}
      </SessaoProvider>,
    );
    expect(screen.getByRole('link', { name: 'Ajustar Baú dos Membros' })).toHaveAttribute('href', '/ajuste/membros');
    expect(screen.getByRole('link', { name: 'Ajustar Baú da Gerência' })).toHaveAttribute('href', '/ajuste/gerencia');
    await screen.findByText('Pistola');
    expect(screen.queryAllByRole('button', { name: /remover/i })).toHaveLength(0);
    expect(screen.queryByText(/zerar/i)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('nível 3 vê também o zerar baú', async () => {
    exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 3 }, csrf: 'c' });
    vi.stubGlobal('fetch', vi.fn(async () => ok(catalogo())));
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="c">
        {await PaginaPainel()}
      </SessaoProvider>,
    );
    expect(screen.getByRole('button', { name: /zerar baú/i })).toBeInTheDocument();
    await screen.findByText('Pistola');
    vi.unstubAllGlobals();
  });
});

describe('WEB-060 AC0: remover só para o dono', () => {
  it('com nível 2 não há botão nem diálogo de remover e o formulário de adicionar continua', async () => {
    const chamadas = montar({ nivel: 2 });
    await screen.findByText('Pistola');
    expect(screen.queryAllByRole('button', { name: /remover/i })).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Novo item em Armas')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  it('com nível 3 o botão aparece em cada item', async () => {
    montar({ nivel: 3 });
    await screen.findByText('Pistola');
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Remover Pistola' })).toBeInTheDocument();
  });
});

describe('WEB-060 AC1: adicionar', () => {
  it('campo com maxLength 50 e envia categoria e nome limpos', async () => {
    const chamadas = montar();
    const campo = await screen.findByLabelText('Novo item em Armas');
    expect(campo).toHaveAttribute('maxlength', '50');
    fireEvent.change(campo, { target: { value: '  Desert Eagle 45  ' } });
    fireEvent.click(within(campo.closest('form')!).getByRole('button', { name: 'Adicionar item' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')).toBeDefined());
    const post = chamadas.find((c) => c.metodo === 'POST')!;
    expect(post.url).toBe('/api/catalogo/itens');
    expect(post.corpo).toEqual({ categoriaId: 'armas', nome: 'Desert Eagle 45' });
  });

  it('nome vazio mostra erro e não chama a API', async () => {
    const chamadas = montar();
    const campo = await screen.findByLabelText('Novo item em Armas');
    fireEvent.click(within(campo.closest('form')!).getByRole('button', { name: 'Adicionar item' }));
    expect(await screen.findByText('Digite o nome do item.')).toBeInTheDocument();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it.each([
    ['DUPLICADO', 409, 'Já existe um item com esse nome nesta categoria.'],
    ['LIMITE_CATEGORIA', 409, 'Esta categoria já tem 25 itens.'],
    ['VALIDACAO', 400, 'Nome de item inválido.'],
  ])('erro %s aparece em português', async (codigo, status, texto) => {
    montar({ post: () => falha(status, codigo, 'Nome de item inválido.') });
    const campo = await screen.findByLabelText('Novo item em Armas');
    fireEvent.change(campo, { target: { value: 'Desert Eagle' } });
    fireEvent.click(within(campo.closest('form')!).getByRole('button', { name: 'Adicionar item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
  });
});

describe('WEB-060 AC3: categoria cheia', () => {
  it('mostra 25/25 e desabilita só o formulário daquela categoria', async () => {
    montar({ catalogo: () => ({ categorias: [{ id: 'cheia', nome: 'Cheia', emoji: '', total: 25, itens: itens(25) }, ...catalogo().categorias] }) });
    expect(await screen.findByText('25/25')).toBeInTheDocument();
    expect(screen.getByLabelText('Novo item em Cheia')).toBeDisabled();
    const secao = screen.getByLabelText('Novo item em Cheia').closest('section')!;
    expect(within(secao).getByRole('button', { name: 'Adicionar item' })).toBeDisabled();
    expect(screen.getByLabelText('Novo item em Armas')).toBeEnabled();
    expect(screen.getByText('2/25')).toBeInTheDocument();
  });
});

describe('WEB-060 AC4: lista atualiza sem recarregar', () => {
  it('após adicionar, busca o catálogo de novo e mostra o item novo', async () => {
    let versao = 0;
    const chamadas = montar({
      catalogo: () =>
        versao === 0
          ? catalogo()
          : { categorias: [{ id: 'armas', nome: 'Armas', emoji: '', total: 3, itens: [{ id: 'pistola', nome: 'Pistola' }, { id: 'fuzil', nome: 'Fuzil' }, { id: 'desert', nome: 'Desert Eagle' }] }] },
      post: () => {
        versao = 1;
        return ok({ categoriaId: 'armas', item: { id: 'desert', nome: 'Desert Eagle' } });
      },
    });
    const campo = await screen.findByLabelText('Novo item em Armas');
    fireEvent.change(campo, { target: { value: 'Desert Eagle' } });
    fireEvent.click(within(campo.closest('form')!).getByRole('button', { name: 'Adicionar item' }));
    expect(await screen.findByText('Desert Eagle')).toBeInTheDocument();
    expect(chamadas.filter((c) => c.url === '/api/catalogo')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Item “Desert Eagle” adicionado em Armas.');
    expect(campo).toHaveValue('');
  });
});

describe('WEB-060 AC2: remover com confirmação', () => {
  it('abre diálogo acessível com o impacto nos baús e foco no Cancelar', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Pistola' }));
    const dialogo = screen.getByRole('dialog', { name: /Remover “Pistola”/ });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(await within(dialogo).findByText('Baú dos Membros: 4 unidades')).toBeInTheDocument();
    expect(within(dialogo).getByText('Baú da Gerência: 2 unidades')).toBeInTheDocument();
    expect(within(dialogo).getByText('Baú da Casa: 1 unidade')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Esc e Cancelar fecham sem chamar a API e devolvem o foco', async () => {
    const chamadas = montar();
    const botao = await screen.findByRole('button', { name: 'Remover Pistola' });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(botao).toHaveFocus();
    fireEvent.click(botao);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  it('o foco fica preso no diálogo (Tab e Shift+Tab dão a volta)', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Pistola' }));
    const dialogo = screen.getByRole('dialog');
    const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' });
    const remover = within(dialogo).getByRole('button', { name: 'Remover item' });
    remover.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancelar).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(remover).toHaveFocus();
  });

  it('confirmar chama DELETE no caminho certo, atualiza a lista e avisa', async () => {
    let removido = false;
    const chamadas = montar({
      catalogo: () => (removido ? { categorias: [{ id: 'armas', nome: 'Armas', emoji: '', total: 1, itens: [{ id: 'fuzil', nome: 'Fuzil' }] }] } : catalogo()),
      del: () => {
        removido = true;
        return ok({ item: { id: 'pistola', nome: 'Pistola' }, removidoDe: ['membros'] });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Pistola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover item' }));
    await waitFor(() => expect(screen.queryByText('Pistola')).toBeNull());
    expect(chamadas.find((c) => c.metodo === 'DELETE')!.url).toBe('/api/catalogo/itens/armas/pistola');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Item “Pistola” removido do catálogo.');
  });

  it('erro da API (403) aparece como alerta e o diálogo continua aberto', async () => {
    montar({ del: () => falha(403, 'SEM_PERMISSAO', 'x') });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Pistola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover item' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Você não tem permissão para fazer isso.');
  });
});

describe('estados do catálogo', () => {
  it('falha ao carregar mostra alerta e Tentar de novo recarrega', async () => {
    let n = 0;
    const { cliente } = clienteFalso(() => (++n === 1 ? falha(500, 'INTERNO', 'x') : ok(catalogo())));
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="c">
        <Catalogo cliente={cliente} />
      </SessaoProvider>,
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Pistola')).toBeInTheDocument();
  });
});
