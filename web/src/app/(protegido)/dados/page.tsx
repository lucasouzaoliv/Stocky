import type { Metadata } from 'next';
import { Dados } from '@/components/Dados';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Dados' };
export const dynamic = 'force-dynamic';

export default async function PaginaDados() {
  const acesso = await exigirPagina(2, '/dados');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Dados />
    </main>
  );
}
