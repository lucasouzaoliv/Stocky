/**
 * QA, WEB-051 AC4 e WEB-029/033/036/038/041 (tudo ou nada): a falha de commit precisa atingir a
 * transação DO DOMÍNIO. `garantirCatalogo()` abre a própria transação antes; se ela não tiver rodado,
 * `falharProximoCommit` é consumido pela semente e o teste não prova nada. Aqui a semente roda antes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { POST as MOVIMENTAR } from '@/app/api/caixa/movimentar/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setAgendador } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import { chamarRota } from '../helpers/rotas';
import type { PedidoTeste } from '../helpers/pedidos';

let fake: FakeFirestore;
let tarefas: Array<() => Promise<void>>;

beforeEach(async () => {
  aplicarEnvTeste();
  resetSemente();
  tarefas = [];
  setAgendador((t) => void tarefas.push(t));
  fake = criarFakeFirestore({ seed: seedBase({ membros: { armas: { colt: 10 } }, gerencia: { armas: { usp: 5 } }, saldo: { sujo: 100 } }) });
  setDb(comoDb(fake));
  await garantirCatalogo();
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const c = '/api/x';
const cenarios: Array<[string, unknown, PedidoTeste & { params?: Record<string, string> }]> = [
  ['adicionar', ADICIONAR, { metodo: 'POST', caminho: c, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1 } }],
  ['remover', REMOVER, { metodo: 'POST', caminho: c, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 1 } }],
  ['caixa', MOVIMENTAR, { metodo: 'POST', caminho: c, perfil: 2, corpo: { tipo: 'sujo', acao: 'saida', valor: 1, anotacao: 'x' } }],
  ['ajuste', CONFIRMAR, { metodo: 'POST', caminho: c, perfil: 2, params: { tipo: 'membros' }, corpo: { versao: 0, linhas: [{ categoriaId: 'armas', itemId: 'colt', quantidade: 3 }] } }],
  ['zerar', ZERAR, { metodo: 'POST', caminho: c, perfil: 3, corpo: { alvo: 'ambos', confirmacao: 'ZERAR' } }],
  ['catálogo adicionar', CATALOGO_ADICIONAR, { metodo: 'POST', caminho: c, perfil: 2, corpo: { categoriaId: 'armas', nome: 'Faca' } }],
  ['catálogo remover', CATALOGO_REMOVER, { metodo: 'DELETE', caminho: c, perfil: 3, params: { categoriaId: 'armas', itemId: 'colt' } }],
];

describe('QA falha de commit na transação do domínio', () => {
  for (const [nome, rota, pedido] of cenarios) {
    it(`${nome}: a transação do domínio roda, o commit falha → 500, banco idêntico, nenhum webhook agendado`, async () => {
      const antes = fake.dump();
      const escritasAntes = fake.chamadas.filter((x) => !['get', 'query'].includes(String(x.op))).length;
      fake.falharProximoCommit(new Error('commit falhou'));
      const r = await chamarRota(rota, pedido);
      expect(r.status, r.texto).toBe(500);
      // a operação chegou a preparar escritas (prova de que a falha atingiu o domínio, não a semente)
      expect(fake.chamadas.filter((x) => !['get', 'query'].includes(String(x.op))).length).toBeGreaterThan(escritasAntes);
      expect(fake.dump()).toEqual(antes);
      expect(tarefas).toHaveLength(0);
    });
  }
});
