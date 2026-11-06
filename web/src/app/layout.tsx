import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/** O CSP usa nonce por requisição (proxy.ts): páginas pré-renderizadas no build ficariam sem hidratar. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Stocky', template: '%s · Stocky' },
  description: 'Gestão de baús e caixa da facção.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="pular" href="#conteudo">
          Ir para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
