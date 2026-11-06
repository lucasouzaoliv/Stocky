import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { montarCsp } from '@/server/seguranca/cabecalhos';
import { RAIZ_WEB, lerJson } from '../helpers/arquivos';

interface Pacote {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  license?: string;
}

describe('WEB-001 scaffold', () => {
  const tsconfig = lerJson<{ compilerOptions: Record<string, unknown> }>(join(RAIZ_WEB, 'tsconfig.json'));
  const pacote = lerJson<Pacote>(join(RAIZ_WEB, 'package.json'));

  it('AC1: tsconfig estrito', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
    expect(tsconfig.compilerOptions.noImplicitOverride).toBe(true);
  });

  it('alias @/ aponta para src', () => {
    expect(tsconfig.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
  });

  it('AC3: arquivos e pastas mínimos existem', () => {
    for (const caminho of ['src/app/layout.tsx', 'src/app/page.tsx', 'src/server', 'src/components']) {
      expect(existsSync(join(RAIZ_WEB, caminho)), caminho).toBe(true);
    }
  });

  it('AC4: engines.node fixado e nenhuma versão solta', () => {
    expect(pacote.engines?.node).toBe('22.x');
    const todas = { ...pacote.dependencies, ...pacote.devDependencies };
    for (const [nome, versao] of Object.entries(todas)) {
      expect(versao, nome).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('AC4: sem dependências de Firebase, Discord ou Vercel nesta onda', () => {
    const nomes = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
    expect(nomes.filter((n) => /firebase|discord|vercel/i.test(n))).toEqual([]);
  });

  it('licença MIT declarada e arquivo presente', () => {
    expect(pacote.license).toBe('MIT');
    expect(existsSync(join(RAIZ_WEB, 'LICENSE'))).toBe(true);
  });
});

describe('WEB-003 alias e ambiente', () => {
  it('AC3: importa @/server pelo alias', () => {
    expect(montarCsp('abc', true)).toContain("default-src 'self'");
  });

  it('AC4: roda sem variáveis FIREBASE_* ou DISCORD_*', () => {
    const definidas = Object.keys(process.env).filter((k) => /^(FIREBASE_|DISCORD_)/.test(k));
    expect(definidas).toEqual([]);
  });
});
