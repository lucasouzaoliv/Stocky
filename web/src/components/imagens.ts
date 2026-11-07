/**
 * Imagens dos itens (recortadas dos prints do jogo), em public/itens/<id>.webp.
 * Para um item novo ganhar foto: coloque o arquivo em public/itens/ com o id do item e inclua o id aqui.
 * Item sem foto continua com o ícone desenhado (icones.ts).
 */
const COM_IMAGEM: ReadonlySet<string> = new Set([
  'gaze',
  'adrenalina',
  'usp',
  'desert',
  'colete',
  'muni_9mm',
  'muni_45acp',
  'muni_50ae',
  'pecas_roupas',
  'plastico',
  'sucata_metal',
  'saco_de_meta',
  'agulha',
  'linha',
  'resina',
  'tesoura',
  'notas_marcadas',
  'chaves_de_casa',
  'bateria_de_impressora',
  'skateboard',
  'insumo_para_fabricacao_de_drogas',
  'knife',
  'tablet',
  'radio',
  'chave_de_carro',
  'doe_mendigo',
  'placa_falsa',
  'caixa_de_ferramentas',
  'pneu',
  'chave_de_roda',
  'dinheiro',
  'polaroid',
  'caixa_de_comida',
  'esponjinha',
  'serra_eletrica',
  'pistola_pneumatica',
  'chave_de_fenda',
  'lista_de_modificacoes',
  'lockpick',
  'identidade',
  'celular',
  'analgesico',
  'trojan_bancario',
  'usb_trojan',
  'arquivo_ghost',
  'cz_scorpion_evo',
]);

/** Itens que usam a imagem de outro (o colete danificado é o mesmo desenho do colete). */
const USA_IMAGEM_DE: Readonly<Record<string, string>> = { colete_danificado: 'colete' };

export function imagemDoItem(itemId: string): string | null {
  const id = USA_IMAGEM_DE[itemId] ?? itemId;
  return COM_IMAGEM.has(id) ? `/itens/${id}.webp` : null;
}
