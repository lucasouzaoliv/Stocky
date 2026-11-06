'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogoProps {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  /** Enquanto verdadeiro, Esc não fecha (ex.: requisição em andamento). */
  bloqueado?: boolean;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal acessível: role="dialog" + aria-modal, foco preso, Esc fecha,
 * foco inicial no elemento com `data-autofoco` (senão no primeiro focável) e
 * devolução do foco a quem abriu.
 */
export function Dialogo({ titulo, aoFechar, children, bloqueado = false }: DialogoProps) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  const bloqueadoRef = useRef(bloqueado);

  useEffect(() => {
    aoFecharRef.current = aoFechar;
    bloqueadoRef.current = bloqueado;
  });

  useEffect(() => {
    const abriu = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raiz = caixa.current;
    if (raiz) {
      const inicial = raiz.querySelector<HTMLElement>('[data-autofoco]') ?? raiz.querySelector<HTMLElement>(FOCAVEIS) ?? raiz;
      inicial.focus();
    }

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!bloqueadoRef.current) {
          e.preventDefault();
          aoFecharRef.current();
        }
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = Array.from(caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (focaveis.length === 0) {
        e.preventDefault();
        caixa.current.focus();
        return;
      }
      const primeiro = focaveis[0]!;
      const ultimo = focaveis[focaveis.length - 1]!;
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || !caixa.current.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || !caixa.current.contains(ativo))) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      if (abriu && abriu.isConnected) abriu.focus();
    };
  }, []);

  return (
    <div className="dialogo__fundo">
      <div ref={caixa} className="dialogo" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}>
        <h2 id={idTitulo} className="dialogo__titulo">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}
