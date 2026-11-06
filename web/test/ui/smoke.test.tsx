import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Inicio from '@/app/page';

describe('WEB-003 smoke de interface', () => {
  it('renderiza a página inicial mínima', () => {
    render(<Inicio />);
    expect(screen.getByRole('heading', { name: 'Stocky' })).toBeInTheDocument();
  });
});
