import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessaoProvider } from '@/components/SessaoProvider';
import { ZerarBau } from '@/components/ZerarBau';
import { clienteFalso, falha, ok, type Chamada, type Resp } from './helpers-gerencia';

function montar(nivel: 1 | 2 | 3, post?: (c: Chamada) => Resp) {
  const { cliente, chamadas } = clienteFalso((c) => (post ?? (() => ok({ alvos: ['membros'], itens: 3, unidades: 12, auditoriaId: 'a1' })))(c));
  const r = render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel }} csrf="csrf-falso">
      <ZerarBau cliente={cliente} />
    </SessaoProvider>,
  );
  return { chamadas, ...r };
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: /zerar baú/i }));
  return screen.getByRole('dialog');
}

describe('WEB-061 AC0: exclusivo do dono', () => {
  it.each([1, 2] as const)('nível %i não renderiza nada de zerar', (nivel) => {
    const { chamadas, container } = montar(nivel);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryAllByText(/zerar/i)).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it('nível 3 vê o seletor e o botão', () => {
    montar(3);
    expect(screen.getByRole('button', { name: /zerar baú/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('WEB-061 AC1: só habilita com a frase exata', () => {
  it('confirmar fica desabilitado até digitar ZERAR', () => {
    montar(3);
    const dialogo = abrir();
    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar' });
    const campo = within(dialogo).getByLabelText('Digite ZERAR para confirmar');
    expect(campo).toHaveFocus();
    expect(confirmar).toBeDisabled();
    for (const errado of ['zerar', 'ZERA', 'ZERAR ', ' ZERAR', 'ZERARR']) {
      fireEvent.change(campo, { target: { value: errado } });
      expect(confirmar).toBeDisabled();
    }
    fireEvent.change(campo, { target: { value: 'ZERAR' } });
    expect(confirmar).toBeEnabled();
  });
});

describe('WEB-061 AC2: sem confirmar nada é chamado', () => {
  it('abrir, cancelar e Esc não chamam a API', () => {
    const { chamadas } = montar(3);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it('clicar em Confirmar desabilitado não envia', () => {
    const { chamadas } = montar(3);
    fireEvent.click(within(abrir()).getByRole('button', { name: 'Confirmar' }));
    expect(chamadas).toHaveLength(0);
  });
});

describe('WEB-061 AC3: diálogo explica o que será zerado', () => {
  it.each([
    ['Baú dos Membros', /zerar o Baú dos Membros\./],
    ['Baú da Gerência', /zerar o Baú da Gerência\./],
    ['Os dois baús', /zerar o Baú dos Membros e o Baú da Gerência\./],
  ])('opção %s', (rotulo, texto) => {
    montar(3);
    fireEvent.click(screen.getByRole('radio', { name: rotulo }));
    const dialogo = abrir();
    expect(within(dialogo).getByText(texto)).toBeInTheDocument();
    expect(within(dialogo).getByText(/registrada na auditoria/)).toBeInTheDocument();
  });
});

describe('WEB-061 AC4: resultado e erro', () => {
  it('envia alvo e confirmação, fecha e anuncia o resultado em aria-live', async () => {
    const { chamadas } = montar(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Os dois baús' }));
    const dialogo = abrir();
    fireEvent.change(within(dialogo).getByLabelText('Digite ZERAR para confirmar'), { target: { value: 'ZERAR' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ url: '/api/bau/zerar', metodo: 'POST', corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Concluído: 3 itens (12 unidades) removidos dos dois baús.');
  });

  it('erro da API aparece como alerta e o diálogo fica aberto', async () => {
    montar(3, () => falha(403, 'SEM_PERMISSAO', 'x'));
    const dialogo = abrir();
    fireEvent.change(within(dialogo).getByLabelText('Digite ZERAR para confirmar'), { target: { value: 'ZERAR' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Você não tem permissão para fazer isso.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('duplo clique em Confirmar envia uma vez só', async () => {
    let liberar!: () => void;
    const { chamadas } = montar(3, () => new Promise<Response>((r) => { liberar = () => r(ok({ alvos: ['membros'], itens: 0, unidades: 0, auditoriaId: 'a' })); }));
    const dialogo = abrir();
    fireEvent.change(within(dialogo).getByLabelText('Digite ZERAR para confirmar'), { target: { value: 'ZERAR' } });
    const botao = within(dialogo).getByRole('button', { name: 'Confirmar' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(chamadas).toHaveLength(1));
    liberar();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas).toHaveLength(1);
  });
});
