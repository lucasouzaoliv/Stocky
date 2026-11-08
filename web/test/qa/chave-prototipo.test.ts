/**
 * QA: id de item que coincide com chave de Object.prototype ("constructor").
 * Ciclo 3: sem retorno antecipado. A correção escolhida (QA-W1) foi recusar o id na criação e usar só
 * chaves próprias na leitura; cada teste afirma as duas coisas: a criação é recusada E a operação com o id
 * reservado é recusada sem gravar nada (ou, com dado legado, funciona com números de verdade).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as CATALOGO_ADICIONAR } from '@/app/api/catalogo/itens/route';
import { DELETE as CATALOGO_REMOVER } from '@/app/api/catalogo/itens/[categoriaId]/[itemId]/route';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
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
const itensArmas = () =>
  (fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string }> }> }).categorias.find((c) => c.id === 'armas')!.itens;

/** A criação de "Constructor" TEM de ser recusada (400 VALIDACAO) e o catálogo fica igual. */
async function criacaoRecusada(): Promise<void> {
  const antes = itensArmas();
  const r = await chamarRota(CATALOGO_ADICIONAR, { metodo: 'POST', caminho, perfil: 2, corpo: { categoriaId: 'armas', nome: 'Constructor' } });
  expect(r.status, r.texto).toBe(400);
  expect(r.corpo.codigo).toBe('VALIDACAO');
  expect(itensArmas()).toEqual(antes);
  expect(itensArmas().some((i) => i.id === 'constructor')).toBe(false);
}

/** Catálogo e baú com "constructor" já gravado (dado legado, de antes da regra). */
function abrirLegado(qtd?: number): void {
  const seed = seedBase({ membros: { armas: { colt: 4, ...(qtd === undefined ? {} : { constructor: qtd }) } } });
  const catalogo = structuredClone(CATALOGO_PADRAO) as unknown as Array<{ id: string; itens: Array<{ id: string; nome: string }> }>;
  catalogo.find((c) => c.id === 'armas')!.itens.push({ id: 'constructor', nome: 'Constructor' });
  (seed['config/catalogo'] as Dados).categorias = catalogo as unknown as Dados[];
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
}

describe('QA chave de protótipo como id de item', () => {
  it('remover "constructor": criação recusada; remover pelo id → 400; nada gravado nem log', async () => {
    await criacaoRecusada();
    const antes = fake.dump();
    const r = await chamarRota(REMOVER, { metodo: 'POST', caminho, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'constructor', quantidade: 1 } });
    expect(r.status, r.texto).toBe(400);
    expect(fake.dump()).toEqual(antes);
    expect(Object.keys(fake.dump()).filter((k) => k.startsWith('logs/'))).toHaveLength(0);
  });

  it('adicionar "constructor": criação recusada; adicionar pelo id → 400; o baú continua só com colt: 4', async () => {
    await criacaoRecusada();
    const r = await chamarRota(ADICIONAR, { metodo: 'POST', caminho, perfil: 1, params: { tipo: 'membros' }, corpo: { categoriaId: 'armas', itemId: 'constructor', quantidade: 3 } });
    expect(r.status, r.texto).toBe(400);
    expect((fake.dump()['baus/membros'] as { itens: unknown }).itens).toEqual({ armas: { colt: 4 } });
  });

  it('prévia do ajuste com "constructor" → 400 listando a linha; nada gravado', async () => {
    await criacaoRecusada();
    const antes = fake.dump();
    const r = await chamarRota(PREVIA, { metodo: 'POST', caminho, perfil: 2, params: { tipo: 'membros' }, corpo: { linhas: [{ categoriaId: 'armas', itemId: 'constructor', quantidade: 1 }] } });
    expect(r.status, r.texto).toBe(400);
    expect(fake.dump()).toEqual(antes);
  });

  it('dado legado: dono remove "constructor" do catálogo → 200, removidoDe numérico (0 e 2) e logs sem função', async () => {
    abrirLegado();
    const sem = await chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho, perfil: 3, params: { categoriaId: 'armas', itemId: 'constructor' } });
    expect(sem.status, sem.texto).toBe(200);
    expect((sem.corpo.dados as { removidoDe: unknown }).removidoDe).toEqual({ membros: 0, gerencia: 0, casa: 0 });
    expect(Object.keys(fake.dump()).filter((k) => k.startsWith('logs/membros/'))).toHaveLength(0);

    abrirLegado(2);
    const com = await chamarRota(CATALOGO_REMOVER, { metodo: 'DELETE', caminho, perfil: 3, params: { categoriaId: 'armas', itemId: 'constructor' } });
    expect(com.status, com.texto).toBe(200);
    expect((com.corpo.dados as { removidoDe: unknown }).removidoDe).toEqual({ membros: 2, gerencia: 0, casa: 0 });
    expect((fake.dump()['baus/membros'] as { itens: unknown }).itens).toEqual({ armas: { colt: 4 } });
    const logs = Object.entries(fake.dump()).filter(([k]) => k.startsWith('logs/membros/')).map(([, v]) => v as Record<string, unknown>);
    expect(logs).toHaveLength(1);
    for (const l of logs) {
      expect(typeof l.quantidade).toBe('number');
      expect(JSON.stringify(l)).not.toContain('function');
    }
  });
});
