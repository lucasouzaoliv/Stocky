import 'server-only';
import type { AcaoAuditoria, ItemCatalogo, UsuarioRef } from '@/compartilhado/api-tipos';

export type {
  AcaoAuditoria,
  AcaoCaixa,
  AcaoLogBau,
  AlvoZerar,
  EscopoLog,
  ItemCatalogo,
  LogBau,
  LogCaixa,
  Nivel,
  NivelAcesso,
  TipoBau,
  TipoCaixa,
  UsuarioRef,
  UsuarioSessao,
} from '@/compartilhado/api-tipos';

export interface CategoriaCatalogo {
  id: string;
  nome: string;
  emoji: string;
  itens: ItemCatalogo[];
}

export interface DocCatalogo {
  categorias: CategoriaCatalogo[];
  atualizadoEm: string;
}

export interface DocBau {
  versao: number;
  itens: Record<string, Record<string, number>>;
  atualizadoEm: string;
}

export interface DocSaldo {
  sujo: number;
  limpo: number;
  versao: number;
  atualizadoEm: string;
}

export interface DocAuditoria {
  acao: AcaoAuditoria;
  usuario: UsuarioRef;
  data: string;
  alvo: Record<string, string | string[]>;
  resumo: string;
  antes: unknown;
  depois: unknown;
}

export type ChaveMensagem = 'inventario_membros' | 'inventario_gerencia' | 'saldo_caixa';

export interface DocMensagemFixa {
  mensagemId: string | null;
  reservadoAte: string | null;
  atualizadoEm: string;
}
