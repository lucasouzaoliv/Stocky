import { describe, expect, it } from 'vitest';
import { ErroApp } from '@/server/erros';
import { lerPaginacao, lerPaginaPorData, type Pagina } from '@/server/paginacao';
import { comoDb, criarFakeFirestore } from '../helpers/fake-firestore';

const sp = (q: string) => new URLSearchParams(q);
const erro = (q: string) => {
  try {
    lerPaginacao(sp(q));
    return null;
  } catch (e) {
    return e as ErroApp;
  }
};

describe('lerPaginacao', () => {
  it('padrões e valores válidos', () => {
    expect(lerPaginacao(sp(''))).toEqual({ limite: 20, cursor: null });
    expect(lerPaginacao(sp('limite=1&cursor=AbC123'))).toEqual({ limite: 1, cursor: 'AbC123' });
    expect(lerPaginacao(sp('limite=100'))).toEqual({ limite: 100, cursor: null });
  });

  it('cursor fora do formato de id do Firestore → 400', () => {
    for (const c of ['', 'a/b', '../x', 'a b', 'x'.repeat(41), 'ç', '%2F']) {
      expect(erro(`cursor=${encodeURIComponent(c)}`)?.status, `cursor=${c}`).toBe(400);
    }
  });

  it('limite inválido → 400 com mensagem em português', () => {
    const e = erro('limite=500');
    expect(e?.status).toBe(400);
    expect(e?.message).toMatch(/Limite inválido/);
  });
});

describe('lerPaginaPorData sobre o fake (startAfter)', () => {
  const col = () => {
    const fake = criarFakeFirestore({
      seed: Object.fromEntries(
        [['a', 'T3'], ['b', 'T1'], ['c', 'T2'], ['d', 'T2']].map(([id, data]) => [`logs/x/entradas/${id}`, { data, n: id }]),
      ),
    });
    return comoDb(fake).collection('logs').doc('x').collection('entradas');
  };
  const mapear = (id: string) => id;

  it('percorre tudo em ordem decrescente, desempatando por id, sem repetir', async () => {
    const c = col();
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Pagina<string> = await lerPaginaPorData(c, { limite: 1, cursor }, mapear);
      vistos.push(...p.itens);
      cursor = p.proximoCursor;
      if (!cursor) break;
    }
    expect(vistos).toEqual(['a', 'c', 'd', 'b']);
  });
});
