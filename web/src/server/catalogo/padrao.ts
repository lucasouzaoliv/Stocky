import 'server-only';
import type { CategoriaCatalogo } from '../dominio/tipos';

function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

export const CATALOGO_PADRAO: readonly CategoriaCatalogo[] = congelar([
  {
    id: 'medicamentos',
    nome: 'Medicamentos',
    emoji: '💊',
    itens: [
      { id: 'bandagem', nome: 'Bandagem' },
      { id: 'gaze', nome: 'Gaze' },
      { id: 'adrenalina', nome: 'Adrenalina' },
    ],
  },
  {
    id: 'armas',
    nome: 'Armas',
    emoji: '🔫',
    itens: [
      { id: 'colt', nome: 'Colt' },
      { id: 'usp', nome: 'USP' },
      { id: 'desert', nome: 'Desert Eagle' },
      { id: 'ak_47', nome: 'AK 47' },
    ],
  },
  {
    id: 'coletesemuni',
    nome: 'Coletes e Munição',
    emoji: '🦺',
    itens: [
      { id: 'colete', nome: 'Colete' },
      { id: 'colete_danificado', nome: 'Colete Danificado' },
      { id: 'muni_9mm', nome: 'Munição 9MM' },
      { id: 'muni_45acp', nome: 'Munição .45 ACP' },
      { id: 'muni_50', nome: 'Munição .50' },
      { id: 'muni_50ae', nome: 'Munição .50 AE' },
    ],
  },
  {
    id: 'materiais',
    nome: 'Materiais',
    emoji: '🪛',
    itens: [
      { id: 'laptop', nome: 'Laptop' },
      { id: 'caixa_polvora', nome: 'Caixa de Pólvora' },
      { id: 'sulfato_bario', nome: 'Sulfato de Bário' },
      { id: 'alcool_gel', nome: 'Álcool em Gel' },
      { id: 'sabonete', nome: 'Sabonete' },
      { id: 'pecas_roupas', nome: 'Peças de Roupas' },
      { id: 'kit_eletronico', nome: 'Kit Eletrônico' },
      { id: 'cobre', nome: 'Cobre' },
      { id: 'plastico', nome: 'Plástico' },
      { id: 'sucata_metal', nome: 'Sucata de Metal' },
      { id: 'aluminio', nome: 'Alumínio' },
      { id: 'borracha', nome: 'Borracha' },
    ],
  },
  {
    id: 'drogas',
    nome: 'Drogas',
    emoji: '🌿',
    itens: [
      { id: 'cocaina', nome: 'Cocaína' },
      { id: 'lsd', nome: 'LSD' },
      { id: 'meta', nome: 'Meta' },
    ],
  },
  {
    id: 'extras',
    nome: 'Extras',
    emoji: '📦',
    itens: [
      { id: 'fichas_cassino', nome: 'Fichas de Cassino' },
      { id: 'agulha', nome: 'Agulha' },
      { id: 'linha', nome: 'Linha' },
      { id: 'resina', nome: 'Resina' },
      { id: 'tesoura', nome: 'Tesoura' },
      { id: 'notas_marcadas', nome: 'Notas Marcadas' },
    ],
  },
]);
