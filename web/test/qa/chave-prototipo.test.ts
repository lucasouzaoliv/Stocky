/**
 * QA: id de item que coincide com chave de Object.prototype ("constructor").
 * `gerarIdItem('Constructor')` gera `constructor`, que passa em `ehIdSeguro`. Os serviços leem
 * `bau.itens[cat][item]` em objetos comuns, então `constructor` devolve a função `Object`
 * em vez de `undefined` quando a categoria já tem outro item no baú.
 * Estes testes provam o defeito (devem passar depois da correção do backend-dev).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { seedBase } from '../helpers/estado';
import { chamarRota } from '../helpers/rotas';

let fake: FakeFirestore;

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  // categoria armas já tem colt no baú dos membros
  fake = criarFakeFirestore({ seed: seedBase({ membros: { armas: { colt: 4 } } }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const caminho = '/api/x';
async function criarItemConstructor(): Promise<string> {
  const r = await chamarRota(CATALOGO_ADICIONAR, { metodo: 'POST', caminho, perfil: 2, corpo: { categoriaId: 'armas', nome: 'Constructor' } });
  // ou o id é recusado (correção possível), ou é criado e precisa funcionar como qualquer item
  return r.status === 201 ? ((r.corpo.dados as { item: { id: string } }).item.id) : '';
}

describe('QA chave de protótipo como id de item', () => {
  it('remover "constructor" que não está no baú → 404, sem gravar NaN nem log', async () => {
    const id = await criarItemConstructor();
    if (!id) return; // recusado na criação: defeito corrigido pela outra via
    const antes = fake.dump()['baus/membros'];
    const r = await chamarRota(REMOVER, { metodo: 'POST', caminho, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: id, quantidade: 1 } });
    expect(r.status, r.texto).toBe(404);
    expect(fake.dump()['baus/membros']).toEqual(antes);
  });

  it('adicionar "constructor" numa categoria que já tem itens no baú funciona (200, quantidade 3)', async () => {
    const id = await criarItemConstructor();
    if (!id) return;
    const r = await chamarRota(ADICIONAR, { metodo: 'POST', caminho, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: id, quantidade: 3 } });
    expect(r.status, r.texto).toBe(200);
    expect((r.corpo.dados as { quantidade: number }).quantidade).toBe(3);
  });

  it('prévia do ajuste mostra antes = 0 (número) para "constructor"', async () => {
    const id = await criarItemConstructor();
    if (!id) return;
    const r = await chamarRota(PREVIA, { metodo: 'POST', caminho, perfil: 2, params: { tipo: 'membros' }, corpo: { linhas: [{ categoriaId: 'armas', itemId: id, quantidade: 1 }] } });
    expect(r.status).toBe(200);
    expect((r.corpo.dados as { linhas: Array<{ antes: unknown }> }).linhas[0]!.antes).toBe(0);
  });

  it('dono remove "constructor" do catálogo: removidoDe numérico (0) e nenhum log de baú com função', async () => {
    const id = await criarItemConstructor();
    if (!id) return;
    const r = await chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho, perfil: 3, params: { categoriaId: 'armas', itemId: id } });
    expect(r.status, r.texto).toBe(200);
    expect((r.corpo.dados as { removidoDe: unknown }).removidoDe).toEqual({ membros: 0, gerencia: 0 });
    const logs = Object.keys(fake.dump()).filter((k) => k.startsWith('logs/membros/'));
    expect(logs).toHaveLength(0);
  });
});
