import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErroConfiguracao, getEnv, resetEnv, valoresSecretos } from '@/server/env';
import { RAIZ_WEB, ler, listar } from '../helpers/arquivos';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste, SEGREDOS_TESTE } from '../helpers/env-teste';

const OBRIGATORIAS = [
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'SESSION_SECRET', 'APP_URL',
  'WEBHOOK_LOG_MEMBROS', 'WEBHOOK_LOG_GERENCIA', 'WEBHOOK_LOG_CAIXA',
  'WEBHOOK_INVENTARIO_MEMBROS', 'WEBHOOK_INVENTARIO_GERENCIA', 'WEBHOOK_SALDO_CAIXA',
];

function mensagemDeErro(): string {
  try {
    getEnv();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroConfiguracao);
    return (e as Error).message;
  }
  throw new Error('getEnv deveria lançar');
}

beforeEach(() => aplicarEnvTeste());
afterEach(() => limparEnvTeste());

describe('WEB-005 getEnv', () => {
  it('AC1: devolve o objeto tipado com os valores', () => {
    const env = getEnv();
    expect(env.appUrl).toBe('https://stocky-teste.vercel.app');
    expect(env.sessionSecret).toBe(ENV_TESTE.SESSION_SECRET);
    expect(env.firebase.projectId).toBe('projeto-falso-teste');
    expect(env.firebase.clientEmail).toBe('teste@exemplo.iam.gserviceaccount.com');
    expect(env.discord).toMatchObject({ clientId: '111111111111111111', guildId: '222222222222222222' });
    expect(env.discord.clientSecret).toBe(SEGREDOS_TESTE.DISCORD_CLIENT_SECRET);
    expect(env.webhooks.logMembros).toBe(SEGREDOS_TESTE.WEBHOOK_LOG_MEMBROS);
    expect(Object.keys(env.webhooks).sort()).toEqual(
      ['inventarioGerencia', 'inventarioMembros', 'logCaixa', 'logGerencia', 'logMembros', 'saldoCaixa'],
    );
    expect(env.producao).toBe(false);
  });

  it('memoriza o resultado até resetEnv e lê process.env sob demanda', () => {
    const a = getEnv();
    process.env.APP_URL = 'https://outra.vercel.app';
    expect(getEnv()).toBe(a);
    resetEnv();
    expect(getEnv().appUrl).toBe('https://outra.vercel.app');
  });

  it.each(OBRIGATORIAS)('AC2: %s ausente ou só espaços lança citando o nome', (nome) => {
    for (const valor of [undefined, '   ']) {
      aplicarEnvTeste({ [nome]: valor });
      const msg = mensagemDeErro();
      expect(msg).toContain(nome);
    }
  });

  it('AC2: a mensagem lista TODAS as variáveis ruins e nunca valores', () => {
    aplicarEnvTeste({ FIREBASE_PROJECT_ID: undefined, DISCORD_CLIENT_ID: 'abc', SESSION_SECRET: 'curto' });
    const msg = mensagemDeErro();
    for (const nome of ['FIREBASE_PROJECT_ID', 'DISCORD_CLIENT_ID', 'SESSION_SECRET']) expect(msg).toContain(nome);
    for (const valor of [...Object.values(SEGREDOS_TESTE), 'abc', 'curto', ENV_TESTE.FIREBASE_CLIENT_EMAIL as string]) {
      expect(msg).not.toContain(valor);
    }
    expect(msg).not.toContain('FIREBASE_CLIENT_EMAIL');
  });

  it('erro de configuração não é memorizado: corrigir a env funciona', () => {
    aplicarEnvTeste({ SESSION_SECRET: undefined });
    expect(() => getEnv()).toThrow(ErroConfiguracao);
    process.env.SESSION_SECRET = ENV_TESTE.SESSION_SECRET as string;
    expect(getEnv().sessionSecret).toBe(ENV_TESTE.SESSION_SECRET);
  });

  it('AC3: SESSION_SECRET com 31 caracteres é recusado, 32 aceito', () => {
    aplicarEnvTeste({ SESSION_SECRET: 'x'.repeat(31) });
    expect(mensagemDeErro()).toContain('SESSION_SECRET');
    aplicarEnvTeste({ SESSION_SECRET: 'x'.repeat(32) });
    expect(getEnv().sessionSecret).toHaveLength(32);
  });

  it.each([
    ['http://exemplo.com', false],
    ['ftp://x.vercel.app', false],
    ['javascript:alert(1)', false],
    ['nao-e-url', false],
    ['https://x.vercel.app/caminho', false],
    ['https://x.vercel.app?a=1', false],
    ['https://user:senha@x.vercel.app', false],
    ['http://localhost:3000', true],
    ['http://localhost', true],
    ['https://x.vercel.app/', true],
  ])('AC3: APP_URL %s (fora de produção) válido=%s', (url, valido) => {
    aplicarEnvTeste({ APP_URL: url });
    if (valido) expect(getEnv().appUrl).toBe(url.replace(/\/$/, ''));
    else expect(mensagemDeErro()).toContain('APP_URL');
  });

  it('AC3: http://localhost é recusado em produção; https segue válido', () => {
    aplicarEnvTeste({ NODE_ENV: 'production', APP_URL: 'http://localhost:3000' });
    expect(mensagemDeErro()).toContain('APP_URL');
    aplicarEnvTeste({ NODE_ENV: 'production' });
    expect(getEnv().producao).toBe(true);
  });

  it('AC4: \\n literal da chave vira quebra de linha', () => {
    const chave = getEnv().firebase.privateKey;
    expect(chave).not.toContain('\\n');
    expect(chave.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('AC4: chave sem o cabeçalho de chave privada é recusada; aspas ao redor são toleradas', () => {
    aplicarEnvTeste({ FIREBASE_PRIVATE_KEY: 'troque-aqui' });
    expect(mensagemDeErro()).toContain('FIREBASE_PRIVATE_KEY');
    aplicarEnvTeste({ FIREBASE_PRIVATE_KEY: `"${SEGREDOS_TESTE.FIREBASE_PRIVATE_KEY}"` });
    expect(getEnv().firebase.privateKey.startsWith('-----')).toBe(true);
  });

  it('FIREBASE_CLIENT_EMAIL sem @ é recusado', () => {
    aplicarEnvTeste({ FIREBASE_CLIENT_EMAIL: 'sem-arroba' });
    expect(mensagemDeErro()).toContain('FIREBASE_CLIENT_EMAIL');
  });

  it.each([
    'http://discord.com/api/webhooks/1/abc',
    'https://exemplo.com/api/webhooks/1/abc',
    'https://discord.com.evil.com/api/webhooks/1/abc',
    'https://discord.com/api/webhooks/abc/abc',
    'https://discord.com/api/webhooks/1/abc/extra',
    'https://discord.com/api/webhooks/1/',
    'troque-aqui',
  ])('AC5: webhook fora do padrão é recusado: %s', (url) => {
    aplicarEnvTeste({ WEBHOOK_SALDO_CAIXA: url });
    const msg = mensagemDeErro();
    expect(msg).toContain('WEBHOOK_SALDO_CAIXA');
    expect(msg).not.toContain(url);
  });

  it('AC5: aceita discord.com e discordapp.com', () => {
    aplicarEnvTeste({ WEBHOOK_LOG_CAIXA: 'https://discordapp.com/api/webhooks/123/abc_DEF-9' });
    expect(getEnv().webhooks.logCaixa).toBe('https://discordapp.com/api/webhooks/123/abc_DEF-9');
  });

  it('snowflake: ids com tamanho errado ou letras são recusados', () => {
    for (const v of ['1234567890123456', '123456789012345678901', '12345678901234567a']) {
      aplicarEnvTeste({ DISCORD_GUILD_ID: v });
      expect(mensagemDeErro()).toContain('DISCORD_GUILD_ID');
    }
  });
});

describe('WEB-005 cargos em lista', () => {
  it('lista separada por vírgula com espaços e itens vazios', () => {
    aplicarEnvTeste({ DISCORD_ROLE_GERENTE: ' 444444444444444441 ,, 444444444444444442 ,' });
    expect(getEnv().discord.cargos.gerente).toEqual(['444444444444444441', '444444444444444442']);
    expect(getEnv().discord.cargos.membro).toEqual(['333333333333333331', '333333333333333332']);
  });

  it('um nível pode ficar vazio se houver ao menos um cargo no total', () => {
    aplicarEnvTeste({ DISCORD_ROLE_MEMBRO: '', DISCORD_ROLE_GERENTE: undefined });
    expect(getEnv().discord.cargos).toMatchObject({ membro: [], gerente: [], dono: ['333333333333333334'] });
  });

  it('nenhum cargo em nenhum nível é recusado', () => {
    aplicarEnvTeste({ DISCORD_ROLE_MEMBRO: ' ', DISCORD_ROLE_GERENTE: ',', DISCORD_ROLE_DONO: undefined });
    const msg = mensagemDeErro();
    for (const n of ['DISCORD_ROLE_MEMBRO', 'DISCORD_ROLE_GERENTE', 'DISCORD_ROLE_DONO']) expect(msg).toContain(n);
  });

  it('item que não é snowflake invalida a variável', () => {
    aplicarEnvTeste({ DISCORD_ROLE_DONO: '333333333333333334,abc' });
    expect(mensagemDeErro()).toContain('DISCORD_ROLE_DONO');
  });

  it('as listas são imutáveis', () => {
    expect(Object.isFrozen(getEnv().discord.cargos.membro)).toBe(true);
    expect(Object.isFrozen(getEnv().webhooks)).toBe(true);
  });
});

describe('WEB-005 valoresSecretos', () => {
  it('traz os segredos, a chave convertida e as linhas do corpo da chave', () => {
    const v = valoresSecretos();
    expect(v).toContain(SEGREDOS_TESTE.DISCORD_CLIENT_SECRET);
    expect(v).toContain(SEGREDOS_TESTE.SESSION_SECRET);
    expect(v).toContain(SEGREDOS_TESTE.WEBHOOK_LOG_MEMBROS);
    expect(v).toContain('FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE');
    expect(v).not.toContain('https://stocky-teste.vercel.app');
  });

  it('não lança com a env inválida ou vazia', () => {
    limparEnvTeste();
    expect(valoresSecretos()).toEqual([]);
    aplicarEnvTeste({ SESSION_SECRET: 'curto-demais-mas-presente', APP_URL: 'lixo' });
    expect(valoresSecretos()).toContain('curto-demais-mas-presente');
  });

  it('ignora valores muito curtos para não mascarar o log inteiro', () => {
    aplicarEnvTeste({ DISCORD_CLIENT_SECRET: 'a' });
    expect(valoresSecretos()).not.toContain('a');
  });
});

describe('WEB-005 AC6: server-only e isolamento do cliente', () => {
  it('env.ts importa server-only', () => {
    expect(ler(join(RAIZ_WEB, 'src/server/env.ts'))).toMatch(/^import 'server-only';/m);
  });

  it('todo arquivo de src/server importa server-only (exceto cabecalhos.ts, usado pelo proxy)', () => {
    for (const f of listar(join(RAIZ_WEB, 'src/server'), /\.ts$/).filter((x) => !x.endsWith('seguranca/cabecalhos.ts'))) {
      expect(ler(f), f).toMatch(/^import 'server-only';/m);
    }
  });

  it('nenhum components/** nem arquivo "use client" importa @/server', () => {
    const candidatos = [
      ...listar(join(RAIZ_WEB, 'src/components'), /\.(ts|tsx)$/),
      ...listar(join(RAIZ_WEB, 'src/app'), /\.(ts|tsx)$/),
      ...listar(join(RAIZ_WEB, 'src/compartilhado'), /\.(ts|tsx)$/),
    ];
    for (const f of candidatos) {
      const texto = ler(f);
      const cliente = f.includes('/components/') || f.includes('/compartilhado/') || /^\s*['"]use client['"]/m.test(texto);
      if (cliente) expect(texto, f).not.toMatch(/from\s+['"](@\/server|server-only)|firebase-admin|(['"])\.\.?\/.*server\//);
    }
  });
});
