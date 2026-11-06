import { useId } from 'react';

export interface CampoQuantidadeProps {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string | null;
  desabilitado?: boolean;
}

export function CampoQuantidade({ rotulo, valor, aoMudar, erro, desabilitado }: CampoQuantidadeProps) {
  const id = useId();
  const idErro = `${id}-erro`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className="campo__entrada"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={valor}
        disabled={desabilitado}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
        onChange={(e) => aoMudar(e.target.value)}
      />
      {erro ? (
        <p id={idErro} className="campo__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
