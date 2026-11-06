import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Início' };

/** Página estática: os links levam a rotas protegidas, que mandam para /login quando não há sessão. */
export default function Inicio() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo login">
      <section className="login__cartao" aria-labelledby="inicio-titulo">
        <span className="login__logo" aria-hidden="true" />
        <h1 id="inicio-titulo" className="sr-only">Stocky</h1>
        <Link className="botao login__botao" href="/bau/membros">
          Abrir o Baú dos Membros
        </Link>
        <Link className="botao botao--secundario login__botao" href="/logs">
          Ver os logs
        </Link>
      </section>
    </main>
  );
}
