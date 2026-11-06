import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_REPO, RAIZ_WEB, ler, lerJson } from '../helpers/arquivos';

const yaml = ler(join(RAIZ_REPO, '.github', 'workflows', 'web.yml'));

describe('WEB-007 CI', () => {
  it('AC1: roda os passos na ordem, em web/', () => {
    const comandos = [...yaml.matchAll(/^\s*run:[ \t]+(\S.*)$/gm)].map((m) => (m[1] ?? '').trim());
    expect(comandos).toEqual(['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'npm run verificar:bundle']);
    expect(yaml).toMatch(/working-directory:\s*web\b/);
  });

  it('AC2: não referencia secrets', () => {
    expect(yaml).not.toMatch(/secrets\./);
  });

  it('AC3: Node igual ao de engines', () => {
    const engines = lerJson<{ engines: { node: string } }>(join(RAIZ_WEB, 'package.json')).engines.node;
    const usado = /node-version:\s*['"]?(\d+)/.exec(yaml)?.[1];
    expect(usado).toBe(engines.split('.')[0]);
  });

  it('dispara em push e pull_request', () => {
    expect(yaml).toMatch(/^\s*push:/m);
    expect(yaml).toMatch(/^\s*pull_request:/m);
  });
});
