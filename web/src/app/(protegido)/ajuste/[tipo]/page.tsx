import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TipoBau } from '@/compartilhado/api-tipos';
import { AjusteTabela } from '@/components/AjusteTabela';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const dynamic = 'force-dynamic';

const TITULOS: Record<TipoBau, string> = {
  membros: 'Ajuste em massa: Baú dos Membros',
  gerencia: 'Ajuste em massa: Baú da Gerência',
};

function tipoValido(valor: string): valor is TipoBau {
  return Object.hasOwn(TITULOS, valor);
}

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }): Promise<Metadata> {
  const { tipo } = await params;
  return { title: tipoValido(tipo) ? TITULOS[tipo] : 'Ajuste em massa' };
}

export default async function PaginaAjuste({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!tipoValido(tipo)) notFound();
  const acesso = await exigirPagina(2, `/ajuste/${tipo}`);
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <AjusteTabela tipo={tipo} titulo={TITULOS[tipo]} />
    </main>
  );
}
