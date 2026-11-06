import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';
import { adicionarItemAoCatalogo } from '@/server/catalogo/operacoes';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { lerCatalogo, lerCatalogoTx } from '@/server/catalogo/leitura';
import { getDb, resetDb, setDb } from '@/server/firebase';
import { gerarIdItem, ehIdSeguro } from '@/server/validacao/item';
import { RAIZ_REPO } from '../helpers/arquivos';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';

let fake: FakeFirestore;
beforeEach(() => {
  resetSemente();
  fake = criarFakeFirestore();
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
});

const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

describe('WEB-014 semente do catálogo', () => {
  it('AC1/AC6: banco vazio cria catálogo, 2 baús e saldo, tudo dentro de transação', async () => {
    await garantirCatalogo();
    const d = fake.dump();
    expect(Object.keys(d).sort()).toEqual(['baus/gerencia', 'baus/membros', 'caixa/saldo', 'config/catalogo']);
    const categorias = (d['config/catalogo'] as { categorias: Array<{ itens: unknown[] }> }).categorias;
    expect(categorias).toHaveLength(6);
    expect(categorias.reduce((n, c) => n + c.itens.length, 0)).toBe(34);
    expect(d['baus/membros']).toMatchObject({ versao: 0, itens: {} });
    expect(d['baus/gerencia']).toMatchObject({ versao: 0, itens: {} });
    expect(d['caixa/saldo']).toMatchObject({ sujo: 0, limpo: 0, versao: 0 });
    expect(escritas()).toHaveLength(4);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
  });

  it('AC2: 20 chamadas paralelas resultam em um único catálogo e uma escrita por documento', async () => {
    await Promise.all(Array.from({ length: 20 }, () => garantirCatalogo()));
    expect(escritas()).toHaveLength(4);
    expect(new Set(escritas().map((c) => c.caminho)).size).toBe(4);
    expect((fake.dump()['config/catalogo'] as { categorias: unknown[] }).categorias).toHaveLength(6);
  });

  it('memoriza o sucesso: a segunda chamada não toca no banco', async () => {
    await garantirCatalogo();
    const antes = fake.chamadas.length;
    await garantirCatalogo();
    expect(fake.chamadas.length).toBe(antes);
  });

  it('falha na transação não memoriza e a próxima chamada tenta de novo', async () => {
    fake.falharProximoCommit(new Error('commit falhou'));
    await expect(garantirCatalogo()).rejects.toThrow('commit falhou');
    await garantirCatalogo();
    expect(Object.keys(fake.dump())).toHaveLength(4);
  });

  it('AC3: dados existentes (item do usuário, baú com itens, saldo) ficam intactos', async () => {
    const catalogo = {
      categorias: [{ id: 'armas', nome: 'Armas', emoji: '🔫', itens: [{ id: 'faca', nome: 'Faca' }] }],
      atualizadoEm: 'antes',
    };
    const bau = { versao: 9, itens: { armas: { faca: 3 } }, atualizadoEm: 'antes' };
    const saldo = { sujo: 50, limpo: 70, versao: 4, atualizadoEm: 'antes' };
    fake = criarFakeFirestore({
      seed: { 'config/catalogo': catalogo, 'baus/membros': bau, 'caixa/saldo': saldo },
    });
    setDb(comoDb(fake));
    await garantirCatalogo();
    const d = fake.dump();
    expect(d['config/catalogo']).toEqual(catalogo);
    expect(d['baus/membros']).toEqual(bau);
    expect(d['caixa/saldo']).toEqual(saldo);
    expect(d['baus/gerencia']).toMatchObject({ versao: 0, itens: {} });
    expect(escritas().map((c) => c.caminho)).toEqual(['baus/gerencia']);
  });

  it('AC4: item adicionado em corrida com a semente nunca é perdido (D6), com adicionarItemAoCatalogo real', async () => {
    const usuario = { id: '444444444444444441', nome: 'Teste' };
    const r = await Promise.all([
      garantirCatalogo(),
      adicionarItemAoCatalogo('armas', 'Faca', usuario),
      garantirCatalogo(),
      adicionarItemAoCatalogo('armas', 'Machado', usuario),
    ]);
    expect(r[1]?.item).toEqual({ id: 'faca', nome: 'Faca' });
    const armas = (fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string }> }> })
      .categorias.find((c) => c.id === 'armas');
    expect(armas?.itens.filter((i) => i.id === 'faca')).toHaveLength(1);
    expect(armas?.itens.filter((i) => i.id === 'machado')).toHaveLength(1);
    expect(armas?.itens.some((i) => i.id === 'colt')).toBe(true);
  });

  it('ADR-11: dentro de transação, catálogo ausente vira erro interno e nada é semeado', async () => {
    const db = getDb();
    await expect(db.runTransaction((tx) => lerCatalogoTx(tx, db))).rejects.toMatchObject({ codigo: 'INTERNO' });
    expect(escritas()).toHaveLength(0);
  });

  it('lerCatalogo semeia e devolve o DTO com total por categoria', async () => {
    const dto = await lerCatalogo();
    expect(dto.categorias.map((c) => c.id)).toEqual(CATALOGO_PADRAO.map((c) => c.id));
    expect(dto.categorias.find((c) => c.id === 'materiais')?.total).toBe(12);
  });

  it('AC5: no máximo 25 itens por categoria; ids seguros, únicos e sem colisão com gerarIdItem', () => {
    for (const cat of CATALOGO_PADRAO) {
      expect(cat.itens.length, cat.id).toBeLessThanOrEqual(25);
      expect(ehIdSeguro(cat.id), cat.id).toBe(true);
      const ids = cat.itens.map((i) => i.id);
      expect(new Set(ids).size, cat.id).toBe(ids.length);
      for (const item of cat.itens) {
        expect(ehIdSeguro(item.id), item.id).toBe(true);
        const gerado = gerarIdItem(item.nome);
        const colide = cat.itens.some((outro) => outro !== item && (outro.id === gerado || gerarIdItem(outro.nome) === gerado));
        expect(colide, `${cat.id}/${item.id}`).toBe(false);
      }
    }
  });

  it('o catálogo padrão é imutável', () => {
    expect(() => {
      (CATALOGO_PADRAO[0] as { nome: string }).nome = 'x';
    }).toThrow();
  });

  it('cópia fiel: 6 categorias e 34 itens iguais, na mesma ordem, ao utils/db.js do bot', () => {
    const fonte = readFileSync(join(RAIZ_REPO, 'utils', 'db.js'), 'utf8');
    const inicio = fonte.indexOf('const CATALOGO_PADRAO = ');
    const fim = fonte.indexOf('\n};', inicio);
    expect(inicio).toBeGreaterThanOrEqual(0);
    const bot = runInNewContext(`(${fonte.slice(inicio + 'const CATALOGO_PADRAO = '.length, fim + 2)})`) as Record<
      string,
      { nome: string; emoji: string; items: Array<{ id: string; nome: string }> }
    >;
    const esperado = Object.entries(bot).map(([id, c]) => ({
      id,
      nome: c.nome,
      emoji: c.emoji,
      itens: c.items.map((i) => ({ id: i.id, nome: i.nome })),
    }));
    expect(CATALOGO_PADRAO).toEqual(esperado);
    expect(CATALOGO_PADRAO).toHaveLength(6);
    expect(CATALOGO_PADRAO.reduce((n, c) => n + c.itens.length, 0)).toBe(34);
  });
});
