import type { Metadata } from 'next';
import { Calculadora } from '@/components/Calculadora';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Calculadora' };
export const dynamic = 'force-dynamic';

export default async function PaginaCalculadora() {
  const acesso = await exigirPagina(1, '/calculadora');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Calculadora />
    </main>
  );
}
