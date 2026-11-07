import { describe, expect, it } from 'vitest';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { formatarDinheiro, formatarData, formatarNumero } from '@/compartilhado/formatacao';

const QTD = { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX };
const CAIXA = { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX };

describe('WEB-008 parseInteiro', () => {
  it.each([
    ['1', 1],
    ['100000', 100000],
    ['007', 7],
    [10, 10],
    [' 5 ', 5],
    ['000000000000001', 1],
  ])('AC1: aceita %j', (entrada, esperado) => {
    expect(parseInteiro(entrada, QTD)).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    '10abc', '1.5', '1,5', '-5', '+5', '1e3', '0x10', '1_000', '5 5', '', '   ', 'abc',
    '١٢٣', '１２３', '1​0', '1234567890123456', '0000000000000001',
    null, undefined, NaN, Infinity, -Infinity, 1.5, 2 ** 53, {}, [], [1], true,
  ])('AC1: recusa %j com motivo formato', (entrada) => {
    const r = parseInteiro(entrada, QTD);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('formato');
      expect(r.erro).toBe('Digite apenas números inteiros, sem pontos, vírgulas ou sinais.');
    }
  });

  it('AC1: recusa BigInt', () => {
    expect(parseInteiro(10n, QTD)).toMatchObject({ ok: false, motivo: 'formato' });
  });

  it('AC2: limites da quantidade', () => {
    expect(parseInteiro(0, QTD)).toMatchObject({ ok: false, motivo: 'minimo' });
    expect(parseInteiro('0', QTD)).toMatchObject({ ok: false, motivo: 'minimo' });
    expect(parseInteiro(-3, QTD)).toMatchObject({ ok: false, motivo: 'minimo' });
    expect(parseInteiro(10_000_001, QTD)).toMatchObject({ ok: false, motivo: 'maximo' });
    expect(parseInteiro('10000001', QTD)).toMatchObject({ ok: false, motivo: 'maximo' });
    expect(parseInteiro(10_000_000, QTD)).toEqual({ ok: true, valor: 10_000_000 });
    expect(parseInteiro(1, QTD)).toEqual({ ok: true, valor: 1 });
  });

  it('AC2: limites do caixa', () => {
    expect(parseInteiro(0, CAIXA)).toMatchObject({ ok: false, motivo: 'minimo' });
    expect(parseInteiro(1_000_000_001, CAIXA)).toMatchObject({ ok: false, motivo: 'maximo' });
    expect(parseInteiro('1000000000', CAIXA)).toEqual({ ok: true, valor: 1_000_000_000 });
    expect(parseInteiro('999999999999999', CAIXA)).toMatchObject({ ok: false, motivo: 'maximo' });
  });

  it('AC3: mensagens em português distinguem formato, mínimo e máximo', () => {
    const min = parseInteiro(0, QTD);
    const max = parseInteiro(10_000_001, QTD);
    const maxCaixa = parseInteiro(2_000_000_000, CAIXA);
    expect(min).toMatchObject({ erro: 'O valor mínimo é 1.' });
    expect(max).toMatchObject({ erro: 'Valor acima do limite (máx. 10.000.000).' });
    expect(maxCaixa).toMatchObject({ erro: 'Valor acima do limite (máx. 1.000.000.000).' });
  });

  it('AC4: LIMITES é congelado e imutável', () => {
    expect(Object.isFrozen(LIMITES)).toBe(true);
    expect(() => {
      (LIMITES as { QUANTIDADE_MAX: number }).QUANTIDADE_MAX = 1;
    }).toThrow(TypeError);
    expect(LIMITES.QUANTIDADE_MAX).toBe(10_000_000);
  });

  it('LIMITES traz os valores do contrato', () => {
    expect(LIMITES).toMatchObject({
      QUANTIDADE_MIN: 1, QUANTIDADE_MAX: 10_000_000, VALOR_CAIXA_MIN: 1, VALOR_CAIXA_MAX: 1_000_000_000,
      NOME_ITEM_MAX: 50, ID_ITEM_MAX: 50, ITENS_POR_CATEGORIA_MAX: 25, ANOTACAO_MAX: 100,
      AJUSTE_LINHAS_MAX: 200, PAGINA_MAX: 100, CORPO_MAX_BYTES: 10_240, CORPO_AJUSTE_MAX_BYTES: 102_400,
    });
  });
});

describe('formatacao compartilhada', () => {
  it('formata números e dinheiro com ponto de milhar', () => {
    expect(formatarNumero(0)).toBe('0');
    expect(formatarNumero(999)).toBe('999');
    expect(formatarNumero(1000)).toBe('1.000');
    expect(formatarNumero(1234567)).toBe('1.234.567');
    expect(formatarNumero(-1500)).toBe('-1.500');
    expect(formatarDinheiro(1000)).toBe('$1.000');
    expect(formatarDinheiro(-2500)).toBe('-$2.500');
  });

  it('formata data em America/Sao_Paulo e tolera data inválida', () => {
    expect(formatarData('2026-11-05T15:30:00Z')).toBe('05/11/2026 12:30');
    expect(formatarData(new Date('2026-01-01T02:05:00Z'))).toBe('31/12/2025 23:05');
    expect(formatarData('lixo')).toBe('');
  });
});
