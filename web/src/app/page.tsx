import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Início' };

export default function Inicio() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <h1>Stocky</h1>
      <p>Em construção.</p>
    </main>
  );
}
