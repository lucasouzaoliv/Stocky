import { describe, expect, it } from 'vitest';
import { nivelDeCargos } from '@/server/auth/niveis';

const REAL = {
  dono: ['1561468121733267495'],
  gerente: ['1563258601575813191', '1561468121733267493'],
  membro: ['1561468121733267491', '1561468121733267490'],
};
const simples = { membro: ['m'], gerente: ['g'], dono: ['d'] };

describe('WEB-018 nivelDeCargos', () => {
  it('AC1: tabela básica', () => {
    expect(nivelDeCargos([], simples)).toBe(0);
    expect(nivelDeCargos(['m'], simples)).toBe(1);
    expect(nivelDeCargos(['g'], simples)).toBe(2);
    expect(nivelDeCargos(['d'], simples)).toBe(3);
    expect(nivelDeCargos(['g', 'd'], simples)).toBe(3);
    expect(nivelDeCargos(['x', 'y'], simples)).toBe(0);
  });

  it('AC1a: configuração real com listas', () => {
    expect(nivelDeCargos(['1563258601575813191'], REAL)).toBe(2);
    expect(nivelDeCargos(['1561468121733267493'], REAL)).toBe(2);
    expect(nivelDeCargos(['1561468121733267491'], REAL)).toBe(1);
    expect(nivelDeCargos(['1561468121733267490'], REAL)).toBe(1);
    expect(nivelDeCargos(['1561468121733267495'], REAL)).toBe(3);
    expect(nivelDeCargos(['1561468121733267490', '1563258601575813191'], REAL)).toBe(2);
    expect(nivelDeCargos(['1561468121733267490', '1563258601575813191', '1561468121733267495'], REAL)).toBe(3);
  });

  it('AC1a: espaços nos roles são ignorados e itens vazios nunca casam', () => {
    expect(nivelDeCargos([' m '], simples)).toBe(1);
    expect(nivelDeCargos(['', '  '], { membro: [''], gerente: [], dono: [] })).toBe(0);
    expect(nivelDeCargos([''], { membro: ['', 'm'], gerente: [], dono: [] })).toBe(0);
  });

  it('AC2: roles vazio, undefined, null ou não-array dão 0 sem lançar', () => {
    for (const r of [undefined, null, 'm', 5, {}, [1, null, {}]]) {
      expect(nivelDeCargos(r, simples), String(r)).toBe(0);
    }
  });

  it('AC3: lista de configuração vazia nunca concede nível, nem com string vazia em roles', () => {
    const vazio = { membro: [], gerente: [], dono: [] };
    expect(nivelDeCargos(['', 'm', 'g', 'd'], vazio)).toBe(0);
    expect(nivelDeCargos(['', 'm'], { membro: [], gerente: [], dono: ['d'] })).toBe(0);
    expect(nivelDeCargos(['m'], { membro: ['m'], gerente: [], dono: [] })).toBe(1);
  });
});
