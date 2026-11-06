import {
  Banknote,
  Bomb,
  Box,
  Cannabis,
  Crosshair,
  FlaskConical,
  Gem,
  Hammer,
  KeyRound,
  Package,
  Pill,
  Radio,
  Shield,
  Smartphone,
  Sword,
  Syringe,
  type LucideIcon,
} from 'lucide-react';

/** Minúsculas e sem acento, para casar "Munição" com "municao". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Primeiro padrão que casar vence: do mais específico (item) ao mais geral (categoria). */
const POR_ITEM: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/seringa|syringe|adrenalina|morfina/, Syringe],
  [/faca|machado|taco|katana|canivete/, Sword],
  [/granada|explosiv|c4|bomba/, Bomb],
  [/weed|maconha|erva/, Cannabis],
  [/chave|lockpick|gazua|ferrament/, KeyRound],
  [/celular|telefone/, Smartphone],
  [/radio|comunicador/, Radio],
  [/dinheiro|nota|grana/, Banknote],
  [/joia|ouro|diamante|ouro/, Gem],
  [/martelo|pe de cabra|alicate/, Hammer],
];

const POR_CATEGORIA: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/medic|remedio|saude|farmac/, Pill],
  [/arma|pistola|fuzil|rifle|submetra|escopeta/, Crosshair],
  [/colete|municao|muni|escudo|protecao/, Shield],
  [/material|materiais|insumo|pecas/, Package],
  [/droga|quimic|substanc/, FlaskConical],
  [/extra|diverso|outro/, Box],
];

/** Ícone do cartão do item: pelo nome do item e, se nada casar, pela categoria; senão, uma caixa genérica. */
export function iconeDoItem(categoriaNome: string, itemNome: string): LucideIcon {
  const item = normalizar(itemNome);
  const categoria = normalizar(categoriaNome);
  for (const [padrao, icone] of POR_ITEM) if (padrao.test(item)) return icone;
  for (const [padrao, icone] of POR_CATEGORIA) if (padrao.test(categoria) || padrao.test(item)) return icone;
  return Box;
}

export function iconeDaCategoria(categoriaNome: string): LucideIcon {
  for (const [padrao, icone] of POR_CATEGORIA) if (padrao.test(normalizar(categoriaNome))) return icone;
  return Box;
}
