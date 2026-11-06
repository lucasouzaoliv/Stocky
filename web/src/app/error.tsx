'use client';

import { ErroTela } from '@/components/Estados';

export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo">
      <ErroTela
        mensagem="Não foi possível carregar esta página. Tente de novo em instantes."
        aoTentarNovamente={reset}
      />
    </main>
  );
}
