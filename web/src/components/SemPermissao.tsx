import Link from 'next/link';

export function SemPermissao() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <section className="estado estado--erro" aria-labelledby="sem-permissao-titulo">
        <h1 id="sem-permissao-titulo" className="estado__titulo">
          Sem permissão
        </h1>
        <p className="estado__texto">Você não tem permissão para ver esta página. Fale com a liderança da facção se precisar de acesso.</p>
        <Link className="botao" href="/bau/membros">
          Ir para o Baú dos Membros
        </Link>
      </section>
    </main>
  );
}
