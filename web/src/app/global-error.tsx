'use client';

/** Último recurso: erro no próprio layout raiz. Precisa trazer <html> e <body>; sem nada do servidor. */
export default function ErroGlobal({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <head>
        <title>Algo deu errado · Stocky</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          background: '#0b0a10',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main id="conteudo" style={{ maxWidth: '24rem' }}>
          <h1 style={{ marginTop: 0 }}>Algo deu errado</h1>
          <p>Não foi possível carregar o Stocky. Tente de novo em instantes.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '44px',
              padding: '0 1rem',
              border: 0,
              borderRadius: '0.5rem',
              background: '#9000c0',
              color: '#ffffff',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
