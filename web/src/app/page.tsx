import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Início' };

/** Página estática: os links levam a rotas protegidas, que mandam para /login quando não há sessão. */
export default function Inicio() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <h1>Stocky</h1>
      <div className="bau__acoes">
        <Link className="botao" href="/bau/membros">
          Abrir o Baú dos Membros
        </Link>
        <Link className="botao botao--secundario" href="/logs">
          Ver os logs
        </Link>
      </div>
    </main>
  );
}
