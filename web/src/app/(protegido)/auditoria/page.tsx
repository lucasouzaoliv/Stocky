import type { Metadata } from 'next';
import { Auditoria } from '@/components/Auditoria';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Auditoria' };
export const dynamic = 'force-dynamic';

export default async function PaginaAuditoria() {
  const acesso = await exigirPagina(2, '/auditoria');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Auditoria />
    </main>
  );
}
