import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES, REVALIDACAO_MS } from '@/compartilhado/limites';
import { RAIZ_REPO, RAIZ_WEB, ler, lerJson } from '../helpers/arquivos';

const PREFIXO = /^(FIREBASE|DISCORD|WEBHOOK|SESSION|APP)_[A-Z0-9_]+$/;

function nomesDoEnvTs(): string[] {
  const fonte = ler(join(RAIZ_WEB, 'src', 'server', 'env.ts'));
  const achados = [...fonte.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1] ?? '');
  return [...new Set(achados.filter((n) => PREFIXO.test(n)))].sort();
}

function nomesDoExemplo(): string[] {
  return ler(join(RAIZ_WEB, '.env.example'))
    .split(/\r?\n/)
    .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1] ?? '')
    .filter(Boolean)
    .sort();
}

const readme = ler(join(RAIZ_WEB, 'README.md'));
const linhasTabela = readme.split(/\r?\n/).filter((l) => /^\|\s*`[A-Z][A-Z0-9_]+`\s*\|/.test(l));
const tabela = new Map(
  linhasTabela.map((l) => {
    const c = l.split('|').map((x) => x.trim());
    return [(c[1] ?? '').replaceAll('`', ''), (c[2] ?? '').toLowerCase()] as const;
  }),
);

describe('WEB-068 variáveis documentadas', () => {
  it('env.ts e .env.example têm o mesmo conjunto', () => {
    expect(nomesDoExemplo()).toEqual(nomesDoEnvTs());
  });

  it('a tabela do README tem exatamente esse conjunto', () => {
    expect([...tabela.keys()].sort()).toEqual(nomesDoEnvTs());
  });

  it('todas as variáveis do README são citadas só com nomes conhecidos', () => {
    const citadas = [...readme.matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`/g)].map((m) => m[1] ?? '').filter((n) => PREFIXO.test(n));
    const conhecidas = new Set(nomesDoEnvTs());
    expect(citadas.filter((n) => !conhecidas.has(n))).toEqual([]);
  });

  it('cada variável é marcada segredo ou público; Firebase, sessão, secret e webhooks são segredo', () => {
    for (const [nome, tipo] of tabela) {
      expect(['segredo', 'público'], nome).toContain(tipo);
      if (/^(FIREBASE_|WEBHOOK_|SESSION_)/.test(nome) || nome === 'DISCORD_CLIENT_SECRET') expect(tipo, nome).toBe('segredo');
    }
  });

  it('documenta o Redirect URI exato e a rotação da chave', () => {
    expect(readme).toContain('/api/auth/callback');
    expect(readme).toContain('https://<dominio>/api/auth/callback');
    expect(readme).toMatch(/Rotação da chave/);
    expect(readme).toContain('firestore.indexes.json');
    expect(readme).toMatch(/obrigat[óo]rio/);
    expect(readme).toContain('Root Directory');
  });
});

describe('WEB-068 vercel.json', () => {
  const bruto = ler(join(RAIZ_WEB, 'vercel.json'));
  const cfg = JSON.parse(bruto) as { regions?: string[] };

  it('fixa a região gru1', () => {
    expect(cfg.regions).toEqual(['gru1']);
  });

  it('não contém segredos nem webhooks', () => {
    expect(bruto).not.toMatch(/webhooks|PRIVATE KEY|secret|token/i);
  });
});

describe('WEB-070 README', () => {
  it('cita os scripts', () => {
    const scripts = Object.keys(lerJson<{ scripts: Record<string, string> }>(join(RAIZ_WEB, 'package.json')).scripts);
    for (const s of ['dev', 'build', 'start', 'lint', 'typecheck', 'test']) {
      expect(scripts).toContain(s);
      expect(readme).toContain(`npm run ${s}`.replace('npm run test', 'npm test'));
    }
  });

  it('limites e revalidação batem com as constantes', () => {
    const br = (n: number) => n.toLocaleString('pt-BR');
    expect(readme).toContain(br(LIMITES.QUANTIDADE_MAX));
    expect(readme).toContain(br(LIMITES.VALOR_CAIXA_MAX));
    expect(readme).toContain(`${LIMITES.NOME_ITEM_MAX} caracteres`);
    expect(readme).toContain(`${LIMITES.ITENS_POR_CATEGORIA_MAX} itens`);
    expect(readme).toContain(`${LIMITES.AJUSTE_LINHAS_MAX} linhas`);
    expect(readme).toContain(`${REVALIDACAO_MS / 60_000} minutos`);
  });

  it('licença MIT presente', () => {
    expect(ler(join(RAIZ_WEB, 'LICENSE'))).toMatch(/^MIT License/);
    expect(lerJson<{ license: string }>(join(RAIZ_WEB, 'package.json')).license).toBe('MIT');
  });
});

describe('DEPLOY.md', () => {
  const deploy = ler(join(RAIZ_REPO, 'docs', 'web', 'DEPLOY.md'));
  it('cita todas as variáveis, o Redirect URI, o índice e a rotação', () => {
    for (const n of nomesDoEnvTs()) expect(deploy, n).toContain(n);
    expect(deploy).toContain('/api/auth/callback');
    expect(deploy).toMatch(/[ÍI]ndice/);
    expect(deploy).toMatch(/gru1|São Paulo/);
    expect(deploy).toMatch(/antiga/);
  });
});
