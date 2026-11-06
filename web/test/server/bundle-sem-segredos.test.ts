import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIZ_WEB, ler, listar } from '../helpers/arquivos';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { especificadores, violacoesDoCliente, violacoesDoCompartilhado } from '../helpers/grafo-imports';
import * as verificador from '../../scripts/verificar-bundle.mjs';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

const SRC = join(RAIZ_WEB, 'src');
const SEGREDOS = [
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET',
  'WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_LOG_CAIXA',
  'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA', 'WEBHOOK_SALDO_CAIXA',
];

describe('WEB-027 AC1 nada de segredo com prefixo NEXT_PUBLIC_', () => {
  it('.env.example e next.config não expõem variável secreta como pública', () => {
    const exemplo = ler(join(RAIZ_WEB, '.env.example'));
    expect(exemplo).not.toMatch(/^\s*NEXT_PUBLIC_/m);
    for (const nome of SEGREDOS) expect(exemplo, nome).not.toContain(`NEXT_PUBLIC_${nome}`);
    const config = ler(join(RAIZ_WEB, 'next.config.ts'));
    expect(config).not.toMatch(/NEXT_PUBLIC_/);
    expect(config).not.toMatch(/^\s*env\s*:/m);
  });

  it('nenhum arquivo do site (src, test, scripts, workflow) usa NEXT_PUBLIC_ + nome de segredo', () => {
    const arquivos = [...listar(SRC, /\.(ts|tsx|mjs|js)$/), ...listar(join(RAIZ_WEB, 'scripts'), /\.mjs$/)];
    for (const f of arquivos) {
      const t = ler(f);
      for (const nome of SEGREDOS) expect(t, `${f} ${nome}`).not.toContain(`NEXT_PUBLIC_${nome}`);
    }
  });

  it('só src/server lê process.env de variável secreta', () => {
    const fora = listar(SRC, /\.(ts|tsx)$/).filter((f) => !f.startsWith(join(SRC, 'server')));
    for (const f of fora) {
      const t = ler(f);
      for (const nome of SEGREDOS) expect(t, `${f} ${nome}`).not.toContain(nome);
    }
  });
});

describe('WEB-027 AC3 nenhum "use client" alcança src/server', () => {
  it('varredura transitiva de imports no código real', () => {
    expect(violacoesDoCliente(SRC)).toEqual([]);
  });

  it('compartilhado continua puro (ADR-13)', () => {
    expect(violacoesDoCompartilhado(SRC)).toEqual([]);
  });

  describe('o detector acha violações em uma árvore de exemplo', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'grafo-'));
      for (const p of ['components', 'server', 'compartilhado', 'intermediario']) mkdirSync(join(dir, p), { recursive: true });
      writeFileSync(join(dir, 'server', 'segredo.ts'), "export const x = process.env.SESSION_SECRET;\n");
      writeFileSync(join(dir, 'intermediario', 'ponte.ts'), "export { x } from '../server/segredo';\n");
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('direto, transitivo, import dinâmico e pacote proibido', () => {
      writeFileSync(join(dir, 'components', 'direto.tsx'), `'use client';\nimport { x } from '@/server/segredo';\nexport const A = x;\n`);
      writeFileSync(join(dir, 'components', 'transitivo.tsx'), `"use client";\nimport { x } from '../intermediario/ponte';\nexport const B = x;\n`);
      writeFileSync(join(dir, 'components', 'dinamico.tsx'), `'use client';\nexport const c = () => import('@/server/segredo');\n`);
      writeFileSync(join(dir, 'components', 'pacote.tsx'), `'use client';\nimport 'server-only';\n`);
      writeFileSync(join(dir, 'components', 'limpo.tsx'), `'use client';\nimport { y } from '../compartilhado/ok';\nexport const D = y;\n`);
      writeFileSync(join(dir, 'compartilhado', 'ok.ts'), 'export const y = 1;\n');
      writeFileSync(join(dir, 'components', 'servidor.tsx'), `import { x } from '@/server/segredo';\nexport const E = x;\n`);
      const v = violacoesDoCliente(dir).map((x) => x.cliente.split('/').pop());
      expect(v.sort()).toEqual(['dinamico.tsx', 'direto.tsx', 'pacote.tsx', 'transitivo.tsx']);
    });

    it('compartilhado que importa server é apontado', () => {
      writeFileSync(join(dir, 'compartilhado', 'ruim.ts'), "import { x } from '@/server/segredo';\nimport 'server-only';\n");
      expect(violacoesDoCompartilhado(dir)).toHaveLength(2);
    });

    it('especificadores lê import, export from, dinâmico e require', () => {
      const t = "import a from 'a';\nimport type { B } from 'b';\nimport 'c';\nexport * from 'd';\nconst e = import('e');\nconst f = require('f');";
      expect(especificadores(t).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  });
});

