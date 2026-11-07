import 'server-only';
import type { CategoriaCatalogo } from '../dominio/tipos';

function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

/**
 * Catálogo inicial (temporada atual). Só vale para uma instalação nova: o catálogo que já está no Firestore
 * não muda sozinho (use `npm run catalogo:atualizar` ou o Painel). Ids novos seguem `gerarIdItem(nome)`.
 */
export const CATALOGO_PADRAO: readonly CategoriaCatalogo[] = congelar([
  {
    id: 'medicamentos',
    nome: 'Medicamentos',
    emoji: '💊',
    itens: [
      { id: 'gaze', nome: 'Gaze' },
      { id: 'adrenalina', nome: 'Adrenalina' },
      { id: 'analgesico', nome: 'Analgésico' },
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
      { id: 'knife', nome: 'Knife' },
      { id: 'cz_scorpion_evo', nome: 'CZ Scorpion Evo' },
      { id: 'c_4', nome: 'C-4' },
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
      { id: 'pecas_roupas', nome: 'Peças de Roupas' },
      { id: 'plastico', nome: 'Plástico' },
      { id: 'sucata_metal', nome: 'Sucata de Metal' },
      { id: 'bateria_de_impressora', nome: 'Bateria de Impressora' },
      { id: 'pneu', nome: 'Pneu' },
      { id: 'esponjinha', nome: 'Esponjinha' },
      { id: 'caixa_de_ferramentas', nome: 'Caixa de Ferramentas' },
      { id: 'chave_de_roda', nome: 'Chave de Roda' },
      { id: 'chave_de_fenda', nome: 'Chave de Fenda' },
      { id: 'serra_eletrica', nome: 'Serra Elétrica' },
      { id: 'pistola_pneumatica', nome: 'Pistola Pneumática' },
      { id: 'lockpick', nome: 'Lockpick' },
      { id: 'alicate_de_corte', nome: 'Alicate de Corte' },
      { id: 'vara_nivel_3', nome: 'Vara Nível 3' },
      { id: 'removedor_de_piche', nome: 'Removedor de Piche' },
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
      { id: 'insumo_para_fabricacao_de_drogas', nome: 'Insumo para Fabricação de Drogas' },
      { id: 'saco_de_metanfetamina', nome: 'Saco de Metanfetamina' },
      { id: 'mesa_de_metanfetamina', nome: 'Mesa de Metanfetamina' },
    ],
  },
  {
    id: 'extras',
    nome: 'Extras',
    emoji: '📦',
    itens: [
      { id: 'agulha', nome: 'Agulha' },
      { id: 'linha', nome: 'Linha' },
      { id: 'resina', nome: 'Resina' },
      { id: 'tesoura', nome: 'Tesoura' },
      { id: 'notas_marcadas', nome: 'Notas Marcadas' },
      { id: 'chaves_de_casa', nome: 'Chaves de Casa' },
      { id: 'chave_de_carro', nome: 'Chave de Carro' },
      { id: 'skateboard', nome: 'Skateboard' },
      { id: 'caixa_de_comida', nome: 'Caixa de Comida' },
      { id: 'celular', nome: 'Celular' },
      { id: 'tablet', nome: 'Tablet' },
      { id: 'radio', nome: 'Rádio' },
      { id: 'usb_trojan', nome: 'USB Trojan' },
      { id: 'trojan_bancario', nome: 'Trojan Bancário' },
      { id: 'identidade', nome: 'Identidade' },
      { id: 'placa_falsa', nome: 'Placa Falsa' },
      { id: 'doe_mendigo', nome: 'Doe - Mendigo' },
      { id: 'polaroid', nome: 'Polaroid' },
      { id: 'arquivo_ghost', nome: 'Arquivo Ghost' },
      { id: 'lista_de_modificacoes', nome: 'Lista de Modificações' },
      { id: 'dinheiro', nome: 'Dinheiro' },
      { id: 'snikkel', nome: 'Snikkel' },
      { id: 'cafe_do_cassino', nome: 'Café do Cassino' },
    ],
  },
]);
