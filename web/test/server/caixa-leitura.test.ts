import { afterEach, describe, expect, it } from 'vitest';
import { lerHistoricoCaixa, lerSaldo } from '@/server/caixa/leitura';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { lerPaginacao } from '@/server/paginacao';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';

let fake: FakeFirestore;
const abrir = (seed: Record<string, Dados> = {}) => {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
};
afterEach(() => resetDb());

const entrada = (i: number, extra: Dados = {}): Dados => ({
  acao: i % 2 ? 'saida' : 'entrada',
  tipo: i % 3 ? 'sujo' : 'limpo',
  valor: i * 10,
  anotacao: `nota ${i}`,
  saldoResultante: i * 100,
  usuario: { id: `u${i}`, nome: `Nome ${i}` },
  data: new Date(Date.UTC(2026, 10, 5, 12, i)).toISOString(),
  ...extra,
});
const seedHistorico = (n: number): Record<string, Dados> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [`logs/caixa/entradas/id${String(k + 1).padStart(3, '0')}`, entrada(k + 1)]));

const pag = (limite = 20, cursor: string | null = null) => ({ limite, cursor });

describe('WEB-032 lerSaldo', () => {
  it('AC1: documento inexistente → 0 e 0, sem escrever', async () => {
    abrir();
    expect(await lerSaldo()).toEqual({ sujo: 0, limpo: 0 });
    expect(fake.chamadas.filter((c) => c.op !== 'get')).toEqual([]);
  });

  it('AC1: campo ausente, inválido ou negativo vira 0; o outro campo é preservado', async () => {
    abrir({ 'caixa/saldo': { sujo: 150, versao: 1 } });
    expect(await lerSaldo()).toEqual({ sujo: 150, limpo: 0 });
    resetDb();
    abrir({ 'caixa/saldo': { sujo: 'x', limpo: -5 } });
    expect(await lerSaldo()).toEqual({ sujo: 0, limpo: 0 });
  });

  it('devolve só sujo e limpo', async () => {
    abrir(seedBase({ saldo: { sujo: 10, limpo: 20 } }));
    expect(await lerSaldo()).toEqual({ sujo: 10, limpo: 20 });
  });
});

describe('WEB-032 lerHistoricoCaixa', () => {
  it('histórico vazio → página vazia sem cursor', async () => {
    abrir();
    expect(await lerHistoricoCaixa(pag())).toEqual({ itens: [], proximoCursor: null });
  });

  it('AC2: ordenado do mais novo para o mais antigo e paginado por cursor sem repetir nem perder entradas', async () => {
    abrir(seedHistorico(7));
    const p1 = await lerHistoricoCaixa(pag(3));
    expect(p1.itens.map((i) => i.id)).toEqual(['id007', 'id006', 'id005']);
    expect(p1.proximoCursor).toBe('id005');
    const p2 = await lerHistoricoCaixa(pag(3, p1.proximoCursor));
    expect(p2.itens.map((i) => i.id)).toEqual(['id004', 'id003', 'id002']);
    const p3 = await lerHistoricoCaixa(pag(3, p2.proximoCursor));
    expect(p3.itens.map((i) => i.id)).toEqual(['id001']);
    expect(p3.proximoCursor).toBeNull();
  });

  it('página exata não promete próxima página', async () => {
    abrir(seedHistorico(3));
    const p = await lerHistoricoCaixa(pag(3));
    expect(p.itens).toHaveLength(3);
    expect(p.proximoCursor).toBeNull();
  });

  it('AC2: limite acima de 100 ou inválido é recusado (400), padrão é 20', () => {
    expect(lerPaginacao(new URLSearchParams()).limite).toBe(20);
    expect(lerPaginacao(new URLSearchParams('limite=100')).limite).toBe(100);
    for (const l of ['101', '0', '-1', 'abc', '', '1.5', '10abc', '1e2']) {
      const e = (() => {
        try {
          lerPaginacao(new URLSearchParams({ limite: l }));
          return null;
        } catch (x) {
          return x as ErroApp;
        }
      })();
      expect(e, `limite=${l}`).toBeInstanceOf(ErroApp);
      expect(e!.status).toBe(400);
    }
  });

  it('cursor inexistente no banco → 400', async () => {
    abrir(seedHistorico(2));
    const e = await lerHistoricoCaixa(pag(5, 'naoexiste')).then(() => null, (x: unknown) => x as ErroApp);
    expect(e).toBeInstanceOf(ErroApp);
    expect(e!.status).toBe(400);
  });

  it('AC3: cada entrada traz usuário, tipo, ação, valor, anotação, saldo resultante e data ISO (e nenhum campo a mais)', async () => {
    abrir({ 'logs/caixa/entradas/a1': entrada(2, { campoInterno: 'segredo' }) });
    const [item] = (await lerHistoricoCaixa(pag())).itens;
    expect(item).toEqual({
      id: 'a1',
      acao: 'entrada',
      tipo: 'sujo',
      valor: 20,
      anotacao: 'nota 2',
      saldoResultante: 200,
      usuario: { id: 'u2', nome: 'Nome 2' },
      data: '2026-11-05T12:02:00.000Z',
    });
  });

  it('não mistura logs dos baús', async () => {
    abrir({ ...seedHistorico(1), 'logs/membros/entradas/zz': entrada(9) });
    expect((await lerHistoricoCaixa(pag())).itens.map((i) => i.id)).toEqual(['id001']);
  });
});