describe('WEB-027 AC4 HTML de /login e / sem segredos', () => {
  beforeEach(() => aplicarEnvTeste());
  afterEach(() => limparEnvTeste());

  it('a tela de login renderizada (com o layout) não contém valores de variável secreta nem URL de webhook', async () => {
    const { default: Layout } = await import('@/app/layout');
    const { default: Login } = await import('@/app/login/page');
    const pagina = await Login({ searchParams: Promise.resolve({ erro: 'discord' }) });
    const html = renderToStaticMarkup(createElement(Layout, null, pagina));
    expect(html).toContain('<html');
    expect(html.length).toBeGreaterThan(200);
    for (const nome of SEGREDOS) {
      const valor = ENV_TESTE[nome]!;
      expect(html, nome).not.toContain(valor);
      expect(html, nome).not.toContain(nome);
    }
    expect(html).not.toMatch(/api\/webhooks|BEGIN PRIVATE KEY/);
  });

  it('a página inicial (/) renderizada não vaza nada', async () => {
    const { default: Inicio } = await import('@/app/page');
    const html = renderToStaticMarkup(createElement(Inicio));
    for (const nome of SEGREDOS) {
      expect(html, nome).not.toContain(ENV_TESTE[nome]!);
      expect(html, nome).not.toContain(nome);
    }
    expect(html).not.toMatch(/api\/webhooks/);
  });
});

describe('WEB-027 AC2 varredura do bundle (scripts/verificar-bundle.mjs)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('usa valores falsos distintivos que passam na validação de env e têm o marcador', async () => {
    const env = verificador.envFalso();
    expect(verificador.MARCADOR).toBe('SEGREDO-FALSO-123');
    for (const nome of verificador.VARIAVEIS_SECRETAS) expect(env[nome], nome).toContain('SEGREDO-FALSO-123');
    const { getEnv, resetEnv } = await import('@/server/env');
    const original = { ...process.env };
    try {
      Object.assign(process.env, env);
      resetEnv();
      expect(() => getEnv()).not.toThrow();
    } finally {
      for (const k of Object.keys(env)) {
        if (original[k] === undefined) delete process.env[k];
        else process.env[k] = original[k];
      }
      resetEnv();
    }
  });

  it('bundle limpo → zero ocorrências', () => {
    writeFileSync(join(dir, 'app.js'), 'console.log("olá", 1 + 1);');
    expect(verificador.varrer(dir)).toEqual([]);
  });

  it('acha valor de segredo, marcador, nome de variável, URL de webhook e chave privada', () => {
    const env = verificador.envFalso();
    writeFileSync(join(dir, 'a.js'), `x="${env.SESSION_SECRET}"`);
    writeFileSync(join(dir, 'b.js'), 'y="SEGREDO-FALSO-123"');
    writeFileSync(join(dir, 'c.js'), 'z=process.env.DISCORD_CLIENT_SECRET');
    writeFileSync(join(dir, 'd.js'), 'w="https://discord.com/api/webhooks/1/abc"');
    writeFileSync(join(dir, 'e.js'), `k="${['-----BEGIN ', 'PRIVATE KEY-----'].join('')}"`);
    const arquivos = new Set(verificador.varrer(dir).map((a) => a.arquivo.split('/').pop()));
    expect([...arquivos].sort()).toEqual(['a.js', 'b.js', 'c.js', 'd.js', 'e.js']);
  });
});
