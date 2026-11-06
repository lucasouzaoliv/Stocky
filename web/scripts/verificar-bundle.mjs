#!/usr/bin/env node
// WEB-027: prova que nenhum segredo vai ao navegador.
// Uso: `node scripts/verificar-bundle.mjs`          constrói com valores falsos distintivos e varre .next/static
//      `node scripts/verificar-bundle.mjs --so-varrer` só varre um .next/static já existente
// A construção sobrescreve .next com um build de valores falsos (use em CI ou antes de um build real).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const INICIO_CHAVE = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
const FIM_CHAVE = ['-----END ', 'PRIVATE KEY-----'].join('');

export const MARCADOR = 'SEGREDO-FALSO-123';

export const VARIAVEIS_SECRETAS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DISCORD_CLIENT_SECRET',
  'SESSION_SECRET',
  'WEBHOOK_LOG_MEMBROS',
  'WEBHOOK_LOG_GERENCIA',
  'WEBHOOK_LOG_CAIXA',
  'WEBHOOK_INVENTARIO_MEMBROS',
  'WEBHOOK_INVENTARIO_GERENCIA',
  'WEBHOOK_SALDO_CAIXA',
];

/** Valores falsos que passam na validação de env e contêm o marcador. */
export function envFalso() {
  const env = {
    FIREBASE_PROJECT_ID: `${MARCADOR}-projeto`,
    FIREBASE_CLIENT_EMAIL: `${MARCADOR}-conta@exemplo.iam.gserviceaccount.com`,
    FIREBASE_PRIVATE_KEY: `${INICIO_CHAVE}\\n${MARCADOR}-chave\\n${FIM_CHAVE}\\n`,
    DISCORD_CLIENT_ID: '111111111111111111',
    DISCORD_CLIENT_SECRET: `${MARCADOR}-discord`,
    DISCORD_GUILD_ID: '222222222222222222',
    DISCORD_ROLE_MEMBRO: '333333333333333331',
    DISCORD_ROLE_GERENTE: '333333333333333333',
    DISCORD_ROLE_DONO: '333333333333333334',
    SESSION_SECRET: `${MARCADOR}-sessao-com-mais-de-32-caracteres`,
    APP_URL: 'https://stocky-verificacao.vercel.app',
  };
  for (const nome of VARIAVEIS_SECRETAS.filter((n) => n.startsWith('WEBHOOK_'))) {
    env[nome] = `https://discord.com/api/webhooks/123456789012345678/${MARCADOR}-${nome}`;
  }
  return env;
}

function arquivos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).flatMap((nome) => {
    const cheio = join(pasta, nome);
    return statSync(cheio).isDirectory() ? arquivos(cheio) : [cheio];
  });
}

/**
 * Procura nos arquivos de `pasta` os valores dos segredos, o marcador, nomes de variáveis secretas,
 * URLs de webhook e chaves privadas. Devolve [{ arquivo, achado }]; vazio = limpo.
 */
export function varrer(pasta, valores = Object.values(envFalso())) {
  const achados = [];
  const procurados = [
    ...valores.filter((v) => v.length >= 8).map((v) => ['valor de segredo', v]),
    ['marcador de segredo falso', MARCADOR],
    ...VARIAVEIS_SECRETAS.map((n) => ['nome de variável secreta', n]),
    ['URL de webhook', 'discord.com/api/webhooks/'],
    ['URL de webhook', 'discordapp.com/api/webhooks/'],
    ['chave privada', INICIO_CHAVE.slice(5, 28)],
  ];
  for (const arquivo of arquivos(pasta)) {
    if (!/\.(js|mjs|css|html|json|map|txt)$/.test(arquivo)) continue;
    const texto = readFileSync(arquivo, 'utf8');
    for (const [tipo, termo] of procurados) if (texto.includes(termo)) achados.push({ arquivo, achado: tipo });
  }
  return achados;
}

function principal() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (!process.argv.includes('--so-varrer')) {
    const build = spawnSync('npx', ['next', 'build'], {
      cwd: raiz,
      stdio: 'inherit',
      env: { ...process.env, ...envFalso(), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    });
    if (build.status !== 0) {
      console.error('Falha no build de verificação.');
      process.exit(build.status ?? 1);
    }
  }
  const estatico = join(raiz, '.next', 'static');
  if (!existsSync(estatico)) {
    console.error('Não existe .next/static. Rode o build antes.');
    process.exit(1);
  }
  const total = arquivos(estatico).length;
  const achados = varrer(estatico);
  if (achados.length > 0) {
    for (const a of achados) console.error(`VAZAMENTO (${a.achado}): ${a.arquivo}`);
    process.exit(1);
  }
  console.log(`Bundle limpo: ${total} arquivos em .next/static sem nenhum segredo.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
