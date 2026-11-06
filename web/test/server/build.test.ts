import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CABECALHOS_FIXOS, montarCsp } from '@/server/seguranca/cabecalhos';
import { ENV_TESTE } from '../helpers/env-teste';
import { RAIZ_REPO, RAIZ_WEB, ler, lerJson } from '../helpers/arquivos';
import * as verificador from '../../scripts/verificar-bundle.mjs';
import * as build from '../../scripts/verificar-build.mjs';

const cabecalhosOk = (): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(CABECALHOS_FIXOS).map(([k, v]) => [k.toLowerCase(), v])),
  'content-security-policy': montarCsp('abc123NONCE', true),
});

describe('WEB-069 varredura da saída do build (AC1)', () => {
  it('saída limpa do Next não tem problema', () => {
    const limpa = ['▲ Next.js 16.4.5 (Turbopack)', '✓ Compiled successfully in 4.1s', '  Running TypeScript ...', 'ƒ /api/caixa', '○ (Static) prerendered'].join('\n');
    expect(build.problemasDaSaidaDoBuild(limpa)).toEqual([]);
  });

  it('acusa warn, Failed, error e o símbolo de aviso', () => {
    const suja = ['ok', ' ⚠ Port 3000 is in use', 'warn  - algo', 'Failed to compile.', 'Error: x', 'WARNING: y'].join('\n');
    expect(build.problemasDaSaidaDoBuild(suja)).toHaveLength(5);
  });

  it('o build recebe zero variáveis do site, mesmo se o ambiente do desenvolvedor tem todas', () => {
    const env = { PATH: '/bin', HOME: '/h', ...verificador.envFalso(), NEXT_PUBLIC_X: '1' };
    expect(build.semVariaveisDoSite(env)).toEqual({ PATH: '/bin', HOME: '/h' });
  });
});

describe('WEB-069 conferência de cabeçalhos (AC4)', () => {
  it('os cabeçalhos esperados do script são os mesmos do código de produção', () => {
    expect(build.CABECALHOS_ESPERADOS).toEqual(Object.fromEntries(Object.entries(CABECALHOS_FIXOS).map(([k, v]) => [k.toLowerCase(), v])));
  });

  it('resposta correta passa; aceita Headers reais', () => {
    expect(build.falhasDeCabecalhos(cabecalhosOk())).toEqual([]);
    expect(build.falhasDeCabecalhos(new Headers(cabecalhosOk()))).toEqual([]);
  });

  it('cada cabeçalho ausente ou errado é apontado', () => {
    for (const nome of Object.keys(CABECALHOS_FIXOS).map((k) => k.toLowerCase())) {
      const h = cabecalhosOk();
      delete h[nome];
      expect(build.falhasDeCabecalhos(h).join('|'), nome).toContain(nome);
      h[nome] = 'errado';
      expect(build.falhasDeCabecalhos(h).join('|'), nome).toContain(nome);
    }
  });

  it('CSP sem nonce, com unsafe-eval, sem frame-ancestors e X-Powered-By são apontados', () => {
    const base = cabecalhosOk();
    expect(build.falhasDeCabecalhos({ ...base, 'content-security-policy': "default-src 'self'" }).length).toBeGreaterThan(3);
    expect(build.falhasDeCabecalhos({ ...base, 'content-security-policy': montarCsp('n', false) })).toContain("CSP de produção com 'unsafe-eval'");
    expect(build.falhasDeCabecalhos({ ...base, 'content-security-policy': base['content-security-policy']!.replace("frame-ancestors 'none'", '') })).toContain("CSP sem frame-ancestors 'none'");
    expect(build.falhasDeCabecalhos({ ...base, 'x-powered-by': 'Next.js' })).toContain('X-Powered-By presente');
  });
});

describe('WEB-069 integração', () => {
  it('o CI e o package.json expõem o passo verificar:build', () => {
    expect(lerJson<{ scripts: Record<string, string> }>(join(RAIZ_WEB, 'package.json')).scripts['verificar:build']).toBe('node scripts/verificar-build.mjs');
    expect(ler(join(RAIZ_REPO, '.github', 'workflows', 'web.yml'))).toContain('npm run verificar:build');
  });
});

describe('WEB-069 AC1, AC3 e AC4 no build e no servidor reais', () => {
  let resultadoBuild: { status: number; saida: string };

  beforeAll(() => {
    resultadoBuild = build.construir(RAIZ_WEB);
  }, 280_000);

  it('AC1: `npm run build` sem nenhuma variável do site termina com sucesso e sem warn/Failed/error', () => {
    expect(resultadoBuild.status, resultadoBuild.saida.slice(-2000)).toBe(0);
    expect(build.problemasDaSaidaDoBuild(resultadoBuild.saida)).toEqual([]);
  });

  it('AC3 e AC4: `npm run start` responde 200 em /login, 401 em /api/caixa, com cabeçalhos; encerra o servidor', async () => {
    expect(resultadoBuild.status).toBe(0);
    expect(await build.verificarServidor(RAIZ_WEB)).toEqual([]);
  }, 120_000);

  it('o bundle do build recém-feito não tem segredo nenhum', () => {
    const estatico = join(RAIZ_WEB, '.next', 'static');
    expect(existsSync(estatico)).toBe(true);
    const reais = Object.values(ENV_TESTE).concat(Object.values(process.env).filter((v): v is string => !!v && v.length >= 20));
    expect(verificador.varrer(estatico, reais)).toEqual([]);
  });
});
