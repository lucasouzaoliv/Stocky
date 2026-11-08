import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { NivelAcesso, TipoBau } from '@/compartilhado/api-tipos';
import { Bau } from '@/components/Bau';
import { SemPermissao } from '@/components/SemPermissao';
import { exigirPagina } from '@/server/auth/pagina';

export const dynamic = 'force-dynamic';

const BAUS: Record<TipoBau, { titulo: string; nivel: NivelAcesso }> = {
  membros: { titulo: 'Baú dos Membros', nivel: 1 },
  gerencia: { titulo: 'Baú da Gerência', nivel: 2 },
  casa: { titulo: 'Baú da Casa', nivel: 2 },
};

function tipoValido(valor: string): valor is TipoBau {
  return Object.hasOwn(BAUS, valor);
}

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }): Promise<Metadata> {
  const { tipo } = await params;
  return { title: tipoValido(tipo) ? BAUS[tipo].titulo : 'Baú' };
}

export default async function PaginaBau({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!tipoValido(tipo)) notFound();
  const { titulo, nivel } = BAUS[tipo];
  const acesso = await exigirPagina(nivel, `/bau/${tipo}`);
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Bau tipo={tipo} titulo={titulo} />
    </main>
  );
}
