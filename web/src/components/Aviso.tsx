'use client';

import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AvisoToast {
  tipo: 'sucesso' | 'erro';
  texto: string;
}

const DURACAO_SUCESSO_MS = 5000;

/** Estado do aviso: sucesso some sozinho, erro fica até ser fechado ou substituído. */
export function useAviso() {
  const [aviso, setAviso] = useState<(AvisoToast & { n: number }) | null>(null);
  const contador = useRef(0);

  const mostrar = useCallback((novo: AvisoToast) => {
    contador.current += 1;
    setAviso({ ...novo, n: contador.current });
  }, []);
  const fechar = useCallback(() => setAviso(null), []);

  useEffect(() => {
    if (!aviso || aviso.tipo !== 'sucesso') return;
    const t = setTimeout(() => setAviso(null), DURACAO_SUCESSO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  return { aviso, mostrar, fechar };
}

/**
 * Região viva fixa: o contêiner de status existe sempre (leitores de tela só anunciam mudanças
 * em regiões já presentes); o de erro usa role="alert" e só aparece com mensagem.
 */
export function Aviso({ aviso, aoFechar }: { aviso: (AvisoToast & { n: number }) | null; aoFechar: () => void }) {
  const sucesso = aviso?.tipo === 'sucesso' ? aviso : null;
  const erro = aviso?.tipo === 'erro' ? aviso : null;
  return (
    <div className="aviso">
      <div role="status" aria-live="polite" className="aviso__regiao">
        {sucesso ? (
          <p key={sucesso.n} className="aviso__cartao aviso__cartao--sucesso">
            <CircleCheck aria-hidden="true" focusable="false" />
            <span>{sucesso.texto}</span>
          </p>
        ) : null}
      </div>
      {erro ? (
        <div role="alert" className="aviso__regiao">
          <p key={erro.n} className="aviso__cartao aviso__cartao--erro">
            <TriangleAlert aria-hidden="true" focusable="false" />
            <span>{erro.texto}</span>
            <button type="button" className="aviso__fechar" aria-label="Fechar aviso" onClick={aoFechar}>
              <X aria-hidden="true" focusable="false" />
            </button>
          </p>
        </div>
      ) : null}
    </div>
  );
}
