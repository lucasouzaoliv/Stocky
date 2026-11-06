import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA-W7: o redirecionamento sem sessão tem de sair com status 307 antes do streaming.
 * Um loading.tsx (Suspense) acima do layout protegido faz o redirect() sair como meta refresh com status 200.
 * O layout protegido (que checa a sessão e não renderiza filhos sem ela, ver guardas.test.tsx)
 * tem de ficar fora de qualquer fronteira de Suspense; o loading fica dentro dele.
 */
const RAIZ = join(__dirname, '../../src/app');

function loadings(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) loadings(caminho, acc);
    else if (/^loading\.(t|j)sx?$/.test(nome)) acc.push(caminho.slice(RAIZ.length));
  }
  return acc;
}

describe('WEB-054/WEB-055: redirect de servidor sem sessão (QA-W7)', () => {
  it('não há loading.tsx acima do layout protegido (raiz de app/ ou fora do grupo)', () => {
    expect(existsSync(join(RAIZ, 'loading.tsx'))).toBe(false);
    const fora = loadings(RAIZ).filter((p) => !p.startsWith('/(protegido)/'));
    expect(fora).toEqual([]);
  });

  it('o estado de carregamento existe dentro do grupo protegido (abaixo do layout)', () => {
    expect(existsSync(join(RAIZ, '(protegido)/loading.tsx'))).toBe(true);
    expect(existsSync(join(RAIZ, '(protegido)/layout.tsx'))).toBe(true);
  });
});
