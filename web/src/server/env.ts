import 'server-only';

export type CanalWebhook =
  | 'logMembros'
  | 'logGerencia'
  | 'logCaixa'
  | 'inventarioMembros'
  | 'inventarioGerencia'
  | 'saldoCaixa';

export interface Env {
  producao: boolean;
  appUrl: string;
  sessionSecret: string;
  firebase: { projectId: string; clientEmail: string; privateKey: string };
  discord: {
    clientId: string;
    clientSecret: string;
    guildId: string;
    cargos: { membro: readonly string[]; gerente: readonly string[]; dono: readonly string[] };
  };
  webhooks: Readonly<Record<CanalWebhook, string>>;
}

export class ErroConfiguracao extends Error {
  constructor(readonly variaveis: readonly string[]) {
    super(`Configuração inválida. Variáveis ausentes ou inválidas: ${variaveis.join(', ')}.`);
    this.name = 'ErroConfiguracao';
  }
}

const WEBHOOKS: ReadonlyArray<readonly [CanalWebhook, string]> = [
  ['logMembros', 'WEBHOOK_LOG_MEMBROS'],
  ['logGerencia', 'WEBHOOK_LOG_GERENCIA'],
  ['logCaixa', 'WEBHOOK_LOG_CAIXA'],
  ['inventarioMembros', 'WEBHOOK_INVENTARIO_MEMBROS'],
  ['inventarioGerencia', 'WEBHOOK_INVENTARIO_GERENCIA'],
  ['saldoCaixa', 'WEBHOOK_SALDO_CAIXA'],
];

const SEGREDOS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DISCORD_CLIENT_SECRET',
  'SESSION_SECRET',
  ...WEBHOOKS.map(([, nome]) => nome),
];

const SNOWFLAKE = /^\d{17,20}$/;
const WEBHOOK = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;
const MARCA_CHAVE = ['BEGIN', 'PRIVATE', 'KEY'].join(' ');
const TAMANHO_MIN_SEGREDO = 4;

let memo: Env | null = null;

function ler(nome: string): string {
  return (process.env[nome] ?? '').trim();
}

function converterChave(bruta: string): string {
  const semAspas = bruta.replace(/^"(.*)"$/s, '$1');
  return semAspas.replace(/\\n/g, '\n');
}

function lerLista(nome: string, invalidas: string[]): string[] {
  const itens = ler(nome)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (itens.some((x) => !SNOWFLAKE.test(x))) invalidas.push(nome);
  return itens;
}

function lerAppUrl(producao: boolean): string | null {
  const bruto = ler('APP_URL');
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  if (url.protocol === 'https:') return url.origin;
  if (!producao && url.protocol === 'http:' && url.hostname === 'localhost') return url.origin;
  return null;
}

function montar(): Env {
  const invalidas: string[] = [];
  const producao = process.env.NODE_ENV === 'production';

  const obrigatoria = (nome: string, valida: (v: string) => boolean = () => true): string => {
    const v = ler(nome);
    if (!v || !valida(v)) invalidas.push(nome);
    return v;
  };

  const projectId = obrigatoria('FIREBASE_PROJECT_ID');
  const clientEmail = obrigatoria('FIREBASE_CLIENT_EMAIL', (v) => v.includes('@'));
  const privateKey = converterChave(obrigatoria('FIREBASE_PRIVATE_KEY', (v) => converterChave(v).includes(MARCA_CHAVE)));
  const clientId = obrigatoria('DISCORD_CLIENT_ID', (v) => SNOWFLAKE.test(v));
  const clientSecret = obrigatoria('DISCORD_CLIENT_SECRET');
  const guildId = obrigatoria('DISCORD_GUILD_ID', (v) => SNOWFLAKE.test(v));
  const sessionSecret = obrigatoria('SESSION_SECRET', (v) => v.length >= 32);

  const appUrl = lerAppUrl(producao);
  if (appUrl === null) invalidas.push('APP_URL');

  const cargos = {
    membro: lerLista('DISCORD_ROLE_MEMBRO', invalidas),
    gerente: lerLista('DISCORD_ROLE_GERENTE', invalidas),
    dono: lerLista('DISCORD_ROLE_DONO', invalidas),
  };
  if (cargos.membro.length + cargos.gerente.length + cargos.dono.length === 0) {
    invalidas.push('DISCORD_ROLE_MEMBRO', 'DISCORD_ROLE_GERENTE', 'DISCORD_ROLE_DONO');
  }

  const webhooks = {} as Record<CanalWebhook, string>;
  for (const [canal, nome] of WEBHOOKS) webhooks[canal] = obrigatoria(nome, (v) => WEBHOOK.test(v));

  const unicas = [...new Set(invalidas)];
  if (unicas.length > 0 || appUrl === null) throw new ErroConfiguracao(unicas);

  return {
    producao,
    appUrl,
    sessionSecret,
    firebase: { projectId, clientEmail, privateKey },
    discord: {
      clientId,
      clientSecret,
      guildId,
      cargos: {
        membro: Object.freeze(cargos.membro),
        gerente: Object.freeze(cargos.gerente),
        dono: Object.freeze(cargos.dono),
      },
    },
    webhooks: Object.freeze(webhooks),
  };
}

export function getEnv(): Env {
  if (memo === null) memo = montar();
  return memo;
}

export function resetEnv(): void {
  memo = null;
}

export function valoresSecretos(): string[] {
  const valores = new Set<string>();
  const adicionar = (v: string) => {
    if (v.length >= TAMANHO_MIN_SEGREDO) valores.add(v);
  };
  for (const nome of SEGREDOS) {
    const bruto = ler(nome);
    adicionar(bruto);
    if (nome === 'FIREBASE_PRIVATE_KEY') {
      const chave = converterChave(bruto);
      adicionar(chave);
      for (const linha of chave.split('\n')) {
        if (linha.length >= 20 && !linha.startsWith('-----')) adicionar(linha.trim());
      }
    }
  }
  return [...valores].sort((a, b) => b.length - a.length);
}
