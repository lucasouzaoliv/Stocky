import { montarPedido, type PedidoTeste } from './pedidos';

type Rota = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface RespostaRota {
  status: number;
  corpo: { ok: boolean; dados?: unknown; erro?: string; codigo?: string; detalhes?: unknown };
  texto: string;
  res: Response;
}

/** Chama o handler exportado pela rota com os parâmetros dinâmicos já resolvidos, como o Next faria. */
export async function chamarRota(
  rota: unknown,
  p: PedidoTeste & { params?: Record<string, string> },
): Promise<RespostaRota> {
  const req = await montarPedido(p);
  const res = await (rota as Rota)(req, { params: Promise.resolve(p.params ?? {}) });
  const texto = await res.clone().text();
  return { status: res.status, corpo: JSON.parse(texto) as RespostaRota['corpo'], texto, res };
}
