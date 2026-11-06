import { Carregando } from '@/components/Estados';

export default function CarregandoRota() {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <Carregando />
    </main>
  );
}
