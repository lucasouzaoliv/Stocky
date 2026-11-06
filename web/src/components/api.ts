import type { CodigoErro } from '@/compartilhado/erros';

/** Código extra, só do cliente: a requisição nem chegou ao servidor. */
export type CodigoErroCliente = CodigoErro | 'REDE';

export interface DetalhesApi {
  linhas?: Array<{ indice: number; categoriaId?: string; itemId?: string; motivo: string }>;
  retryAfter?: number;
}

export type ResultadoApi<T> =
  | { ok: true; dados: T }
  | { ok: false; codigo: CodigoErroCliente; mensagem: string; status: number; detalhes?: DetalhesApi };

export interface OpcoesApi {
  /** Token CSRF já conhecido (ex.: vindo do layout protegido). Sem ele, busca em GET /api/csrf. */
  csrf?: string;
  signal?: AbortSignal;
}

export interface DependenciasApi {
  fetch?: typeof fetch;
  /** Navegação completa (troca de página); no navegador usa window.location.assign. */
  navegar?: (url: string) => void;
  caminhoAtual?: () => string;
}

export const MENSAGEM_SEM_CONEXAO = 'Sem conexão. Verifique sua internet e tente de novo.';
export const MENSAGEM_GENERICA = 'Ocorreu um erro. Tente de novo em instantes.';

const MENSAGENS_FIXAS: Partial<Record<CodigoErroCliente, string>> = {
  SEM_PERMISSAO: 'Você não tem permissão para fazer isso.',
  CSRF: 'Não foi possível confirmar a sua sessão. Recarregue a página e tente de novo.',
  LIMITE_REQUISICOES: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  VERSAO_DESATUALIZADA: 'Os dados mudaram enquanto você editava. Recarregue e confira de novo.',
  REDE: MENSAGEM_SEM_CONEXAO,
};

const METODOS_SEM_CORPO = new Set(['GET', 'HEAD']);

function textoSeguro(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() && valor.length <= 300 ? valor : null;
}

function mensagemPara(status: number, codigo: CodigoErroCliente, textoServidor: string | null, retryAfter?: number): string {
  if (codigo === 'LIMITE_REQUISICOES' || status === 429) {
    return retryAfter && retryAfter > 0
      ? `Muitas tentativas. Aguarde ${Math.ceil(retryAfter)} s e tente de novo.`
      : MENSAGENS_FIXAS.LIMITE_REQUISICOES!;
  }
  if (status === 403) return MENSAGENS_FIXAS[codigo] ?? MENSAGENS_FIXAS.SEM_PERMISSAO!;
  if (status >= 500) return MENSAGEM_GENERICA;
  return textoServidor ?? MENSAGENS_FIXAS[codigo] ?? MENSAGEM_GENERICA;
}

function falha(codigo: CodigoErroCliente, mensagem: string, status: number, detalhes?: DetalhesApi): ResultadoApi<never> {
  return { ok: false, codigo, mensagem, status, ...(detalhes ? { detalhes } : {}) };
}

