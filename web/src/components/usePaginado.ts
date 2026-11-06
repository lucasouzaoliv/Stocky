'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pagina } from '@/compartilhado/api-tipos';
import type { ClienteApi } from '@/components/api';

export interface EstadoPaginado<T> {
  itens: T[] | null;
  proximo: string | null;
  erro: string | null;
  erroMais: string | null;
  carregandoMais: boolean;
  carregarMais: () => void;
  recarregar: () => void;
}

interface Guardado<T> {
  /** Chave da requisição a que o estado pertence; estado de outra chave é tratado como "carregando". */
  chave: string;
  itens: T[] | null;
  proximo: string | null;
  erro: string | null;
  erroMais: string | null;
  carregandoMais: boolean;
}

/**
 * Lista paginada por cursor. `urlBase` já traz `limite` e filtros; o cursor é anexado em "carregar mais".
 * Mudar `urlBase` (ou recarregar) volta ao estado de carregamento e ignora respostas antigas.
 */
export function usePaginado<T>(cliente: ClienteApi, urlBase: string): EstadoPaginado<T> {
  const [tentativa, setTentativa] = useState(0);
  const chave = `${tentativa}|${urlBase}`;
  const [guardado, setGuardado] = useState<Guardado<T> | null>(null);
  const chaveAtual = useRef(chave);
  const trava = useRef(false);

  useEffect(() => {
    chaveAtual.current = chave;
    trava.current = false;
    const controle = new AbortController();
    void (async () => {
      const r = await cliente.get<Pagina<T>>(urlBase, { signal: controle.signal });
      if (chaveAtual.current !== chave) return;
      setGuardado(
        r.ok
          ? { chave, itens: r.dados.itens, proximo: r.dados.proximoCursor, erro: null, erroMais: null, carregandoMais: false }
          : { chave, itens: null, proximo: null, erro: r.mensagem, erroMais: null, carregandoMais: false },
      );
    })();
    return () => controle.abort();
  }, [cliente, urlBase, chave]);

  const atual = guardado && guardado.chave === chave ? guardado : null;
  const proximo = atual?.proximo ?? null;

  const carregarMais = useCallback(() => {
    if (trava.current || !proximo) return;
    trava.current = true;
    const minha = chave;
    setGuardado((g) => (g && g.chave === minha ? { ...g, carregandoMais: true, erroMais: null } : g));
    void (async () => {
      try {
        const r = await cliente.get<Pagina<T>>(`${urlBase}&cursor=${encodeURIComponent(proximo)}`);
        if (chaveAtual.current !== minha) return;
        setGuardado((g) => {
          if (!g || g.chave !== minha) return g;
          return r.ok
            ? { ...g, itens: [...(g.itens ?? []), ...r.dados.itens], proximo: r.dados.proximoCursor, carregandoMais: false }
            : { ...g, erroMais: r.mensagem, carregandoMais: false };
        });
      } finally {
        trava.current = false;
      }
    })();
  }, [cliente, urlBase, proximo, chave]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  return {
    itens: atual?.itens ?? null,
    proximo,
    erro: atual?.erro ?? null,
    erroMais: atual?.erroMais ?? null,
    carregandoMais: atual?.carregandoMais ?? false,
    carregarMais,
    recarregar,
  };
}
