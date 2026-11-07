export type TipoBau = 'membros' | 'gerencia';
export type AlvoZerar = TipoBau | 'ambos';
export type TipoCaixa = 'sujo' | 'limpo';
export type AcaoCaixa = 'entrada' | 'saida';
export type EscopoLog = TipoBau | 'caixa';
export type NivelAcesso = 1 | 2 | 3;
export type Nivel = 0 | NivelAcesso;

export interface UsuarioRef {
  id: string;
  nome: string;
}

export interface UsuarioSessao extends UsuarioRef {
  nivel: NivelAcesso;
}

export interface ItemCatalogo {
  id: string;
  nome: string;
}

export type AcaoLogBau = 'adicionar' | 'remover' | 'zerar' | 'ajuste' | 'catalogo_remover';

export interface LogBau {
  acao: AcaoLogBau;
  usuario: UsuarioRef;
  data: string;
  versao: number;
  categoriaId: string | null;
  itemId: string | null;
  nomeItem: string | null;
  nomeCategoria: string | null;
  quantidade: number | null;
  saldoResultante: number | null;
  resumo: string | null;
  auditoriaId: string | null;
}

export interface LogCaixa {
  acao: AcaoCaixa;
  tipo: TipoCaixa;
  valor: number;
  anotacao: string;
  saldoResultante: number;
  usuario: UsuarioRef;
  data: string;
}

export type AcaoAuditoria = 'catalogo.adicionar_item' | 'catalogo.remover_item' | 'bau.zerar' | 'bau.ajuste_massa';

export interface CatalogoDTO {
  categorias: Array<{ id: string; nome: string; emoji: string; itens: ItemCatalogo[]; total: number }>;
}

export interface BauDTO {
  tipo: TipoBau;
  versao: number;
  categorias: Array<{
    id: string;
    nome: string;
    emoji: string;
    itens: Array<{ id: string; nome: string; quantidade: number }>;
  }>;
}

export interface MovimentoBauDTO {
  categoriaId: string;
  itemId: string;
  quantidade: number;
  versao: number;
}

export interface SaldoDTO {
  sujo: number;
  limpo: number;
}

export interface PreviaAjusteDTO {
  tipo: TipoBau;
  versao: number;
  alterados: number;
  linhas: Array<{ categoriaId: string; itemId: string; nome: string; antes: number; depois: number }>;
}

export interface ConfirmacaoAjusteDTO {
  alterados: number;
  versao: number;
  auditoriaId: string | null;
}

export interface ZerarDTO {
  alvos: TipoBau[];
  itens: number;
  unidades: number;
  auditoriaId: string;
}

export type LogDTO = ({ id: string } & LogBau) | ({ id: string } & LogCaixa);

export interface AuditoriaResumoDTO {
  id: string;
  acao: AcaoAuditoria;
  usuario: UsuarioRef;
  data: string;
  resumo: string;
}

export interface AuditoriaDetalheDTO extends AuditoriaResumoDTO {
  alvo: unknown;
  antes: unknown;
  depois: unknown;
}

export interface Pagina<T> {
  itens: T[];
  proximoCursor: string | null;
}

export interface CsrfDTO {
  csrf: string;
}

export type RespostaApi<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; codigo: string; detalhes?: unknown };

export interface EstadoDrogaDTO {
  tipo: TipoBau;
  versao: number;
  /** Unidades de Saco de Meta no baú. */
  estoque: number;
  /** Quanto o usuário ainda precisa depositar no caixa. */
  minhaPendencia: number;
}

export interface ResultadoDrogaDTO {
  estoque: number;
  versao: number;
  /** Valor a cobrar por esta retirada (0 quando não cobra). */
  esperado: number;
  /** Quanto o usuário ainda deve depositar depois desta operação. */
  devido: number;
}

export interface PendenciaDTO {
  usuarioId: string;
  nome: string;
  devido: number;
  desde: string | null;
}

export interface LinhaRankingDTO {
  usuarioId: string;
  nome: string;
  valor: number;
}

export interface LinhaVendaDTO {
  usuarioId: string;
  nome: string;
  vendido: number;
  depositado: number;
  /** Quanto falta depositar (0 se depositou tudo). */
  falta: number;
}

export interface DadosDTO {
  /** Quantos registros de cada tipo foram lidos (limite de leitura). */
  amostra: { droga: number; caixa: number };
  retiradasDroga: LinhaRankingDTO[];
  depositosCaixa: LinhaRankingDTO[];
  retiradasCaixa: LinhaRankingDTO[];
  vendas: LinhaVendaDTO[];
  pendentes: PendenciaDTO[];
}
