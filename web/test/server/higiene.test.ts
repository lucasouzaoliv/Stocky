import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_WEB, RAIZ_REPO, ler, lerJson, listar } from '../helpers/arquivos';

const codigo = (pasta: string) => listar(join(RAIZ_WEB, pasta), /\.(ts|tsx|mjs|js)$/);

describe('WEB-002 scripts e higiene de lint/tipos', () => {
  const scripts = lerJson<{ scripts: Record<string, string> }>(join(RAIZ_WEB, 'package.json')).scripts;

  it('AC1: scripts exigidos existem', () => {
    for (const nome of ['dev', 'build', 'start', 'lint', 'typecheck', 'test']) {
      expect(scripts[nome], nome).toBeTruthy();
    }
    expect(scripts.lint).toContain('--max-warnings=0');
    expect(scripts.typecheck).toBe('tsc --noEmit');
    expect(scripts.build).toBe('next build');
  });

  it('AC2: config do ESLint usa a config do Next, sem regras desligadas', () => {
    const cfg = ler(join(RAIZ_WEB, 'eslint.config.mjs'));
    expect(cfg).toContain('eslint-config-next');
    expect(cfg).not.toMatch(/['"](off|0)['"]/);
  });

  it('AC4: sem eslint-disable, @ts-ignore, @ts-nocheck, nem regra off', () => {
    const arquivos = [...codigo('src'), ...codigo('test'), join(RAIZ_WEB, 'eslint.config.mjs')].filter(
      (f) => !f.endsWith('higiene.test.ts'),
    );
    expect(arquivos.length).toBeGreaterThan(0);
    for (const f of arquivos) {
      expect(ler(f), f).not.toMatch(/eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error/);
    }
  });
});

describe('WEB-003 higiene dos testes', () => {
  it('AC2: nenhum .only, .skip, .todo ou xit em web/test', () => {
    const proibido = /\b(?:it|test|describe)\.(?:only|skip|todo)\b|\bx(?:it|describe|test)\b|\b(?:fit|fdescribe)\b/;
    const arquivos = listar(join(RAIZ_WEB, 'test'), /\.(ts|tsx)$/).filter((f) => !f.endsWith('higiene.test.ts'));
    expect(arquivos.length).toBeGreaterThan(0);
    for (const f of arquivos) expect(ler(f), f).not.toMatch(proibido);
  });

  it('o detector reconhece os padrões proibidos', () => {
    const proibido = /\b(?:it|test|describe)\.(?:only|skip|todo)\b|\bx(?:it|describe|test)\b|\b(?:fit|fdescribe)\b/;
    for (const amostra of ['it.only(', 'test.skip(', 'describe.todo(', 'xit(']) {
      expect(proibido.test(amostra), amostra).toBe(true);
    }
    expect(proibido.test("it('ok', () => {})")).toBe(false);
  });
});

describe('WEB-004 .gitignore', () => {
  it('AC1: contém as entradas obrigatórias', () => {
    const linhas = ler(join(RAIZ_WEB, '.gitignore')).split(/\r?\n/).map((l) => l.trim());
    for (const e of ['node_modules/', '.next/', '.env', '.env.local', '.env*.local', '.vercel/', 'coverage/']) {
      expect(linhas, e).toContain(e);
    }
  });

  it('raiz do repo é a esperada', () => {
    expect(RAIZ_REPO.endsWith('stocky')).toBe(true);
  });
});
