import 'server-only';
import type { SaldoDTO } from '@/compartilhado/api-tipos';
import { formatarDinheiro } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { garantirCatalogo } from '../catalogo/semente';
import { lerDocSaldo, refSaldo } from '../dominio/refs';
import type { AcaoCaixa, TipoCaixa, UsuarioRef } from '../dominio/tipos';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento } from '../webhooks/eventos';
import { normalizarAnotacao } from '../validacao/texto';

export interface PedidoCaixa {
  tipo: unknown;
  acao: unknown;
  valor: unknown;
  anotacao: unknown;
}

/** Movimenta o caixa e devolve também o aviso a publicar depois do commit (WEB-051). */
export async function movimentarCaixaComEvento(p: PedidoCaixa, usuario: UsuarioRef): Promise<ComEvento<SaldoDTO>> {
  if (p.tipo !== 'sujo' && p.tipo !== 'limpo') throw new ErroApp('VALIDACAO', 'Tipo de dinheiro inválido.');
  if (p.acao !== 'entrada' && p.acao !== 'saida') throw new ErroApp('VALIDACAO', 'Ação inválida.');
  const tipo: TipoCaixa = p.tipo;
  const acao: AcaoCaixa = p.acao;
  const v = parseInteiro(p.valor, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
  if (!v.ok) throw new ErroApp('VALIDACAO', v.erro);
  const anotacao = normalizarAnotacao(p.anotacao);
  const quem: UsuarioRef = { id: usuario.id, nome: usuario.nome };

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const saldo = lerDocSaldo((await tx.get(refSaldo(db))).data());
    const atual = saldo[tipo];
    let novo: number;
    if (acao === 'entrada') {
      novo = atual + v.valor;
      if (!Number.isSafeInteger(novo)) throw new ErroApp('VALIDACAO', 'O saldo passaria do limite permitido.');
    } else {
      if (v.valor > atual) {
        throw new ErroApp('SALDO_INSUFICIENTE', `Saldo insuficiente. Disponível: ${formatarDinheiro(atual)}.`);
      }
      novo = atual - v.valor;
    }
    const resultado = { sujo: saldo.sujo, limpo: saldo.limpo, [tipo]: novo };
    tx.set(refSaldo(db), { ...resultado, versao: saldo.versao + 1, atualizadoEm: new Date().toISOString() });
    const { log } = registrarLogTxCompleto(tx, db, 'caixa', {
      acao,
      tipo,
      valor: v.valor,
      anotacao,
      saldoResultante: novo,
      usuario: quem,
    });
    return { dto: { sujo: resultado.sujo, limpo: resultado.limpo }, eventos: [{ tipo: 'caixa.movimento', log }] };
  });
}

export async function movimentarCaixa(p: PedidoCaixa, usuario: UsuarioRef): Promise<SaldoDTO> {
  return (await movimentarCaixaComEvento(p, usuario)).dto;
}
