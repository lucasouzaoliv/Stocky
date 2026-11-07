import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRECO, calcularVenda, precoUnitario } from '@/compartilhado/drogas';
import { resetSemente } from '@/server/catalogo/semente';
import { depositarVenda, lerDados, lerEstadoDroga, listarPendencias, movimentarDroga } from '@/server/drogas/operacoes';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';

let fake: FakeFirestore;
const ana = { id: '10', nome: 'Ana' };
const bia = { id: '11', nome: 'Bia' };

function abrir(estoque = 500) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros: { drogas: { saco_de_meta: estoque } }, versao: 3 }) });
  setDb(comoDb(fake));
}
beforeEach(() => abrir());
afterEach(() => {
  resetDb();
  resetSemente();
});

const pedido = (extra: Record<string, unknown> = {}) => ({ tipo: 'membros', acao: 'retirar', quantidade: 10, motivo: 'pista', comprador: 'Fulano', ...extra });
async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('preço da venda', () => {
  it('parceria 200, pista 230 e pista acima de 300 a 215 (todas as unidades)', () => {
    expect(precoUnitario('parceria', 1000)).toBe(PRECO.parceria);
    expect(precoUnitario('pista', 300)).toBe(230);
    expect(precoUnitario('pista', 301)).toBe(215);
    expect(calcularVenda('pista', 10)).toEqual({ unitario: 230, total: 2300, atacado: false });
    expect(calcularVenda('pista', 400)).toEqual({ unitario: 215, total: 86000, atacado: true });
    expect(calcularVenda('parceria', 5).total).toBe(1000);
    expect(calcularVenda('outro', 5).total).toBe(0);
  });
});

describe('movimentarDroga', () => {
  it('retirada para venda baixa o estoque, cria a pendência e avisa os gerentes', async () => {
    const r = await movimentarDroga(pedido(), ana);
    expect(r.dto).toMatchObject({ estoque: 490, esperado: 2300, devido: 2300 });
    expect(r.eventos.map((e) => e.tipo)).toEqual(['bau.movimento', 'droga.pendencia']);
    expect((await lerEstadoDroga('membros', ana.id)).minhaPendencia).toBe(2300);
    expect(await listarPendencias()).toMatchObject([{ usuarioId: '10', nome: 'Ana', devido: 2300 }]);
  });

  it('retirar de novo com pendência marca jaPendente e soma o valor', async () => {
    await movimentarDroga(pedido(), ana);
    const r = await movimentarDroga(pedido({ quantidade: 400, motivo: 'pista' }), ana);
    expect(r.dto.devido).toBe(2300 + 400 * 215);
    expect(r.eventos.find((e) => e.tipo === 'droga.pendencia')).toMatchObject({ jaPendente: true, comprador: 'Fulano' });
  });

  it('com dinheiro depositado junto, entra no caixa sujo e abate a pendência', async () => {
    const r = await movimentarDroga(pedido({ deposito: 2300 }), ana);
    expect(r.dto.devido).toBe(0);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['bau.movimento', 'caixa.movimento']);
    expect((fake.dump()['caixa/saldo'] as { sujo: number }).sujo).toBe(2300);
  });

  it('o comprador vai para o log do baú junto com o motivo', async () => {
    await movimentarDroga(pedido({ motivo: 'parceria', comprador: 'Ciclano' }), ana);
    const logs = Object.entries(fake.dump()).filter(([k]) => k.startsWith('logs/'));
    expect(JSON.stringify(logs)).toContain('Vendido para: Ciclano');
  });

  it('motivo "outro" não cobra nada; guardar devolve ao estoque', async () => {
    expect((await movimentarDroga(pedido({ motivo: 'outro' }), ana)).dto).toMatchObject({ esperado: 0, devido: 0 });
    const g = await movimentarDroga(pedido({ acao: 'guardar', motivo: 'devolucao', quantidade: 5 }), ana);
    expect(g.dto.estoque).toBe(495);
  });

  it('recusa estoque insuficiente, motivo inválido, quantidade inválida e tipo errado', async () => {
    expect((await recusa(movimentarDroga(pedido({ quantidade: 501 }), ana))).codigo).toBe('ESTOQUE_INSUFICIENTE');
    expect((await recusa(movimentarDroga(pedido({ motivo: 'devolucao' }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ acao: 'guardar', motivo: 'pista' }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ quantidade: 0 }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ deposito: -5 }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ comprador: '  ' }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ comprador: undefined }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ comprador: 'x'.repeat(101) }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ acao: 'x' }), ana))).status).toBe(400);
    expect((await recusa(movimentarDroga(pedido({ tipo: 'cofre' }), ana))).status).toBe(400);
  });
});

describe('depositarVenda e dados', () => {
  it('o depósito abate a pendência (sem ficar negativa) e entra no caixa sujo', async () => {
    await movimentarDroga(pedido(), ana);
    expect((await depositarVenda(1000, ana)).dto.devido).toBe(1300);
    expect((await depositarVenda(5000, ana)).dto.devido).toBe(0);
    expect(await listarPendencias()).toEqual([]);
    expect((fake.dump()['caixa/saldo'] as { sujo: number }).sujo).toBe(6000);
    expect((await recusa(depositarVenda(0, ana))).status).toBe(400);
  });

  it('a aba Dados soma retiradas, depósitos, vendas e pendentes por pessoa', async () => {
    await movimentarDroga(pedido({ quantidade: 20 }), ana);
    await movimentarDroga(pedido({ quantidade: 10, motivo: 'parceria' }), bia);
    await depositarVenda(2000, bia);
    const d = await lerDados();
    expect(d.retiradasDroga.map((l) => [l.nome, l.valor])).toEqual([['Ana', 20], ['Bia', 10]]);
    expect(d.depositosCaixa).toMatchObject([{ nome: 'Bia', valor: 2000 }]);
    expect(d.vendas.find((v) => v.nome === 'Ana')).toMatchObject({ vendido: 4600, depositado: 0, falta: 4600 });
    expect(d.vendas.find((v) => v.nome === 'Bia')).toMatchObject({ vendido: 2000, depositado: 2000, falta: 0 });
    expect(d.pendentes.map((p) => p.nome)).toEqual(['Ana']);
  });
});
