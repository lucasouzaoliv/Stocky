import 'server-only';
import type { MovimentoBauDTO } from '@/compartilhado/api-tipos';
import { LIMITES } from '@/compartilhado/limites';
import { formatarNumero } from '@/compartilhado/formatacao';
import { parseInteiro } from '@/compartilhado/numero';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { garantirCatalogo } from '../catalogo/semente';
import { lerCatalogoTx } from '../catalogo/leitura';
import { exigirTipoBau, lerDocBau, refBau } from '../dominio/refs';
import type { TipoBau, UsuarioRef } from '../dominio/tipos';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento } from '../webhooks/eventos';
import { ehIdSeguro } from '../validacao/item';

export interface PedidoMovimentoBau {
  tipo: TipoBau;
  categoriaId: string;
  itemId: string;
  quantidade: unknown;
}

type Sentido = 'adicionar' | 'remover';

async function movimentar(sentido: Sentido, p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<ComEvento<MovimentoBauDTO>> {
  const tipo = exigirTipoBau(p.tipo);
  if (!ehIdSeguro(p.categoriaId) || !ehIdSeguro(p.itemId)) throw new ErroApp('VALIDACAO', 'Item inválido.');
  const q = parseInteiro(p.quantidade, { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
  if (!q.ok) throw new ErroApp('VALIDACAO', q.erro);
  const quem: UsuarioRef = { id: usuario.id, nome: usuario.nome };
  const { categoriaId, itemId } = p;

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const catalogo = await lerCatalogoTx(tx, db);
    const snap = await tx.get(refBau(db, tipo));
    if (!snap.exists) throw new ErroApp('INTERNO');

    const categoria = catalogo.categorias.find((c) => c.id === categoriaId);
    if (!categoria) throw new ErroApp('NAO_ENCONTRADO', 'Categoria não encontrada.');
    const item = categoria.itens.find((i) => i.id === itemId);
    if (!item) throw new ErroApp('NAO_ENCONTRADO', 'Item não encontrado nesta categoria.');

    const bau = lerDocBau(snap.data());
    const atual = bau.itens[categoriaId]?.[itemId] ?? 0;
    let novo: number;
    if (sentido === 'adicionar') {
      novo = atual + q.valor;
      if (!Number.isSafeInteger(novo)) {
        throw new ErroApp('VALIDACAO', 'A quantidade passaria do limite permitido para o baú.');
      }
    } else {
      if (atual === 0) throw new ErroApp('NAO_ENCONTRADO', 'O item não está no baú.');
      if (q.valor > atual) {
        throw new ErroApp('ESTOQUE_INSUFICIENTE', `Estoque insuficiente. Disponível: ${formatarNumero(atual)}.`);
      }
      novo = atual - q.valor;
    }

    const categoriaItens = { ...(bau.itens[categoriaId] ?? {}) };
    if (novo === 0) delete categoriaItens[itemId];
    else categoriaItens[itemId] = novo;
    const itens = { ...bau.itens };
    if (Object.keys(categoriaItens).length === 0) delete itens[categoriaId];
    else itens[categoriaId] = categoriaItens;

    const versao = bau.versao + 1;
    tx.set(refBau(db, tipo), { versao, itens, atualizadoEm: new Date().toISOString() });
    const { log } = registrarLogTxCompleto(tx, db, tipo, {
      acao: sentido,
      usuario: quem,
      versao,
      categoriaId,
      itemId,
      nomeItem: item.nome,
      nomeCategoria: categoria.nome,
      quantidade: q.valor,
      saldoResultante: novo,
      resumo: null,
      auditoriaId: null,
    });
    return {
      dto: { categoriaId, itemId, quantidade: novo, versao },
      eventos: [{ tipo: 'bau.movimento', bau: tipo, log }],
    };
  });
}

export const adicionarAoBauComEvento = (p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<ComEvento<MovimentoBauDTO>> =>
  movimentar('adicionar', p, usuario);

export const removerDoBauComEvento = (p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<ComEvento<MovimentoBauDTO>> =>
  movimentar('remover', p, usuario);

export async function adicionarAoBau(p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<MovimentoBauDTO> {
  return (await adicionarAoBauComEvento(p, usuario)).dto;
}

export async function removerDoBau(p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<MovimentoBauDTO> {
  return (await removerDoBauComEvento(p, usuario)).dto;
}
