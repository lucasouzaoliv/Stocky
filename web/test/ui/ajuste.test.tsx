import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaginaAjuste, { generateMetadata } from '@/app/(protegido)/ajuste/[tipo]/page';
import type { BauDTO, CatalogoDTO, PreviaAjusteDTO } from '@/compartilhado/api-tipos';
import { AjusteTabela } from '@/components/AjusteTabela';
import { SessaoProvider } from '@/components/SessaoProvider';
import { clienteFalso, falha, ok, type Chamada, type Resp } from './helpers-gerencia';

const exigirPagina = vi.fn();
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});
vi.mock('@/server/auth/pagina', () => ({ exigirPagina: (...a: unknown[]) => exigirPagina(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

const CAT: CatalogoDTO = {
  categorias: [
    {
      id: 'armas',
      nome: 'Armas',
      emoji: '',
      total: 3,
      itens: [
        { id: 'colt', nome: 'Colt' },
        { id: 'especial', nome: '#1 Especial: .50' },
        { id: 'faca', nome: 'Faca' },
      ],
    },
  ],
};
const BAU = (versao = 7): BauDTO => ({
  tipo: 'membros',
  versao,
  categorias: [{ id: 'armas', nome: 'Armas', emoji: '', itens: [{ id: 'colt', nome: 'Colt', quantidade: 3 }, { id: 'especial', nome: '#1 Especial: .50', quantidade: 10 }] }],
});

interface Opcoes {
  bau?: () => BauDTO;
  catalogo?: CatalogoDTO;
  previa?: (c: Chamada) => Resp;
  confirmar?: (c: Chamada) => Resp;
}

function previaDe(c: Chamada, versao = 7): PreviaAjusteDTO {
  const linhas = (c.corpo!.linhas as Array<{ categoriaId: string; itemId: string; quantidade: number }>).map((l) => ({
    ...l,
    nome: l.itemId === 'colt' ? 'Colt' : l.itemId === 'especial' ? '#1 Especial: .50' : 'Faca',
    antes: l.itemId === 'colt' ? 3 : l.itemId === 'especial' ? 10 : 0,
    depois: l.quantidade,
  }));
  return { tipo: 'membros', versao, alterados: linhas.length, linhas };
}

function montar(o: Opcoes = {}) {
  const { cliente, chamadas } = clienteFalso((c) => {
    if (c.url.endsWith('/ajuste/previa')) return (o.previa ?? ((x) => ok(previaDe(x))))(c);
    if (c.url.endsWith('/ajuste/confirmar')) return (o.confirmar ?? (() => ok({ alterados: 1, versao: 8, auditoriaId: 'a1' })))(c);
    if (c.url === '/api/catalogo') return ok(o.catalogo ?? CAT);
    if (c.url === '/api/bau/membros') return ok((o.bau ?? BAU)());
    return falha(404, 'NAO_ENCONTRADO', 'x');
  });
  render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="csrf-falso">
      <AjusteTabela tipo="membros" titulo="Ajuste em massa: Baú dos Membros" cliente={cliente} />
    </SessaoProvider>,
  );
  return chamadas;
}

const campo = (nome: string) => screen.getByLabelText(new RegExp(`^Nova quantidade de ${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
const digitar = (nome: string, valor: string) => fireEvent.change(campo(nome), { target: { value: valor } });
const verResumo = () => screen.getByRole('button', { name: 'Ver resumo' });

beforeEach(() => {
  exigirPagina.mockReset();
  notFound.mockClear();
});

describe('WEB-062 páginas /ajuste/[tipo]', () => {
  it.each(['membros', 'gerencia'])('nível 2 abre /ajuste/%s e exige nível 2 no servidor', async (tipo) => {
    exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 2 }, csrf: 'c' });
    vi.stubGlobal('fetch', vi.fn(async () => ok(CAT)));
    render(<SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="c">{await PaginaAjuste({ params: Promise.resolve({ tipo }) })}</SessaoProvider>);
    expect(exigirPagina).toHaveBeenCalledWith(2, `/ajuste/${tipo}`);
    expect(screen.getByRole('heading', { level: 1, name: /Ajuste em massa/ })).toBeInTheDocument();
    expect((await generateMetadata({ params: Promise.resolve({ tipo }) })).title).toMatch(/Ajuste em massa/);
    await screen.findAllByRole('textbox');
    vi.unstubAllGlobals();
  });

  it('nível 1 vê Sem permissão e tipo inválido dá 404', async () => {
    exigirPagina.mockResolvedValue({ semPermissao: true, usuario: { id: '1', nome: 'Ana', nivel: 1 }, csrf: 'c' });
    render(await PaginaAjuste({ params: Promise.resolve({ tipo: 'membros' }) }));
    expect(screen.getByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    await expect(PaginaAjuste({ params: Promise.resolve({ tipo: 'outro' }) })).rejects.toThrow('NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});

describe('WEB-062 AC6: sem alterações', () => {
  it('"Ver resumo" começa desabilitado, habilita ao alterar e desabilita ao desfazer', async () => {
    montar();
    await screen.findByText('Colt');
    expect(verResumo()).toBeDisabled();
    digitar('Colt', '5');
    expect(verResumo()).toBeEnabled();
    digitar('Colt', '3');
    expect(verResumo()).toBeDisabled();
  });

  it('mostra categoria, item, atual e nova quantidade (item sem estoque = 0)', async () => {
    montar();
    const linha = (await screen.findByText('Faca')).closest('tr')!;
    expect(within(linha).getByText('Armas')).toBeInTheDocument();
    expect(within(linha).getByText('0')).toBeInTheDocument();
    expect(campo('Faca')).toHaveValue('0');
  });
});

describe('WEB-062 AC1: ids, nunca texto livre', () => {
  it('item "#1 Especial: .50" vai por categoriaId/itemId com quantidade numérica', async () => {
    const chamadas = montar();
    await screen.findByText('#1 Especial: .50');
    digitar('#1 Especial: .50', '12');
    fireEvent.click(verResumo());
    await screen.findByRole('heading', { name: 'Resumo do ajuste' });
    const p = chamadas.find((c) => c.url === '/api/bau/membros/ajuste/previa')!;
    expect(p.metodo).toBe('POST');
    expect(p.corpo).toEqual({ linhas: [{ categoriaId: 'armas', itemId: 'especial', quantidade: 12 }] });
    expect(screen.getByText('#1 Especial: .50')).toBeInTheDocument();
  });
});

describe('WEB-062 AC2: só linhas alteradas; limite de 200', () => {
  it('a prévia leva apenas as linhas alteradas', async () => {
    const chamadas = montar();
    await screen.findByText('Colt');
    digitar('Colt', '5');
    digitar('Faca', '0');
    fireEvent.click(verResumo());
    await screen.findByRole('heading', { name: 'Resumo do ajuste' });
    const corpo = chamadas.find((c) => c.url.endsWith('/previa'))!.corpo as { linhas: unknown[] };
    expect(corpo.linhas).toEqual([{ categoriaId: 'armas', itemId: 'colt', quantidade: 5 }]);
  });

  it('mais de 200 alteradas bloqueia com mensagem e não chama a API', async () => {
    const muitos: CatalogoDTO = {
      categorias: Array.from({ length: 9 }, (_, c) => ({
        id: `cat${c}`,
        nome: `Cat ${c}`,
        emoji: '',
        total: 25,
        itens: Array.from({ length: 25 }, (_, i) => ({ id: `i${i}`, nome: `Item ${c}-${i}` })),
      })),
    };
    const chamadas = montar({ catalogo: muitos, bau: () => ({ tipo: 'membros', versao: 1, categorias: [] }) });
    await screen.findByText('Item 0-0');
    for (let c = 0; c < 9; c++) for (let i = 0; i < 25; i++) if (c * 25 + i < 201) digitar(`Item ${c}-${i}`, '1');
    fireEvent.click(verResumo());
    expect(await screen.findByRole('alert')).toHaveTextContent('São 201 itens alterados e o limite é 200');
    expect(chamadas.some((c) => c.url.endsWith('/previa'))).toBe(false);
  });
});

describe('WEB-062 AC3: campo inválido', () => {
  it.each(['10abc', '-1', '10000001', '', '1,5', '2.5'])('"%s" marca a linha e impede Ver resumo', async (texto) => {
    const chamadas = montar();
    await screen.findByText('Colt');
    digitar('Colt', '5');
    digitar('Faca', texto === '' ? '' : texto);
    const entrada = campo('Faca');
    expect(entrada).toHaveAttribute('aria-invalid', 'true');
    const idErro = entrada.getAttribute('aria-describedby')!;
    expect(document.getElementById(idErro)!.textContent).not.toBe('');
    expect(verResumo()).toBeDisabled();
    fireEvent.click(verResumo());
    expect(chamadas.some((c) => c.url.endsWith('/previa'))).toBe(false);
    digitar('Faca', '1');
    expect(entrada).not.toHaveAttribute('aria-invalid');
    expect(verResumo()).toBeEnabled();
  });

  it('erro de linha devolvido pelo servidor (400) marca a linha certa', async () => {
    montar({ previa: () => falha(400, 'VALIDACAO', 'Há linhas inválidas.', { linhas: [{ indice: 0, categoriaId: 'armas', itemId: 'colt', motivo: 'Item sem cadastro.' }] }) });
    await screen.findByText('Colt');
    digitar('Colt', '5');
    fireEvent.click(verResumo());
    await waitFor(() => expect(campo('Colt')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Item sem cadastro.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Há linhas inválidas.');
  });
});

describe('WEB-062 AC4: resumo antes → depois e confirmação com a versão', () => {
  it('mostra antes e depois de cada item e confirma com a versão da prévia', async () => {
    const chamadas = montar({ previa: (c) => ok(previaDe(c, 42)) });
    await screen.findByText('Colt');
    digitar('Colt', '5');
    digitar('#1 Especial: .50', '0');
    fireEvent.click(verResumo());
    const titulo = await screen.findByRole('heading', { name: 'Resumo do ajuste' });
    expect(titulo).toHaveFocus();
    const colt = screen.getByRole('rowheader', { name: 'Colt' }).closest('tr')!;
    expect(within(colt).getByText('3')).toBeInTheDocument();
    expect(colt.querySelector('[data-rotulo="Depois"]')).toHaveTextContent('→ 5');
    const esp = screen.getByRole('rowheader', { name: '#1 Especial: .50' }).closest('tr')!;
    expect(within(esp).getByText('10')).toBeInTheDocument();
    expect(esp.querySelector('[data-rotulo="Depois"]')).toHaveTextContent('→ 0');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/confirmar'))).toBe(true));
    const conf = chamadas.find((c) => c.url === '/api/bau/membros/ajuste/confirmar')!;
    expect(conf.corpo).toEqual({
      versao: 42,
      linhas: [
        { categoriaId: 'armas', itemId: 'colt', quantidade: 5 },
        { categoriaId: 'armas', itemId: 'especial', quantidade: 0 },
      ],
    });
    expect(await screen.findByText('Ajuste aplicado: 1 item alterado.')).toBeInTheDocument();
    // voltou à edição e recarregou o baú
    expect(screen.getByRole('button', { name: 'Ver resumo' })).toBeDisabled();
    expect(chamadas.filter((c) => c.url === '/api/bau/membros').length).toBeGreaterThanOrEqual(2);
  });

  it('"Voltar e editar" mantém as edições sem confirmar', async () => {
    const chamadas = montar();
    await screen.findByText('Colt');
    digitar('Colt', '5');
    fireEvent.click(verResumo());
    await screen.findByRole('heading', { name: 'Resumo do ajuste' });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar e editar' }));
    expect(campo('Colt')).toHaveValue('5');
    expect(chamadas.some((c) => c.url.endsWith('/confirmar'))).toBe(false);
  });

  it('erro genérico na confirmação aparece como alerta e permite tentar de novo', async () => {
    montar({ confirmar: () => falha(500, 'INTERNO', 'x') });
    await screen.findByText('Colt');
    digitar('Colt', '5');
    fireEvent.click(verResumo());
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ajuste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocorreu um erro');
    expect(screen.getByRole('button', { name: 'Confirmar ajuste' })).toBeEnabled();
  });

  it('duplo clique em Confirmar envia uma vez só', async () => {
    let liberar!: () => void;
    const chamadas = montar({ confirmar: () => new Promise<Response>((r) => { liberar = () => r(ok({ alterados: 1, versao: 8, auditoriaId: null })); }) });
    await screen.findByText('Colt');
    digitar('Colt', '5');
    fireEvent.click(verResumo());
    const botao = await screen.findByRole('button', { name: 'Confirmar ajuste' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(chamadas.filter((c) => c.url.endsWith('/confirmar'))).toHaveLength(1));
    liberar();
    await screen.findByText(/Ajuste aplicado/);
    expect(chamadas.filter((c) => c.url.endsWith('/confirmar'))).toHaveLength(1);
  });
});

describe('WEB-062 AC5: 409 de versão velha (cenário D3)', () => {
  it('mostra "o baú mudou", descarta o resumo e não deixa reconfirmar', async () => {
    let versaoBau = 7;
    const chamadas = montar({
      bau: () => (versaoBau === 7 ? BAU(7) : { ...BAU(8), categorias: [{ id: 'armas', nome: 'Armas', emoji: '', itens: [{ id: 'colt', nome: 'Colt', quantidade: 13 }] }] }),
      confirmar: () => {
        versaoBau = 8;
        return falha(409, 'VERSAO_DESATUALIZADA', 'O baú mudou desde o resumo. Refaça o ajuste.');
      },
    });
    await screen.findByText('Colt');
    digitar('Colt', '5');
    fireEvent.click(verResumo());
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ajuste' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/baú mudou/i);
    expect(alerta).toHaveTextContent(/refaça a prévia/i);
    expect(screen.queryByRole('button', { name: 'Confirmar ajuste' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Resumo do ajuste' })).toBeNull();
    expect(chamadas.filter((c) => c.url.endsWith('/confirmar'))).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Recarregar o baú' }));
    await waitFor(() => expect(campo('Colt')).toHaveValue('13'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(verResumo()).toBeDisabled();
    expect(chamadas.filter((c) => c.url.endsWith('/confirmar'))).toHaveLength(1);
  });
});

describe('estados', () => {
  it('falha ao carregar mostra alerta com Tentar de novo', async () => {
    const { cliente } = clienteFalso(() => falha(500, 'INTERNO', 'x'));
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 2 }} csrf="c">
        <AjusteTabela tipo="membros" titulo="Ajuste" cliente={cliente} />
      </SessaoProvider>,
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
