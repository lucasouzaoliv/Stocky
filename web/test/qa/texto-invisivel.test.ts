/**
 * QA: anotação do caixa é obrigatória (WEB-033 AC4). Texto só com caracteres invisíveis de formatação
 * (\p{Cf}: zero-width space, word joiner, marcas de direção) não é anotação de verdade e deve ser recusado
 * como "vazia". Hoje só \p{Cc} é removido. Prova do defeito; deve passar após a correção.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizarAnotacao } from '@/server/validacao/texto';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';

beforeEach(() => aplicarEnvTeste());
afterEach(() => limparEnvTeste());

describe('QA anotação só com caracteres invisíveis', () => {
  for (const [nome, valor] of [
    ['zero-width space', '​'],
    ['word joiner', '⁠⁠'],
    ['marca RTL', '‏'],
    ['override RTL + zero-width', '‮​ '],
  ] as const) {
    it(`${nome} → VALIDACAO`, () => {
      expect(() => normalizarAnotacao(valor)).toThrow(expect.objectContaining({ codigo: 'VALIDACAO' }));
    });
  }

  it('texto normal com acento e emoji continua aceito', () => {
    expect(normalizarAnotacao('  venda   de 💊 ')).toBe('venda de 💊');
  });
});
