import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_REPO, RAIZ_WEB, ler } from '../helpers/arquivos';

const VARIAVEIS = [
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID',
  'DISCORD_ROLE_MEMBRO', 'DISCORD_ROLE_GERENTE', 'DISCORD_ROLE_DONO',
  'SESSION_SECRET', 'APP_URL',
  'WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_LOG_CAIXA',
  'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA', 'WEBHOOK_SALDO_CAIXA',
];

const FALSO = /troque-aqui|exemplo|^0{17,20}$|^http:\/\/localhost(:\d+)?$/;

const PADROES_SEGREDO: Array<[string, RegExp]> = [
  ['chave privada', /BEGIN (?:RSA |EC )?PRIVATE KEY/],
  ['private_key_id com valor', /private_key_id["']?\s*[:=]\s*["']?[0-9a-f]{20,}/i],
  ['webhook com token real', /discord(?:app)?\.com\/api\/webhooks\/\d+\/(?!troque-aqui)[\w-]{20,}/],
  ['token do Discord', /[MNO][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27,}/],
];

function arquivosRastreados(): string[] {
  try {
    const saida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: RAIZ_REPO, encoding: 'utf8',
    });
    return saida.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function lerEnvExample(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linha of ler(join(RAIZ_WEB, '.env.example')).split(/\r?\n/)) {
    if (!linha.trim() || linha.startsWith('#')) continue;
    const i = linha.indexOf('=');
    mapa.set(linha.slice(0, i), linha.slice(i + 1));
  }
  return mapa;
}

describe('WEB-004 .env.example', () => {
  const env = lerEnvExample();

  it('AC2: lista exatamente as variáveis previstas', () => {
    expect([...env.keys()].sort()).toEqual([...VARIAVEIS].sort());
  });

  it('AC2: todo valor é obviamente falso', () => {
    for (const [nome, valor] of env) {
      const final = valor.startsWith('https://') ? valor.split('/').pop() ?? '' : valor;
      const id = valor.startsWith('https://') ? valor.split('/').slice(-2)[0] ?? '' : valor;
      expect(FALSO.test(final) || FALSO.test(id) || FALSO.test(valor), `${nome}=${valor}`).toBe(true);
    }
  });
});

describe('WEB-004 varredura de segredos', () => {
  const arquivos = arquivosRastreados();

  it('AC4: nenhum .env, .env.local, node_modules ou .next rastreado', () => {
    expect(arquivos.length).toBeGreaterThan(0);
    const ruins = arquivos.filter((f) =>
      /(^|\/)\.env(\.local|\..*\.local)?$/.test(f) || /(^|\/)node_modules\//.test(f) || /(^|\/)\.next\//.test(f),
    );
    expect(ruins).toEqual([]);
  });

  it('AC3: nenhum arquivo do site contém padrão de segredo', () => {
    const doSite = arquivos.filter(
      (f) => (f.startsWith('web/') || f.startsWith('.github/')) &&
        !f.endsWith('segredos.test.ts') && !/package-lock\.json$/.test(f) && existsSync(join(RAIZ_REPO, f)),
    );
    expect(doSite.length).toBeGreaterThan(0);
    for (const f of doSite) {
      const texto = ler(join(RAIZ_REPO, f));
      for (const [nome, padrao] of PADROES_SEGREDO) expect(padrao.test(texto), `${nome} em ${f}`).toBe(false);
    }
  });

  it('AC3: os padrões detectam segredos de amostra', () => {
    const pem = ['-----BEGIN PRIVATE', 'KEY-----'].join(' ');
    const hook = 'https://discord.com/api/webhooks/123456789012345678/' + 'a'.repeat(40);
    expect(PADROES_SEGREDO[0]?.[1].test(pem)).toBe(true);
    expect(PADROES_SEGREDO[1]?.[1].test('"private_key_id": "' + 'ab12'.repeat(10) + '"')).toBe(true);
    expect(PADROES_SEGREDO[2]?.[1].test(hook)).toBe(true);
    expect(PADROES_SEGREDO[2]?.[1].test('https://discord.com/api/webhooks/000000000000000000/troque-aqui')).toBe(false);
  });
});
