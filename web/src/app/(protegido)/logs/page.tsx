import type { Metadata } from 'next';
import { Logs } from '@/components/Logs';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Logs' };
export const dynamic = 'force-dynamic';

export default async function PaginaLogs() {
  const acesso = await exigirPagina(1, '/logs');
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Logs nivel={acesso.usuario.nivel} />
    </main>
  );
}
