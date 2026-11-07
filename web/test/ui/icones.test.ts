import { Box, Crosshair, FlaskConical, Package, Pill, Shield, Syringe } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { iconeDaCategoria, iconeDoItem } from '@/components/icones';

describe('ícones por categoria e item', () => {
  it.each([
    ['Medicamentos', 'Analgésico', Pill],
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

describe('imagens dos itens', () => {
  it('só aponta para arquivos que existem em public/itens e o colete danificado usa o do colete', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { imagemDoItem } = await import('@/components/imagens');
    for (const id of ['gaze', 'adrenalina', 'usp', 'desert', 'colete', 'muni_9mm', 'meta', 'notas_marcadas']) {
      const url = imagemDoItem(id);
      expect(url).toBe(`/itens/${id}.webp`);
      expect(existsSync(resolve(process.cwd(), 'public', url!.slice(1)))).toBe(true);
    }
    expect(imagemDoItem('colete_danificado')).toBe('/itens/colete.webp');
    expect(imagemDoItem('ak_47')).toBeNull();
  });
});
