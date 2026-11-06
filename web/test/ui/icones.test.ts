import { Box, Crosshair, FlaskConical, Package, Pill, Shield, Syringe } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { iconeDaCategoria, iconeDoItem } from '@/components/icones';

describe('ícones por categoria e item', () => {
  it.each([
    ['Medicamentos', 'Bandagem', Pill],
    ['Medicamentos', 'Seringa de adrenalina', Syringe],
    ['Armas', 'Pistola', Crosshair],
    ['Coletes e Munição', 'Colete leve', Shield],
    ['Materiais', 'Ferro', Package],
    ['Drogas', 'Pó químico', FlaskConical],
    ['Extras', 'Qualquer coisa', Box],
    ['Categoria nova', 'Item novo', Box],
  ])('%s / %s', (categoria, item, esperado) => {
    expect(iconeDoItem(categoria, item)).toBe(esperado);
  });

  it('categoria sem correspondência usa o ícone genérico', () => {
    expect(iconeDaCategoria('Munição')).toBe(Shield);
    expect(iconeDaCategoria('Zzz')).toBe(Box);
  });
});
