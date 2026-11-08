import { afterEach, describe, expect, it } from 'vitest';
import { removerDoBau, adicionarAoBau } from '@/server/bau/operacoes';
import { confirmarAjuste, preverAjuste } from '@/server/bau/ajuste';
import { lerBau } from '@/server/bau/leitura';
import { removerItemDoCatalogo } from '@/server/catalogo/operacoes';
import { lerDocBau, quantidadeNoBau } from '@/server/dominio/refs';
import { resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { ehIdDeFormatoValido, ehIdSeguro, gerarIdItem, validarNomeItem } from '@/server/validacao/item';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { DONO, USUARIO, seedBase } from '../helpers/estado';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';

afterEach(() => {
  resetDb();
  resetSemente();
});

describe('QA-W1 ids que colidem com Object.prototype', () => {
  it('"constructor" não vale como id novo, mas o formato continua válido para ler dados antigos', () => {
    expect(gerarIdItem('Constructor')).toBe('constructor');
    expect(ehIdSeguro('constructor')).toBe(false);
    expect(ehIdDeFormatoValido('constructor')).toBe(true);
    expect(ehIdSeguro('construtor')).toBe(true);
    for (const v of ['__proto__', 'toString', 'hasOwnProperty', 'valueOf']) expect(ehIdSeguro(v), v).toBe(false);
  });

  it('validarNomeItem recusa o nome que geraria um id reservado', () => {
    for (const nome of ['Constructor', ' CONSTRUCTOR ', 'constructor!']) {
      expect(validarNomeItem(nome), nome).toMatchObject({ ok: false });
    }
    expect(validarNomeItem('Construtor')).toMatchObject({ ok: true, id: 'construtor' });
  });

  it('quantidadeNoBau ignora chaves herdadas em qualquer nível', () => {
    const itens = { armas: { colt: 2 } };
    expect(quantidadeNoBau(itens, 'armas', 'constructor')).toBe(0);
    expect(quantidadeNoBau(itens, 'armas', 'toString')).toBe(0);
    expect(quantidadeNoBau(itens, 'constructor', 'colt')).toBe(0);
    expect(quantidadeNoBau(itens, 'armas', 'colt')).toBe(2);
  });

  it('lerDocBau preserva um "constructor" que já existe gravado (dado antigo)', () => {
    const doc = lerDocBau({ versao: 1, itens: { armas: { constructor: 3, colt: 1 } } });
    expect(quantidadeNoBau(doc.itens, 'armas', 'constructor')).toBe(3);
  });
});

describe('QA-W1 dados antigos: item "constructor" já no catálogo', () => {
  let fake: FakeFirestore;
  function abrir(membros: Record<string, Record<string, number>> = { armas: { colt: 4 } }) {
    resetSemente();
    const seed = seedBase({ membros, gerencia: { armas: { constructor: 7 } } });
    const catalogo = structuredClone(CATALOGO_PADRAO);
    catalogo.find((c) => c.id === 'armas')!.itens.push({ id: 'constructor', nome: 'Constructor' });
    seed['config/catalogo'] = { categorias: catalogo, atualizadoEm: 'x' };
    fake = criarFakeFirestore({ seed });
    setDb(comoDb(fake));
  }

  it('a prévia do ajuste recusa o id reservado com 400', async () => {
    abrir();
    const r = await preverAjuste('membros', [{ categoriaId: 'armas', itemId: 'constructor', quantidade: 1 }]).catch((e: unknown) => e);
    expect(r).toBeInstanceOf(ErroApp);
    expect((r as ErroApp).status).toBe(400);
  });

  it('adicionar/remover/ajustar com id reservado → 400 e nada gravado', async () => {
    abrir();
    const antes = fake.dump();
    const pedido = { tipo: 'membros' as const, categoriaId: 'armas', itemId: 'constructor', quantidade: 1 };
    for (const p of [adicionarAoBau(pedido, USUARIO), removerDoBau(pedido, USUARIO), confirmarAjuste('membros', 0, [{ categoriaId: 'armas', itemId: 'constructor', quantidade: 1 }], USUARIO)]) {
      const e = await p.then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(ErroApp);
      expect((e as ErroApp).status).toBe(400);
    }
    expect(fake.dump()).toEqual(antes);
  });

  it('o dono ainda remove do catálogo o "constructor" antigo: contagens numéricas, baú limpo', async () => {
    abrir();
    const r = await removerItemDoCatalogo('armas', 'constructor', DONO);
    expect(r.removidoDe).toEqual({ membros: 0, gerencia: 7, casa: 0 });
    const dump = fake.dump();
    expect((dump['baus/gerencia'] as { itens: unknown }).itens).toEqual({});
    expect((dump['baus/membros'] as { itens: unknown }).itens).toEqual({ armas: { colt: 4 } });
  });

  it('a leitura do baú com "constructor" antigo não quebra nem mistura categorias', async () => {
    abrir();
    const bau = await lerBau('gerencia');
    const armas = bau.categorias.find((c) => c.id === 'armas')!;
    expect(armas.itens).toEqual([{ id: 'constructor', nome: 'Constructor', quantidade: 7 }]);
    expect(bau.categorias.find((c) => c.id === 'medicamentos')!.itens).toEqual([]);
  });
});

describe('QA-W5 anotação só com caracteres invisíveis', () => {
  it('Cf e Cc são removidos; sobrando nada, recusa com VALIDACAO', async () => {
    const { normalizarAnotacao } = await import('@/server/validacao/texto');
    for (const v of ['​', '⁠⁠', '‮​ ', '\u0000\u0007', '﻿']) {
      expect(() => normalizarAnotacao(v), JSON.stringify(v)).toThrow(expect.objectContaining({ codigo: 'VALIDACAO' }));
    }
    expect(normalizarAnotacao('ve​nda')).toBe('venda');
  });
});
