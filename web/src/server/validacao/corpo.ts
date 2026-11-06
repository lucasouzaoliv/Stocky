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
