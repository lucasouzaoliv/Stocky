import 'server-only';
import type { CodigoErro } from '@/compartilhado/erros';

export type { CodigoErro };

export type DetalhesErro = {
  linhas?: Array<{ indice: number; categoriaId?: string; itemId?: string; motivo: string }>;
  retryAfter?: number;
};

const STATUS: Readonly<Record<CodigoErro, number>> = {
  VALIDACAO: 400,
  SEM_SESSAO: 401,
  REVALIDAR: 401,
  SEM_PERMISSAO: 403,
  CSRF: 403,
  NAO_ENCONTRADO: 404,
  METODO: 405,
  ESTOQUE_INSUFICIENTE: 409,
  SALDO_INSUFICIENTE: 409,
  DUPLICADO: 409,
  LIMITE_CATEGORIA: 409,
  VERSAO_DESATUALIZADA: 409,
  CORPO_GRANDE: 413,
  TIPO_CONTEUDO: 415,
  LIMITE_REQUISICOES: 429,
  INTERNO: 500,
};

export const MENSAGEM_INTERNA = 'Ocorreu um erro. Tente de novo em instantes.';

const MENSAGENS_PADRAO: Readonly<Record<CodigoErro, string>> = {
  VALIDACAO: 'Os dados enviados são inválidos.',
  SEM_SESSAO: 'Entre com o Discord para continuar.',
  REVALIDAR: 'Sua sessão precisa ser confirmada de novo.',
  SEM_PERMISSAO: 'Você não tem permissão para fazer isso.',
  CSRF: 'Requisição recusada por segurança. Recarregue a página e tente de novo.',
  NAO_ENCONTRADO: 'Não encontrado.',
  METODO: 'Método não permitido.',
  ESTOQUE_INSUFICIENTE: 'Estoque insuficiente.',
  SALDO_INSUFICIENTE: 'Saldo insuficiente.',
  DUPLICADO: 'Este item já existe.',
  LIMITE_CATEGORIA: 'A categoria já atingiu o limite de itens.',
  VERSAO_DESATUALIZADA: 'O baú mudou desde a prévia. Refaça o ajuste.',
  CORPO_GRANDE: 'Os dados enviados são grandes demais.',
  TIPO_CONTEUDO: 'Tipo de conteúdo não aceito.',
  LIMITE_REQUISICOES: 'Muitas requisições. Aguarde um pouco e tente de novo.',
  INTERNO: MENSAGEM_INTERNA,
};

export class ErroApp extends Error {
  readonly codigo: CodigoErro;
  readonly status: number;
  readonly detalhes?: DetalhesErro;

  constructor(codigo: CodigoErro, mensagem?: string, detalhes?: DetalhesErro) {
    super(mensagem ?? MENSAGENS_PADRAO[codigo]);
    this.name = 'ErroApp';
    this.codigo = codigo;
    this.status = STATUS[codigo];
    if (detalhes !== undefined) this.detalhes = detalhes;
  }
}

export function paraErroApp(e: unknown): ErroApp {
  if (e instanceof ErroApp) return e;
  return new ErroApp('INTERNO');
}
