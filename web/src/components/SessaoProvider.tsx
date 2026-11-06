'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { UsuarioSessao } from '@/compartilhado/api-tipos';

export interface SessaoContexto {
  usuario: UsuarioSessao;
  csrf: string;
}

const Contexto = createContext<SessaoContexto | null>(null);

/** Recebe `{ usuario, csrf }` do layout protegido (servidor) e os repassa aos componentes de cliente. */
export function SessaoProvider({ usuario, csrf, children }: SessaoContexto & { children: ReactNode }) {
  const valor = useMemo(() => ({ usuario, csrf }), [usuario, csrf]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Fora do provider devolve null (componentes caem no GET /api/csrf do cliente HTTP). */
export function useSessaoOpcional(): SessaoContexto | null {
  return useContext(Contexto);
}

export function useSessao(): SessaoContexto {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error('useSessao fora do SessaoProvider');
  return sessao;
}
