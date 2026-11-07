import type { Metadata } from 'next';
import { Drogas } from '@/components/Drogas';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Drogas' };
export const dynamic = 'force-dynamic';

export default async function PaginaDrogas() {
  const acesso = await exigirPagina(1, '/drogas');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Drogas />
    </main>
  );
}
