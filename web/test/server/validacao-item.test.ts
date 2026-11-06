import { describe, expect, it } from 'vitest';
import { LIMITES } from '@/compartilhado/limites';
import { ehIdDocumento, ehIdSeguro, gerarIdItem, validarNomeItem } from '@/server/validacao/item';
import { chaveDeNome, normalizarAnotacao, sanearTexto, temCaractereVisivel } from '@/server/validacao/texto';
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

describe('QA-W10 saneamento único de texto (nome do item e anotação)', () => {
  const INVISIVEIS = ['\u200B', '\u200C', '\u200D', '\u2060', '\u200E', '\u200F', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069', '\uFEFF', '\u00AD', '\u{E0041}', '\u{E007F}', '\uFE0F', '\uFE00', '\u{E0100}', '\u034F', '\u115F', '\u1160', '\u3164', '\uFFA0', '\u2800', '\u0007', '\u001B', '\u007F', '\u180E', '\u2062'];

  it.each(INVISIVEIS)('remove %j do meio do texto', (c) => {
    expect(sanearTexto(`Co${c}lt`)).toBe('Colt');
    expect(gerarIdItem(`Co${c}lt`)).toBe('colt');
    expect(validarNomeItem(`Co${c}lt`)).toEqual({ ok: true, nome: 'Colt', id: 'colt' });
  });

  it.each(INVISIVEIS)('nome e anotação só com %j são recusados', (c) => {
    expect(validarNomeItem(`${c}${c}`)).toMatchObject({ ok: false });
    expect(validarNomeItem(` ${c} `)).toMatchObject({ ok: false });
    expect(() => normalizarAnotacao(`${c} ${c}`)).toThrow(expect.objectContaining({ codigo: 'VALIDACAO' }));
  });

  it('espaços exóticos viram um espaço comum e colapsam', () => {
    expect(sanearTexto('a\u00A0\u2003\u3000b\u2028c\u2029d\ne\tf')).toBe('a b c d e f');
  });

  it('normaliza para NFC', () => {
    expect(sanearTexto('Muni\u0063\u0327a\u0303o')).toBe('Munição'.normalize('NFC'));
    expect(sanearTexto('Munição'.normalize('NFD'))).toBe('Munição'.normalize('NFC'));
  });

  it('exige caractere visível: marcas combinantes soltas não bastam', () => {
    expect(temCaractereVisivel('\u0301\u0301')).toBe(false);
    expect(validarNomeItem('\u0301')).toMatchObject({ ok: false });
    expect(() => normalizarAnotacao('\u0301')).toThrow(ErroApp);
    expect(temCaractereVisivel('🔫')).toBe(true);
  });

  it('emojis com ZWJ ou seletor de variação: decisão documentada, os invisíveis são removidos', () => {
    expect(sanearTexto('👨\u200D👩\u200D👧')).toBe('👨👩👧');
    expect(sanearTexto('❤\uFE0F')).toBe('❤');
    expect(normalizarAnotacao('pagou ❤\uFE0F')).toBe('pagou ❤');
  });

  it('chaveDeNome iguala caixa, diacríticos, NFD e largura total', () => {
    const chaves = ['Colt', 'COLT', 'ćolt', 'Ｃolt', 'Co\u200Blt', ' colt '].map(chaveDeNome);
    expect(new Set(chaves)).toEqual(new Set(['colt']));
    expect(chaveDeNome('Colt 45')).not.toBe(chaveDeNome('Colt'));
  });
});
