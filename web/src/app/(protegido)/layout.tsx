import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navegacao } from '@/components/Navegacao';
import { SessaoProvider } from '@/components/SessaoProvider';
import { obterUsuarioPagina } from '@/server/auth/pagina';
import { GuardaNivel } from './GuardaNivel';

export const dynamic = 'force-dynamic';

export default async function LayoutProtegido({ children }: { children: ReactNode }) {
  const estado = await obterUsuarioPagina();
  if (estado.estado === 'sem_sessao') redirect('/login');
  if (estado.estado === 'revalidar') redirect('/api/auth/login?volta=%2F');
  if (estado.estado !== 'ok') redirect('/login');

  return (
    <SessaoProvider usuario={estado.usuario} csrf={estado.csrf}>
      <div className="casca">
        <Navegacao nivel={estado.usuario.nivel} csrf={estado.csrf} />
        <div className="casca__principal">
          <GuardaNivel>{children}</GuardaNivel>
        </div>
      </div>
    </SessaoProvider>
  );
}
