'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SemPermissao } from '@/components/SemPermissao';
import { useSessao } from '@/components/SessaoProvider';
import { nivelDaPagina } from './paginas';

/**
 * O layout persiste entre navegações, então a checagem por caminho roda aqui, no cliente.
 * As páginas também chamam exigirPagina no servidor; as rotas de API negam de qualquer jeito.
 */
export function GuardaNivel({ children }: { children: ReactNode }) {
  const caminho = usePathname() ?? '';
  const { usuario } = useSessao();
  return usuario.nivel >= nivelDaPagina(caminho) ? children : <SemPermissao />;
}
