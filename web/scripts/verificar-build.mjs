#!/usr/bin/env node
// WEB-069: prova AC1 (build sem variáveis de ambiente passa, sem aviso nem falha), AC3 (`npm run start` responde
// 200 em /login, 401 em /api/caixa e 307 para /login nas páginas protegidas, sem sessão) e AC4 (cabeçalhos de segurança na resposta real).
// Uso: `node scripts/verificar-build.mjs`   constrói SEM variáveis do site, sobe `npm run start` com valores falsos,
//                                           confere as respostas e encerra o servidor pelo PID (grupo do processo).
// O build sobrescreve .next, como `npm run build`.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envFalso } from './verificar-bundle.mjs';

/** Mesmos valores de `CABECALHOS_FIXOS` em src/server/seguranca/cabecalhos.ts (o teste confere que não divergem). */
export const CABECALHOS_ESPERADOS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

/** Páginas que exigem sessão: sem cookie, o servidor responde 307 para /login (QA-W14). */
export const PAGINAS_PROTEGIDAS = ['/caixa', '/painel', '/bau/membros', '/bau/gerencia', '/logs', '/auditoria', '/ajuste/membros'];

const PADRAO_PROBLEMA = /(^|\s)(⚠|warn(ing)?\b|failed\b|error\b)/i;

/** Linhas da saída do build que indicam aviso ou falha. Vazio = limpo. */
export function problemasDaSaidaDoBuild(texto) {
  return String(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && PADRAO_PROBLEMA.test(l));
}

/** Variáveis do site que o build NÃO pode receber (AC1: build sem nenhuma variável de ambiente do site). */
export function semVariaveisDoSite(env) {
  const limpo = { ...env };
  for (const nome of Object.keys(limpo)) {
    if (/^(FIREBASE_|DISCORD_|WEBHOOK_|SESSION_|APP_URL|NEXT_PUBLIC_)/.test(nome)) delete limpo[nome];
  }
  return limpo;
}

function valorDe(cabecalhos, nome) {
  return typeof cabecalhos.get === 'function' ? cabecalhos.get(nome) : cabecalhos[nome];
}

