import { describe, expect, it } from 'vitest';
import { LIMITES } from '@/compartilhado/limites';
import { ehIdDocumento, ehIdSeguro, gerarIdItem, validarNomeItem } from '@/server/validacao/item';
import { normalizarAnotacao } from '@/server/validacao/texto';
import { ErroApp } from '@/server/erros';

describe('WEB-009 validarNomeItem', () => {
  it('AC1: trim e colapso de espaços', () => {
    expect(validarNomeItem('  Pistola   9mm \t')).toEqual({ ok: true, nome: 'Pistola 9mm', id: 'pistola_9mm' });
  });

  it('AC1: recusa vazio, só espaços e não string', () => {
    for (const v of ['', '   ', '\n\t', null, undefined, 42, {}, ['a']]) {
      expect(validarNomeItem(v), String(v)).toMatchObject({ ok: false });
    }
  });

  it('AC1: 50 caracteres aceito, 51 recusado', () => {
    expect(validarNomeItem('a'.repeat(50))).toMatchObject({ ok: true });
    const r = validarNomeItem('a'.repeat(51));
    expect(r).toEqual({ ok: false, erro: 'O nome do item pode ter no máximo 50 caracteres.' });
  });

  it('AC1: o limite conta caracteres, não unidades UTF-16', () => {
    expect(validarNomeItem(`${'a'.repeat(49)}🔫`)).toMatchObject({ ok: true });
  });

  it('AC2: recusa nome sem letra ou número (id vazio)', () => {
    for (const v of ['!!!', '🔫', '---', '___', '#']) {
      expect(validarNomeItem(v), v).toEqual({
        ok: false,
        erro: 'O nome do item precisa ter ao menos uma letra ou número.',
      });
    }
  });

  it('AC3: nomes perigosos geram id seguro ou erro', () => {
    for (const v of ['A/B', '../x', '__proto__', 'a.b', 'x#y', 'a__b', 'constructor', '%2F']) {
      const r = validarNomeItem(v);
      if (r.ok) {
        expect(ehIdSeguro(r.id), `${v} -> ${r.id}`).toBe(true);
        expect(r.id).not.toMatch(/[/.#]|__/);
      }
    }
    expect(validarNomeItem('A/B')).toMatchObject({ ok: true, id: 'a_b' });
    expect(validarNomeItem('../x')).toMatchObject({ ok: true, id: 'x' });
    expect(validarNomeItem('__proto__')).toMatchObject({ ok: true, id: 'proto' });
  });

  it('AC4: nomes equivalentes geram o mesmo id', () => {
    const ids = ['Pistola 9mm', 'pistola-9mm', 'PISTOLA 9MM', 'pístola  9mm'].map((n) => gerarIdItem(n));
    expect(new Set(ids)).toEqual(new Set(['pistola_9mm']));
  });

  it('AC5: nome iniciado por # é aceito e o id ignora o #', () => {
    expect(validarNomeItem('#1 Especial: .50')).toEqual({ ok: true, nome: '#1 Especial: .50', id: '1_especial_50' });
  });
});

describe('WEB-009 gerarIdItem', () => {
  it('remove acentos, colapsa e apara underscores', () => {
    expect(gerarIdItem('Coração  de Ônix!!')).toBe('coracao_de_onix');
    expect(gerarIdItem('__a__b__')).toBe('a_b');
  });

  it('limita a 50 e não termina em underscore após o corte', () => {
    const id = gerarIdItem(`${'a'.repeat(49)} bbb`);
    expect(id.length).toBeLessThanOrEqual(LIMITES.ID_ITEM_MAX);
    expect(id.endsWith('_')).toBe(false);
    expect(id).toBe('a'.repeat(49));
  });

  it('entrada vazia dá id vazio, nunca lança', () => {
    expect(gerarIdItem('')).toBe('');
    expect(gerarIdItem(undefined as unknown as string)).toBe('');
  });
});

describe('ehIdSeguro / ehIdDocumento', () => {
  it('aceita ids gerados', () => {
    for (const v of ['a', 'pistola_9mm', '1_especial', 'a'.repeat(50)]) expect(ehIdSeguro(v), v).toBe(true);
  });

  it('recusa chaves perigosas e formatos inválidos', () => {
    for (const v of [
      '', '__proto__', '_a', 'a_', 'a__b', 'A', 'a-b', 'a/b', '../x', '..', '.', '%2F', 'a b', 'a.b',
      'a'.repeat(51), null, undefined, 1, {}, 'ação',
    ]) {
      expect(ehIdSeguro(v), String(v)).toBe(false);
    }
  });

  it('ehIdDocumento aceita ids automáticos e recusa o resto', () => {
    expect(ehIdDocumento('auto0000000000000001')).toBe(true);
    expect(ehIdDocumento('A1b2C3')).toBe(true);
    for (const v of ['', 'a_b', 'a/b', '..', 'a'.repeat(41), 'ação', null, 5]) expect(ehIdDocumento(v), String(v)).toBe(false);
  });
});

describe('normalizarAnotacao', () => {
  it('normaliza espaços e remove controles', () => {
    expect(normalizarAnotacao('  pagou \n  o   frete\u0000 ')).toBe('pagou o frete');
  });

  it('aceita 100 e recusa 101 caracteres', () => {
    expect(normalizarAnotacao('a'.repeat(100))).toHaveLength(100);
    expect(() => normalizarAnotacao('a'.repeat(101))).toThrow(ErroApp);
  });

  it('recusa vazio, só controles e não string com VALIDACAO', () => {
    for (const v of ['', '   ', '\u0000\u0001', null, undefined, 3]) {
      try {
        normalizarAnotacao(v);
        expect.unreachable(String(v));
      } catch (e) {
        expect(e).toBeInstanceOf(ErroApp);
        expect((e as ErroApp).codigo).toBe('VALIDACAO');
        expect((e as ErroApp).status).toBe(400);
      }
    }
  });
});
