import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIZ_WEB, ler, lerJson, listar } from '../helpers/arquivos';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore } from '../helpers/fake-firestore';

const initializeApp = vi.fn((opcoes: unknown) => ({ opcoes }));
const getApps = vi.fn((): unknown[] => []);
const getApp = vi.fn(() => ({ existente: true }));
const cert = vi.fn((c: unknown) => ({ cert: c }));
const getFirestore = vi.fn((app: unknown) => ({ firestoreDe: app }));

vi.mock('firebase-admin/app', () => ({
  initializeApp: (o: unknown) => initializeApp(o),
  getApps: () => getApps(),
  getApp: () => getApp(),
  cert: (c: unknown) => cert(c),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: (a: unknown) => getFirestore(a) }));

const carregar = async () => await import('@/server/firebase');

beforeEach(async () => {
  vi.clearAllMocks();
  getApps.mockReturnValue([]);
  aplicarEnvTeste();
  (await carregar()).resetDb();
});

afterEach(async () => {
  (await carregar()).resetDb();
  limparEnvTeste();
});

describe('WEB-010 getDb', () => {
  it('AC1: com setDb(fake), getDb devolve o fake e não toca no firebase-admin', async () => {
    const { getDb, setDb } = await carregar();
    const fake = comoDb(criarFakeFirestore());
    setDb(fake);
    expect(getDb()).toBe(fake);
    expect(getDb()).toBe(fake);
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getFirestore).not.toHaveBeenCalled();
    expect(cert).not.toHaveBeenCalled();
  });

  it('AC1: com setDb(fake), nem a env é lida (funciona sem variáveis)', async () => {
    limparEnvTeste();
    const { getDb, setDb } = await carregar();
    const fake = comoDb(criarFakeFirestore());
    setDb(fake);
    expect(getDb()).toBe(fake);
  });

  it('AC2: sem variáveis, getDb falha antes de initializeApp', async () => {
    limparEnvTeste();
    const { getDb } = await carregar();
    expect(() => getDb()).toThrow(/FIREBASE_PROJECT_ID/);
    expect(initializeApp).not.toHaveBeenCalled();
    expect(cert).not.toHaveBeenCalled();
  });

  it('AC2: env inválida também falha antes de initializeApp, sem vazar valores', async () => {
    aplicarEnvTeste({ SESSION_SECRET: 'curto' });
    const { getDb } = await carregar();
    expect(() => getDb()).toThrow(/SESSION_SECRET/);
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('inicializa com as credenciais da env (chave com quebra de linha real)', async () => {
    const { getDb } = await carregar();
    getDb();
    expect(cert).toHaveBeenCalledTimes(1);
    const arg = cert.mock.calls[0]?.[0] as { projectId: string; clientEmail: string; privateKey: string };
    expect(arg.projectId).toBe(ENV_TESTE.FIREBASE_PROJECT_ID);
    expect(arg.clientEmail).toBe(ENV_TESTE.FIREBASE_CLIENT_EMAIL);
    expect(arg.privateKey).toContain('\n');
    expect(arg.privateKey).not.toContain('\\n');
  });

  it('AC3: initializeApp é chamado no máximo uma vez em chamadas repetidas', async () => {
    const { getDb } = await carregar();
    const a = getDb();
    const b = getDb();
    const c = getDb();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledTimes(1);
  });

  it('AC3: reaproveita um app já existente em vez de inicializar de novo', async () => {
    getApps.mockReturnValue([{}]);
    const { getDb } = await carregar();
    getDb();
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getApp).toHaveBeenCalledTimes(1);
  });

  it('resetDb descarta o injetado e a instância memorizada', async () => {
    const { getDb, setDb, resetDb } = await carregar();
    const fake = comoDb(criarFakeFirestore());
    setDb(fake);
    resetDb();
    expect(getDb()).not.toBe(fake);
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
});

describe('WEB-010 estático', () => {
  const pacote = lerJson<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>(
    join(RAIZ_WEB, 'package.json'),
  );

  it('AC4: depende de firebase-admin (versão exata) e nunca do SDK cliente firebase', () => {
    const todas = { ...pacote.dependencies, ...pacote.devDependencies };
    expect(Object.keys(pacote.dependencies)).toContain('firebase-admin');
    expect(todas['firebase-admin']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(todas)).not.toContain('firebase');
    expect(Object.keys(todas).filter((n) => n.startsWith('@firebase/') && n !== '@firebase/rules-unit-testing')).toEqual([]);
  });

  it('firebase.ts importa server-only', () => {
    expect(ler(join(RAIZ_WEB, 'src/server/firebase.ts'))).toMatch(/^import 'server-only';/m);
  });

  it('AC5: firebase-admin só é importado por server/firebase.ts', () => {
    const arquivos = listar(join(RAIZ_WEB, 'src'), /\.(ts|tsx|mjs|js)$/);
    const importam = arquivos.filter((f) => /['"]firebase-admin(\/[\w-]+)?['"]/.test(ler(f)));
    expect(importam.map((f) => f.slice(RAIZ_WEB.length + 1))).toEqual(['src/server/firebase.ts']);
  });

  it('AC5: components, "use client" e páginas fora de api não importam firebase-admin nem @/server/firebase', () => {
    const arquivos = [
      ...listar(join(RAIZ_WEB, 'src/components'), /\.(ts|tsx)$/),
      ...listar(join(RAIZ_WEB, 'src/app'), /\.(ts|tsx)$/).filter((f) => !f.includes('/app/api/')),
      ...listar(join(RAIZ_WEB, 'src/compartilhado'), /\.(ts|tsx)$/),
    ];
    for (const f of arquivos) {
      expect(ler(f), f).not.toMatch(/firebase-admin|@\/server\/firebase|\/server\/firebase['"]/);
    }
  });
});
