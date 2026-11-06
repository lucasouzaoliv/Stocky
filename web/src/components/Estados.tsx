import type { ReactNode } from 'react';

export function Carregando({ mensagem = 'Carregando…' }: { mensagem?: string }) {
  return (
    <div className="estado estado--carregando" role="status">
      <span className="estado__giro" aria-hidden="true" />
      <span>{mensagem}</span>
    </div>
  );
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <section className="estado estado--vazio">
      <h2 className="estado__titulo">{titulo}</h2>
      {descricao ? <p className="estado__texto">{descricao}</p> : null}
      {acao}
    </section>
  );
}

export function ErroTela({
  mensagem,
  titulo = 'Algo deu errado',
  aoTentarNovamente,
}: {
  mensagem: string;
  titulo?: string;
  aoTentarNovamente?: () => void;
}) {
  return (
    <div className="estado estado--erro" role="alert">
      <h2 className="estado__titulo">{titulo}</h2>
      <p className="estado__texto">{mensagem}</p>
      {aoTentarNovamente ? (
        <button type="button" className="botao" onClick={aoTentarNovamente}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
