import 'server-only';
import { z } from 'zod';
import { ErroApp } from '../erros';
import { ehIdSeguro } from './item';

/** Valida a forma do corpo. A mensagem ao usuário é fixa: o texto do zod nunca sai do servidor. */
export function validarCorpo<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroApp('VALIDACAO', 'Os dados enviados são inválidos.');
  return r.data;
}

const idSeguro = z.string().refine(ehIdSeguro);
const numeroOuTexto = z.union([z.number(), z.string()]);

/** Quantidade e valor chegam crus (número ou texto) e são validados por `parseInteiro` no serviço. */
export const esquemaMovimentoBau = z.strictObject({
  categoriaId: idSeguro,
  itemId: idSeguro,
  quantidade: numeroOuTexto,
});

export const esquemaMovimentoCaixa = z.strictObject({
  tipo: z.string(),
  acao: z.string(),
  valor: numeroOuTexto,
  anotacao: z.string(),
});

/** Novo item: o nome é validado por `validarNomeItem` no serviço (tamanho, caracteres, id gerado). */
export const esquemaNovoItem = z.strictObject({
  categoriaId: idSeguro,
  nome: z.string(),
});

export const esquemaZerar = z.strictObject({
  alvo: z.string(),
  confirmacao: z.string(),
});

/**
 * Cada linha é conferida pelo serviço, que lista TODAS as inválidas em `detalhes.linhas`;
 * aqui só se exige a forma (objeto com as três chaves e nenhuma a mais).
 */
const linhaAjuste = z.strictObject({
  categoriaId: z.unknown(),
  itemId: z.unknown(),
  quantidade: z.unknown(),
});

export const esquemaPrevia = z.strictObject({
  linhas: z.array(linhaAjuste),
});

export const esquemaConfirmar = z.strictObject({
  versao: z.number(),
  linhas: z.array(linhaAjuste),
});
