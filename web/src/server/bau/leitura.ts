import 'server-only';
import type { BauDTO } from '@/compartilhado/api-tipos';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { garantirCatalogo } from '../catalogo/semente';
import { lerCatalogoDoc } from '../catalogo/leitura';
import { exigirTipoBau, lerDocBau, mapaDaCategoria, refBau, refCatalogo } from '../dominio/refs';

export const NOME_ITEM_REMOVIDO = 'Item removido';

const porNome = (a: { id: string; nome: string }, b: { id: string; nome: string }): number =>
  a.nome.localeCompare(b.nome, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function lerBau(tipo: unknown): Promise<BauDTO> {
  const t = exigirTipoBau(tipo);
  await garantirCatalogo();
  const db = getDb();
  const [snapCatalogo, snapBau] = await Promise.all([refCatalogo(db).get(), refBau(db, t).get()]);
  if (!snapCatalogo.exists || !snapBau.exists) throw new ErroApp('INTERNO');
  const catalogo = lerCatalogoDoc(snapCatalogo.data());
  const bau = lerDocBau(snapBau.data());
  return {
    tipo: t,
    versao: bau.versao,
    categorias: catalogo.categorias.map((c) => {
      const nomes = new Map(c.itens.map((i) => [i.id, i.nome]));
      const itens = Object.entries(mapaDaCategoria(bau.itens, c.id) ?? {})
        .map(([id, quantidade]) => ({ id, nome: nomes.get(id) ?? NOME_ITEM_REMOVIDO, quantidade }))
        .sort(porNome);
      return { id: c.id, nome: c.nome, emoji: c.emoji, itens };
    }),
  };
}
