import { criarFakeFetch, respostaJson, type ChamadaFetch, type RespostaFake } from './fake-fetch';

export interface MensagemFake {
  id: string;
  canalToken: string;
  payload: { embeds?: unknown[]; allowed_mentions?: unknown; content?: string };
}

/**
 * Discord falso em memória: POST ?wait=true cria mensagem com id novo, PATCH edita (404 se não existe).
 * `interceptar` permite forçar falhas (429, 500, timeout...) por chamada.
 */
export function criarDiscordFake(
  interceptar?: (chamada: ChamadaFetch, indice: number) => RespostaFake | undefined,
) {
  const mensagens = new Map<string, MensagemFake>();
  let seq = 900000000000000000n;
  const f = criarFakeFetch((c, i) => {
    const forcado = interceptar?.(c, i);
    if (forcado !== undefined) return forcado;
    const m = /\/api\/webhooks\/\d+\/([\w-]+)(?:\/messages\/(\d+))?(\?.*)?$/.exec(c.url);
    if (!m) return respostaJson({ message: 'URL desconhecida' }, 404);
    const token = m[1]!;
    const corpo = JSON.parse(c.corpo || '{}') as MensagemFake['payload'];
    if (c.metodo === 'POST') {
      seq += 1n;
      const id = String(seq);
      mensagens.set(id, { id, canalToken: token, payload: corpo });
      return respostaJson({ id });
    }
    if (c.metodo === 'PATCH' && m[2]) {
      const existente = mensagens.get(m[2]);
      if (!existente) return respostaJson({ message: 'Unknown Message', code: 10008 }, 404);
      existente.payload = corpo;
      return respostaJson({ id: existente.id });
    }
    return respostaJson({ message: 'Método não suportado' }, 405);
  });
  return {
    ...f,
    mensagens,
    apagar: (id: string) => mensagens.delete(id),
    posts: () => f.chamadas.filter((c) => c.metodo === 'POST'),
    patches: () => f.chamadas.filter((c) => c.metodo === 'PATCH'),
  };
}