export function criarClienteApi(deps: DependenciasApi = {}) {
  const buscar = (...args: Parameters<typeof fetch>) => (deps.fetch ?? globalThis.fetch)(...args);
  const navegar = deps.navegar ?? ((url: string) => window.location.assign(url));
  const caminhoAtual = deps.caminhoAtual ?? (() => window.location.pathname);
  let csrfEmMemoria: string | undefined;

  async function lerCorpo(resposta: Response): Promise<{ ok?: boolean; dados?: unknown; erro?: unknown; codigo?: unknown; detalhes?: unknown } | null> {
    try {
      const corpo: unknown = await resposta.json();
      return corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  async function obterCsrf(opcoes: OpcoesApi | undefined, renovar: boolean): Promise<string | null> {
    if (opcoes?.csrf && !renovar) return opcoes.csrf;
    if (csrfEmMemoria && !renovar) return csrfEmMemoria;
    try {
      const resposta = await buscar('/api/csrf', { method: 'GET', headers: { accept: 'application/json' }, signal: opcoes?.signal });
      const corpo = await lerCorpo(resposta);
      const token = (corpo?.dados as { csrf?: unknown } | undefined)?.csrf;
      if (resposta.ok && typeof token === 'string' && token) {
        csrfEmMemoria = token;
        return token;
      }
    } catch {
      /* cai no retorno nulo; a chamada principal reporta o erro */
    }
    return null;
  }

  async function enviar<T>(metodo: string, url: string, corpo: unknown, opcoes: OpcoesApi | undefined, tentouRenovar: boolean): Promise<ResultadoApi<T>> {
    const mutacao = !METODOS_SEM_CORPO.has(metodo);
    const headers: Record<string, string> = { accept: 'application/json' };
    const init: RequestInit = { method: metodo, headers, credentials: 'same-origin', signal: opcoes?.signal };

    if (mutacao) {
      const token = await obterCsrf(opcoes, tentouRenovar);
      if (!token) return falha('REDE', MENSAGEM_SEM_CONEXAO, 0);
      headers['content-type'] = 'application/json';
      headers['x-csrf-token'] = token;
      init.body = JSON.stringify(corpo ?? {});
    }

    let resposta: Response;
    try {
      resposta = await buscar(url, init);
    } catch {
      return falha('REDE', MENSAGEM_SEM_CONEXAO, 0);
    }

    const dadosCorpo = await lerCorpo(resposta);
    if (resposta.ok && dadosCorpo?.ok !== false) {
      return { ok: true, dados: (dadosCorpo?.dados ?? {}) as T };
    }

    const codigo = (typeof dadosCorpo?.codigo === 'string' ? dadosCorpo.codigo : 'INTERNO') as CodigoErroCliente;
    const status = resposta.status;

    if (status === 401) {
      if (codigo === 'REVALIDAR') {
        navegar(`/api/auth/login?volta=${encodeURIComponent(caminhoAtual())}`);
        return falha('REVALIDAR', 'Sua sessão precisa ser confirmada. Redirecionando…', 401);
      }
      navegar('/login');
      return falha('SEM_SESSAO', 'Sua sessão expirou. Entre de novo.', 401);
    }

    if (status === 403 && codigo === 'CSRF' && mutacao && !tentouRenovar) {
      csrfEmMemoria = undefined;
      return enviar<T>(metodo, url, corpo, { ...opcoes, csrf: undefined }, true);
    }

    const detalhes = dadosCorpo?.detalhes && typeof dadosCorpo.detalhes === 'object' ? (dadosCorpo.detalhes as DetalhesApi) : undefined;
    const retryAfterCabecalho = Number(resposta.headers?.get?.('retry-after'));
    const retryAfter = detalhes?.retryAfter ?? (Number.isFinite(retryAfterCabecalho) ? retryAfterCabecalho : undefined);
    return falha(codigo, mensagemPara(status, codigo, textoSeguro(dadosCorpo?.erro), retryAfter), status, detalhes);
  }

  return {
    get: <T>(url: string, opcoes?: OpcoesApi) => enviar<T>('GET', url, undefined, opcoes, false),
    post: <T>(url: string, corpo?: unknown, opcoes?: OpcoesApi) => enviar<T>('POST', url, corpo, opcoes, false),
    put: <T>(url: string, corpo?: unknown, opcoes?: OpcoesApi) => enviar<T>('PUT', url, corpo, opcoes, false),
    patch: <T>(url: string, corpo?: unknown, opcoes?: OpcoesApi) => enviar<T>('PATCH', url, corpo, opcoes, false),
    delete: <T>(url: string, opcoes?: OpcoesApi) => enviar<T>('DELETE', url, undefined, opcoes, false),
  };
}

export type ClienteApi = ReturnType<typeof criarClienteApi>;

/** Instância padrão do navegador. */
export const api: ClienteApi = criarClienteApi();