/** Confere os cabeçalhos de segurança de uma resposta real. Devolve a lista de falhas (vazia = ok). */
export function falhasDeCabecalhos(cabecalhos) {
  const falhas = [];
  for (const [nome, esperado] of Object.entries(CABECALHOS_ESPERADOS)) {
    const obtido = valorDe(cabecalhos, nome);
    if (obtido !== esperado) falhas.push(`${nome}: esperado "${esperado}", veio "${obtido ?? 'ausente'}"`);
  }
  const csp = valorDe(cabecalhos, 'content-security-policy') ?? '';
  const exigidos = [
    [/(^|; )default-src 'self'(;|$)/, "default-src 'self'"],
    [/script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'/, 'script-src com nonce'],
    [/script-src [^;]*'strict-dynamic'/, "script-src 'strict-dynamic'"],
    [/(^|; )object-src 'none'(;|$)/, "object-src 'none'"],
    [/(^|; )base-uri 'self'(;|$)/, "base-uri 'self'"],
    [/(^|; )frame-ancestors 'none'(;|$)/, "frame-ancestors 'none'"],
  ];
  for (const [regex, nome] of exigidos) if (!regex.test(csp)) falhas.push(`CSP sem ${nome}`);
  if (/'unsafe-eval'/.test(csp)) falhas.push("CSP de produção com 'unsafe-eval'");
  if (valorDe(cabecalhos, 'x-powered-by')) falhas.push('X-Powered-By presente');
  return falhas;
}

async function portaLivre() {
  const servidor = createServer();
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const { port } = servidor.address();
  servidor.close();
  await once(servidor, 'close');
  return port;
}

async function esperarResposta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  let ultimo = 'sem resposta';
  while (Date.now() < fim) {
    try {
      return await fetch(url, { redirect: 'manual' });
    } catch (erro) {
      ultimo = String(erro?.cause?.code ?? erro?.message ?? erro);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`O servidor não respondeu em ${limiteMs / 1000}s (${ultimo}).`);
}

function grupoVivo(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Encerra o servidor pelo PID: SIGTERM no grupo do processo (npm, sh e next-server) e SIGKILL se algo sobrar. */
async function encerrar(filho) {
  const pid = filho?.pid;
  if (!pid) return;
  const sinalizar = (sinal) => {
    try {
      process.kill(-pid, sinal);
    } catch {
      // grupo já encerrado
    }
  };
  sinalizar('SIGTERM');
  const limite = Date.now() + 8000;
  while (grupoVivo(pid) && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
  if (grupoVivo(pid)) {
    sinalizar('SIGKILL');
    while (grupoVivo(pid)) await new Promise((r) => setTimeout(r, 50));
  }
}

/** Constrói sem variáveis do site e devolve { status, saida }. */
export function construir(raiz, envBase = process.env) {
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...semVariaveisDoSite(envBase), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? 1, saida: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

/** Sobe `npm run start` numa porta livre, confere AC3 e AC4 e encerra o servidor. Devolve a lista de falhas. */
export async function verificarServidor(raiz, envBase = process.env) {
  const falhas = [];
  const porta = await portaLivre();
  const filho = spawn('npm', ['run', 'start', '--', '-H', '127.0.0.1', '-p', String(porta)], {
    cwd: raiz,
    detached: true,
    stdio: 'ignore',
    env: { ...semVariaveisDoSite(envBase), ...envFalso(), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  });
  try {
    const base = `http://127.0.0.1:${porta}`;
    const login = await esperarResposta(`${base}/login`, 60_000);
    if (login.status !== 200) falhas.push(`GET /login: esperado 200, veio ${login.status}`);
    for (const f of falhasDeCabecalhos(login.headers)) falhas.push(`/login ${f}`);

    const caixa = await fetch(`${base}/api/caixa`, { redirect: 'manual' });
    if (caixa.status !== 401) falhas.push(`GET /api/caixa sem sessão: esperado 401, veio ${caixa.status}`);
    const corpo = await caixa.json().catch(() => null);
    if (corpo?.codigo !== 'SEM_SESSAO') falhas.push('GET /api/caixa sem sessão: corpo sem codigo SEM_SESSAO');
    if (!/no-store/.test(caixa.headers.get('cache-control') ?? '')) falhas.push('GET /api/caixa sem Cache-Control: no-store');
    for (const f of falhasDeCabecalhos(caixa.headers)) falhas.push(`/api/caixa ${f}`);

    for (const caminho of PAGINAS_PROTEGIDAS) {
      const r = await fetch(`${base}${caminho}`, { redirect: 'manual' });
      if (r.status !== 307) falhas.push(`GET ${caminho} sem sessão: esperado 307, veio ${r.status}`);
      else if (new URL(r.headers.get('location') ?? '', base).pathname !== '/login') {
        falhas.push(`GET ${caminho} sem sessão: Location esperado /login, veio ${r.headers.get('location')}`);
      }
    }
  } finally {
    await encerrar(filho);
  }
  return falhas;
}

async function principal() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const build = construir(raiz);
  if (build.status !== 0) {
    console.error(build.saida);
    console.error('FALHA: o build sem variáveis de ambiente não passou (AC1).');
    process.exit(1);
  }
  const problemas = problemasDaSaidaDoBuild(build.saida);
  if (problemas.length > 0) {
    for (const p of problemas) console.error(`BUILD: ${p}`);
    console.error('FALHA: o build tem aviso ou falha na saída (AC1).');
    process.exit(1);
  }
  const falhas = await verificarServidor(raiz);
  if (falhas.length > 0) {
    for (const f of falhas) console.error(`SERVIDOR: ${f}`);
    process.exit(1);
  }
  console.log('Build limpo sem variáveis; /login 200, /api/caixa 401, páginas protegidas 307 e cabeçalhos de segurança conferidos; servidor encerrado.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
