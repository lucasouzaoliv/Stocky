import type { Metadata } from 'next';
import Link from 'next/link';
import { Vazio } from '@/components/Estados';

export const metadata: Metadata = { title: 'Página não encontrada' };

export default function NaoEncontrada() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Vazio
        nivelTitulo={1}
        titulo="Página não encontrada"
        descricao="O endereço não existe ou foi movido."
        acao={
          <Link className="botao" href="/">
            Voltar ao início
          </Link>
        }
      />
    </main>
  );
}
