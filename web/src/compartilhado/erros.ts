export const CODIGOS_ERRO = [
  'VALIDACAO',
  'SEM_SESSAO',
  'REVALIDAR',
  'SEM_PERMISSAO',
  'CSRF',
  'NAO_ENCONTRADO',
  'ESTOQUE_INSUFICIENTE',
  'SALDO_INSUFICIENTE',
  'DUPLICADO',
  'LIMITE_CATEGORIA',
  'VERSAO_DESATUALIZADA',
  'METODO',
  'CORPO_GRANDE',
  'TIPO_CONTEUDO',
  'LIMITE_REQUISICOES',
  'INTERNO',
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

export const MENSAGENS_LOGIN: Readonly<Record<string, string>> = Object.freeze({
  state: 'Não foi possível confirmar o login. Tente entrar de novo.',
  negado: 'Você cancelou a autorização no Discord.',
  sem_acesso: 'Você não tem acesso a este site. Fale com a liderança da facção.',
  discord: 'O Discord não respondeu como esperado. Tente de novo em instantes.',
});
