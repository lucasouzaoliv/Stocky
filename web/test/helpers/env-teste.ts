import { resetEnv } from '@/server/env';

const CHAVE_FALSA = ['-----BEGIN ', 'PRIVATE KEY-----', '\\nFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE\\n', '-----END ', 'PRIVATE KEY-----\\n'].join('');

export const SEGREDOS_TESTE = Object.freeze({
  FIREBASE_PRIVATE_KEY: CHAVE_FALSA,
  DISCORD_CLIENT_SECRET: 'segredo-falso-discord-cliente-0001',
  SESSION_SECRET: 'segredo-falso-de-sessao-com-mais-de-32-caracteres',
  WEBHOOK_LOG_MEMBROS: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-log-membros',
});

export const ENV_TESTE: Readonly<Record<string, string>> = Object.freeze({
  FIREBASE_PROJECT_ID: 'projeto-falso-teste',
  FIREBASE_CLIENT_EMAIL: 'teste@exemplo.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: SEGREDOS_TESTE.FIREBASE_PRIVATE_KEY,
  DISCORD_CLIENT_ID: '111111111111111111',
  DISCORD_CLIENT_SECRET: SEGREDOS_TESTE.DISCORD_CLIENT_SECRET,
  DISCORD_GUILD_ID: '222222222222222222',
  DISCORD_ROLE_MEMBRO: '333333333333333331, 333333333333333332',
  DISCORD_ROLE_GERENTE: '333333333333333333',
  DISCORD_ROLE_DONO: '333333333333333334',
  SESSION_SECRET: SEGREDOS_TESTE.SESSION_SECRET,
  APP_URL: 'https://stocky-teste.vercel.app',
  WEBHOOK_LOG_MEMBROS: SEGREDOS_TESTE.WEBHOOK_LOG_MEMBROS,
  WEBHOOK_LOG_GERENCIA: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-log-gerencia',
  WEBHOOK_LOG_CAIXA: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-log-caixa',
  WEBHOOK_INVENTARIO_MEMBROS: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-inv-membros',
  WEBHOOK_INVENTARIO_GERENCIA: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-inv-gerencia',
  WEBHOOK_SALDO_CAIXA: 'https://discord.com/api/webhooks/111111111111111111/troque-aqui-saldo',
});

const NOMES = Object.keys(ENV_TESTE);
const NODE_ENV_ORIGINAL = process.env.NODE_ENV;

export function aplicarEnvTeste(sobrescrever: Record<string, string | undefined> = {}): void {
  limparEnvTeste();
  const env = process.env as Record<string, string | undefined>;
  for (const [k, v] of Object.entries({ ...ENV_TESTE, ...sobrescrever })) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  resetEnv();
}

export function limparEnvTeste(): void {
  const env = process.env as Record<string, string | undefined>;
  for (const nome of NOMES) delete env[nome];
  if (NODE_ENV_ORIGINAL === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = NODE_ENV_ORIGINAL;
  resetEnv();
}
