import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/app/api/**/route.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ExportNamedDeclaration > FunctionDeclaration[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]',
          message: 'Exporte o método como `export const GET = comAutorizacao(...)` ou `rotaPublica(...)`.',
        },
        {
          selector: 'ExportNamedDeclaration[source]',
          message: 'Não reexporte handlers: declare-os na própria rota, com comAutorizacao ou rotaPublica.',
        },
        {
          selector:
            'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]:not([init.callee.name=/^(comAutorizacao|rotaPublica)$/])',
          message: 'Todo método HTTP exportado precisa vir de comAutorizacao ou rotaPublica.',
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
]);
