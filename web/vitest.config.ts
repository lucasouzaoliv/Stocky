import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const raiz = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': raiz('./src'),
      'server-only': raiz('./test/helpers/server-only-vazio.ts'),
    },
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['test/server/**/*.test.ts', 'test/qa/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'ui', environment: 'jsdom', include: ['test/ui/**/*.test.{ts,tsx}'] },
      },
    ],
  },
});
