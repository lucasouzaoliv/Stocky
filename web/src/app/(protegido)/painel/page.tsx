import type { Metadata } from 'next';
import Link from 'next/link';
import { AtualizarCatalogo } from '@/components/AtualizarCatalogo';
import { Catalogo } from '@/components/Catalogo';
import { SemPermissao } from '@/components/SemPermissao';
import { ZerarBau } from '@/components/ZerarBau';
import { exigirPagina } from '@/server/auth/pagina';

export const metadata: Metadata = { title: 'Painel' };
export const dynamic = 'force-dynamic';

export default async function PaginaPainel() {
  const acesso = await exigirPagina(2, '/painel');
  if ('semPermissao' in acesso) return <SemPermissao />;
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <div className="painel">
        <h1>Painel</h1>
        <section className="painel__bloco" aria-labelledby="painel-ajuste">
          <h2 id="painel-ajuste" className="painel__titulo">
            Ajuste em massa
          </h2>
          <p className="painel__ajuda">Corrija o estoque de vários itens de uma vez, com resumo antes de aplicar.</p>
          <div className="bau__acoes">
            <Link className="botao botao--secundario" href="/ajuste/membros">
              Ajustar Baú dos Membros
            </Link>
            <Link className="botao botao--secundario" href="/ajuste/gerencia">
              Ajustar Baú da Gerência
            </Link>
            <Link className="botao botao--secundario" href="/ajuste/casa">
              Ajustar Baú da Casa
            </Link>
          </div>
        </section>
        <Catalogo />
        <AtualizarCatalogo />
        <ZerarBau />
      </div>
    </main>
  );
}
