import 'server-only';
import { valoresSecretos } from './env';

const MASCARA = '[oculto]';

const PADROES: ReadonlyArray<RegExp> = [
  /https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/gi,
  /[MNO][\w-]{23,25}\.[\w-]{6}\.[\w-]{27,}/g,
  /Bearer\s+[\w.~+/=-]+/gi,
  /\b(code|access_token|refresh_token|client_secret|token)=[^&\s"']+/gi,
];

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mascarar(texto: string): string {
  let saida = texto;
  for (const segredo of valoresSecretos()) {
    saida = saida.replace(new RegExp(escapar(segredo), 'g'), MASCARA);
    const escapado = JSON.stringify(segredo).slice(1, -1);
    if (escapado !== segredo) saida = saida.replace(new RegExp(escapar(escapado), 'g'), MASCARA);
  }
  for (const padrao of PADROES) {
    saida = saida.replace(padrao, (achado) => {
      const igual = achado.indexOf('=');
      return /^(code|access_token|refresh_token|client_secret|token)=/i.test(achado)
        ? `${achado.slice(0, igual + 1)}${MASCARA}`
        : MASCARA;
    });
  }
  return saida;
}

function serializar(valor: unknown): string {
  const vistos = new WeakSet<object>();
  try {
    return JSON.stringify(valor, (_chave, v: unknown) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (typeof v === 'object' && v !== null) {
        if (vistos.has(v)) return '[circular]';
        vistos.add(v);
      }
      return v;
    });
  } catch {
    return '"[não serializável]"';
  }
}

function escrever(nivel: 'info' | 'aviso' | 'erro', msg: string, extra: Record<string, unknown>): void {
  const linha = mascarar(serializar({ nivel, msg, ...extra }));
  if (nivel === 'erro') console.error(linha);
  else if (nivel === 'aviso') console.warn(linha);
  else console.log(linha);
}

export const log = {
  info(msg: string, ctx?: object): void {
    escrever('info', msg, { ctx });
  },
  aviso(msg: string, ctx?: object): void {
    escrever('aviso', msg, { ctx });
  },
  erro(msg: string, e?: unknown, ctx?: object): void {
    escrever('erro', msg, { erro: e, ctx });
  },
};
