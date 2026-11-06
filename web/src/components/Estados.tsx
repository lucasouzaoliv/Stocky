import type { ReactNode } from 'react';

export function Carregando({ mensagem = 'Carregando…' }: { mensagem?: string }) {
  return (
    <div className="estado estado--carregando" role="status">
      <span className="estado__giro" aria-hidden="true" />
      <span>{mensagem}</span>
    </div>
  );
}

/** `nivelTitulo` 1 quando o estado é o conteúdo principal da página (404), 2 dentro de uma tela que já tem o seu h1. */
export function Vazio({
  titulo,
  descricao,
  acao,
  nivelTitulo = 2,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  nivelTitulo?: 1 | 2;
}) {
  const Titulo = nivelTitulo === 1 ? 'h1' : 'h2';
  return (
    <section className="estado estado--vazio">
      <Titulo className="estado__titulo">{titulo}</Titulo>
      {descricao ? <p className="estado__texto">{descricao}</p> : null}
      {acao}
    </section>
  );
}

export function ErroTela({
  mensagem,
  titulo = 'Algo deu errado',
  aoTentarNovamente,
  nivelTitulo = 2,
}: {
  mensagem: string;
  titulo?: string;
  aoTentarNovamente?: () => void;
  nivelTitulo?: 1 | 2;
}) {
  const Titulo = nivelTitulo === 1 ? 'h1' : 'h2';
  return (
    <div className="estado estado--erro" role="alert">
      <Titulo className="estado__titulo">{titulo}</Titulo>
      <p className="estado__texto">{mensagem}</p>
      {aoTentarNovamente ? (
        <button type="button" className="botao" onClick={aoTentarNovamente}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
