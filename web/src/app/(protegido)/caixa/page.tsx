import type { Metadata } from 'next';
import { Caixa } from '@/components/Caixa';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Caixa' };
export const dynamic = 'force-dynamic';

export default async function PaginaCaixa() {
  const acesso = await exigirPagina(2, '/caixa');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Caixa />
    </main>
  );
}
