import 'server-only';
import { NOME_DO_BAU, TIPOS_BAU, type ZerarDTO } from '@/compartilhado/api-tipos';
import { registrarAuditoriaTx } from '../auditoria/registrar';
import { ErroApp } from '../erros';
import { getDb } from '../firebase';
import { garantirCatalogo } from '../catalogo/semente';
import { exigirAlvoZerar, lerDocBau, refBau } from '../dominio/refs';
import type { DocBau, TipoBau, UsuarioSessao } from '../dominio/tipos';
import { registrarLogTxCompleto } from '../logs/registrar';
import type { ComEvento, EventoDominio } from '../webhooks/eventos';

function contar(bau: DocBau): { itens: number; unidades: number } {
  let itens = 0;
  let unidades = 0;
  for (const mapa of Object.values(bau.itens)) {
    for (const qtd of Object.values(mapa)) {
      itens += 1;
      unidades += qtd;
    }
  }
  return { itens, unidades };
}

/**
 * Zera um baú ou os dois em UMA transação (WEB-038, ADR-16): uma auditoria com o conteúdo anterior,
 * um log por baú, `versao` +1 em cada baú alvo. Baú já vazio é válido. Exclusiva do dono.
 */
export async function zerarBauComEvento(alvo: unknown, usuario: UsuarioSessao): Promise<ComEvento<ZerarDTO>> {
  if (typeof usuario?.id !== 'string' || !usuario.id || typeof usuario.nome !== 'string' || !usuario.nome) {
    throw new ErroApp('INTERNO');
  }
  if (usuario.nivel !== 3) throw new ErroApp('SEM_PERMISSAO');
  const escolhido = exigirAlvoZerar(alvo);
  const alvos: TipoBau[] = escolhido === 'ambos' ? [...TIPOS_BAU] : [escolhido];
  const quem = { id: usuario.id, nome: usuario.nome };

  await garantirCatalogo();
  const db = getDb();
  return await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(alvos.map((t) => tx.get(refBau(db, t))));
    const baus = snaps.map((s) => {
      if (!s.exists) throw new ErroApp('INTERNO');
      return lerDocBau(s.data());
    });

    const agora = new Date().toISOString();
    const antes: Record<string, DocBau['itens']> = {};
    let itens = 0;
    let unidades = 0;
    alvos.forEach((tipo, i) => {
      const bau = baus[i]!;
      antes[tipo] = bau.itens;
      const c = contar(bau);
      itens += c.itens;
      unidades += c.unidades;
      tx.set(refBau(db, tipo), { versao: bau.versao + 1, itens: {}, atualizadoEm: agora });
    });

    const nomes = alvos.map((t) => NOME_DO_BAU[t]).join(' e ');
    const resumo = `Zerou ${nomes}: ${itens} itens, ${unidades} unidades.`;
    const auditoriaId = registrarAuditoriaTx(tx, db, {
      acao: 'bau.zerar',
      usuario: quem,
      alvo: { alvos },
      resumo,
      antes,
      depois: {},
    });
    const eventos: EventoDominio[] = [];
    alvos.forEach((tipo, i) => {
      const c = contar(baus[i]!);
      const { log } = registrarLogTxCompleto(tx, db, tipo, {
        acao: 'zerar',
        usuario: quem,
        versao: baus[i]!.versao + 1,
        categoriaId: null,
        itemId: null,
        nomeItem: null,
        nomeCategoria: null,
        quantidade: null,
        saldoResultante: null,
        resumo: `Baú zerado: ${c.itens} itens, ${c.unidades} unidades.`,
        auditoriaId,
      });
      eventos.push({ tipo: 'bau.aviso', baus: [tipo], log });
    });
    return { dto: { alvos, itens, unidades, auditoriaId }, eventos };
  });
}

export async function zerarBau(alvo: unknown, usuario: UsuarioSessao): Promise<ZerarDTO> {
  return (await zerarBauComEvento(alvo, usuario)).dto;
}
