import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zerarBau } from '@/server/bau/zerar';
import { resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { DONO, GERENTE, USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import { falharCommitDaOperacao } from './commit-falho';

const MEMBROS: ItensBau = { medicamentos: { analgesico: 10, gaze: 2 }, armas: { desert: 1 } };
const GERENCIA: ItensBau = { armas: { usp: 4 } };

let fake: FakeFirestore;
function abrir(membros: ItensBau = MEMBROS, gerencia: ItensBau = GERENCIA) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros, gerencia, versao: 3 }) });
  setDb(comoDb(fake));
}
beforeEach(() => abrir());
afterEach(() => {
  resetDb();
  resetSemente();
});

const bau = (t: string) => fake.dump()[`baus/${t}`] as { versao: number; itens: ItensBau };
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-038 zerarBau', () => {
  it('AC1: "membros" não altera a gerência', async () => {
    const r = await zerarBau('membros', DONO);
    expect(r).toMatchObject({ alvos: ['membros'], itens: 3, unidades: 13 });
    expect(bau('membros')).toMatchObject({ itens: {}, versao: 4 });
    expect(bau('gerencia')).toMatchObject({ itens: GERENCIA, versao: 3 });
    expect(auditorias(fake.dump())).toHaveLength(1);
  });

  it('AC1: "gerencia" não altera os membros', async () => {
    const r = await zerarBau('gerencia', DONO);
    expect(r).toMatchObject({ alvos: ['gerencia'], itens: 1, unidades: 4 });
    expect(bau('gerencia')).toMatchObject({ itens: {}, versao: 4 });
    expect(bau('membros')).toMatchObject({ itens: MEMBROS, versao: 3 });
  });

  it('AC1: "ambos" zera os dois numa única transação com uma única auditoria', async () => {
    const r = await zerarBau('ambos', DONO);
    expect(r).toMatchObject({ alvos: ['membros', 'gerencia', 'casa'], itens: 4, unidades: 17 });
    expect(bau('membros').itens).toEqual({});
    expect(bau('gerencia').itens).toEqual({});
    expect(auditorias(fake.dump())).toHaveLength(1);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
  });

  it('AC2: a auditoria guarda antes (item→quantidade por baú zerado) e depois vazio', async () => {
    const r = await zerarBau('ambos', DONO);
    const a = fake.dump()[`auditoria/${r.auditoriaId}`];
    expect(a).toMatchObject({
      acao: 'bau.zerar',
      usuario: { id: DONO.id, nome: DONO.nome },
      alvo: { alvos: ['membros', 'gerencia', 'casa'] },
      antes: { membros: MEMBROS, gerencia: GERENCIA, casa: {} },
      depois: {},
    });
    await zerarBau('membros', DONO);
    expect(auditorias(fake.dump()).find((x) => (x.alvo as { alvos: string[] }).alvos.length === 1)!.antes).toEqual({ membros: {} });
  });

  it('AC3: falha de commit → dump idêntico e zero auditorias', async () => {
    const antes = fake.dump();
    const provar = await falharCommitDaOperacao(fake, new Error('falha'));
    await expect(zerarBau('ambos', DONO)).rejects.toThrow();
    provar();
    expect(fake.dump()).toEqual(antes);
    expect(auditorias(fake.dump())).toHaveLength(0);
  });

  it('AC3: falha na escrita do segundo baú desfaz tudo', async () => {
    const antes = fake.dump();
    fake.falharEm('set', /^baus\/gerencia$/, new Error('falha'));
    await expect(zerarBau('ambos', DONO)).rejects.toThrow();
    expect(fake.dump()).toEqual(antes);
  });

  it('AC4: alvo inválido → 400 sem escrita', async () => {
    for (const alvo of ['todos', '', undefined, null, 5, ['membros'], 'Membros', 'membros ']) {
      const e = await recusa(zerarBau(alvo, DONO));
      expect([e.status, e.codigo], String(alvo)).toEqual([400, 'VALIDACAO']);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC5: a versão dos baús zerados sobe 1', async () => {
    await zerarBau('ambos', DONO);
    expect(bau('membros').versao).toBe(4);
    expect(bau('gerencia').versao).toBe(4);
  });

  it('AC6/ADR-16: baú já vazio é válido; auditoria com antes vazio', async () => {
    abrir({}, {});
    const r = await zerarBau('membros', DONO);
    expect(r).toMatchObject({ itens: 0, unidades: 0 });
    expect(auditorias(fake.dump())[0]).toMatchObject({ antes: { membros: {} }, depois: {} });
    expect(bau('membros').versao).toBe(4);
  });

  it('AC7: cria um log "zerar" por baú alvo, ligado à auditoria', async () => {
    const r = await zerarBau('ambos', DONO);
    for (const t of ['membros', 'gerencia']) {
      const logs = logsDe(fake.dump(), t);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ acao: 'zerar', auditoriaId: r.auditoriaId, categoriaId: null, usuario: { id: DONO.id } });
    }
    fake.chamadas.length = 0;
    await zerarBau('membros', DONO);
    expect(logsDe(fake.dump(), 'gerencia')).toHaveLength(1);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(2);
  });

  it('função exclusiva do dono: gerência e nível 1 → SEM_PERMISSAO; sem usuário → erro; nada gravado', async () => {
    expect((await recusa(zerarBau('ambos', GERENTE))).codigo).toBe('SEM_PERMISSAO');
    expect((await recusa(zerarBau('ambos', { ...USUARIO, nivel: 1 } as never))).codigo).toBe('SEM_PERMISSAO');
    expect((await recusa(zerarBau('ambos', USUARIO as never))).codigo).toBe('SEM_PERMISSAO');
    expect((await recusa(zerarBau('ambos', undefined as never))).codigo).toBe('INTERNO');
    expect(escritas()).toEqual([]);
  });

  it('dois zerar simultâneos: o segundo vê o baú vazio, sem duplicar o conteúdo na auditoria', async () => {
    const [a, b] = await Promise.all([zerarBau('membros', DONO), zerarBau('membros', DONO)]);
    expect([a.unidades, b.unidades].sort((x, y) => x - y)).toEqual([0, 13]);
    const lista = auditorias(fake.dump());
    expect(lista).toHaveLength(2);
    expect(lista.filter((x) => JSON.stringify(x.antes) !== JSON.stringify({ membros: {} }))).toHaveLength(1);
    expect(bau('membros').versao).toBe(5);
  });
});
