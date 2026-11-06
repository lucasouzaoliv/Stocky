import { describe, expect, it, vi } from 'vitest';
import { criarClienteApi } from '@/components/api';

function resposta(status: number, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: cabecalhos });
}

function montar(...respostas: Array<Response | Error>) {
  const fila = [...respostas];
  const fetchFalso = vi.fn(async () => {
    const r = fila.shift();
    if (!r) throw new Error('sem resposta preparada');
    if (r instanceof Error) throw r;
    return r;
  });
  const navegar = vi.fn();
  const cliente = criarClienteApi({ fetch: fetchFalso as unknown as typeof fetch, navegar, caminhoAtual: () => '/caixa' });
  return { cliente, fetchFalso, navegar };
}
const chamada = (f: ReturnType<typeof vi.fn>, i: number) => f.mock.calls[i] as unknown as [string, RequestInit];

describe('WEB-052 AC1: mutações e GET', () => {
  it('mutação envia x-csrf-token e Content-Type JSON com o corpo serializado', async () => {
    const { cliente, fetchFalso } = montar(resposta(200, { ok: true, dados: { id: 1 } }));
    const r = await cliente.post('/api/bau/membros/adicionar', { quantidade: 3 }, { csrf: 'tok-falso' });
    expect(r).toEqual({ ok: true, dados: { id: 1 } });
    const [url, init] = chamada(fetchFalso, 0);
    expect(url).toBe('/api/bau/membros/adicionar');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'tok-falso', 'content-type': 'application/json' });
    expect(init.body).toBe('{"quantidade":3}');
  });

  it('DELETE também é mutação e leva o token', async () => {
    const { cliente, fetchFalso } = montar(resposta(200, { ok: true, dados: {} }));
    await cliente.delete('/api/catalogo/itens/a/b', { csrf: 'tok' });
    expect(chamada(fetchFalso, 0)[1].headers).toMatchObject({ 'x-csrf-token': 'tok' });
  });

  it('GET não envia corpo, content-type nem token', async () => {
    const { cliente, fetchFalso } = montar(resposta(200, { ok: true, dados: [1] }));
    const r = await cliente.get('/api/catalogo');
    expect(r).toEqual({ ok: true, dados: [1] });
    const [, init] = chamada(fetchFalso, 0);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const nomes = Object.keys(init.headers as object).map((n) => n.toLowerCase());
    expect(nomes).not.toContain('content-type');
    expect(nomes).not.toContain('x-csrf-token');
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('sem token conhecido, busca em /api/csrf uma vez e reaproveita', async () => {
    const { cliente, fetchFalso } = montar(
      resposta(200, { ok: true, dados: { csrf: 'buscado' } }),
      resposta(200, { ok: true, dados: {} }),
      resposta(200, { ok: true, dados: {} }),
    );
    await cliente.post('/api/x', {});
    await cliente.post('/api/y', {});
    expect(chamada(fetchFalso, 0)[0]).toBe('/api/csrf');
    expect(chamada(fetchFalso, 1)[1].headers).toMatchObject({ 'x-csrf-token': 'buscado' });
    expect(chamada(fetchFalso, 2)[1].headers).toMatchObject({ 'x-csrf-token': 'buscado' });
    expect(fetchFalso).toHaveBeenCalledTimes(3);
  });

  it('403 CSRF renova o token e tenta de novo uma única vez', async () => {
    const { cliente, fetchFalso } = montar(
      resposta(403, { ok: false, erro: 'x', codigo: 'CSRF' }),
      resposta(200, { ok: true, dados: { csrf: 'novo' } }),
      resposta(200, { ok: true, dados: { feito: true } }),
    );
    const r = await cliente.post('/api/x', {}, { csrf: 'velho' });
    expect(r).toEqual({ ok: true, dados: { feito: true } });
    expect(chamada(fetchFalso, 2)[1].headers).toMatchObject({ 'x-csrf-token': 'novo' });
  });
});

describe('WEB-052 AC2: 401, 403, 409 e 429', () => {
  it('401 SEM_SESSAO vai para /login', async () => {
    const { cliente, navegar } = montar(resposta(401, { ok: false, erro: 'x', codigo: 'SEM_SESSAO' }));
    const r = await cliente.get('/api/caixa');
    expect(navegar).toHaveBeenCalledWith('/login');
    expect(r).toMatchObject({ ok: false, codigo: 'SEM_SESSAO', status: 401 });
  });

  it('401 REVALIDAR vai para /api/auth/login com a página atual codificada', async () => {
    const { cliente, navegar } = montar(resposta(401, { ok: false, erro: 'x', codigo: 'REVALIDAR', detalhes: {} }));
    const r = await cliente.get('/api/caixa');
    expect(navegar).toHaveBeenCalledWith('/api/auth/login?volta=%2Fcaixa');
    expect(r).toMatchObject({ ok: false, codigo: 'REVALIDAR' });
  });

  it('403 devolve mensagem em português e não navega', async () => {
    const { cliente, navegar } = montar(resposta(403, { ok: false, erro: 'Forbidden', codigo: 'SEM_PERMISSAO' }));
    const r = await cliente.get('/api/auditoria');
    expect(r).toMatchObject({ ok: false, codigo: 'SEM_PERMISSAO', status: 403, mensagem: 'Você não tem permissão para fazer isso.' });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('409 repassa a mensagem em português do servidor e o código', async () => {
    const { cliente } = montar(resposta(409, { ok: false, erro: 'Estoque insuficiente no baú.', codigo: 'ESTOQUE_INSUFICIENTE' }));
    const r = await cliente.post('/api/bau/membros/remover', {}, { csrf: 't' });
    expect(r).toMatchObject({ ok: false, codigo: 'ESTOQUE_INSUFICIENTE', status: 409, mensagem: 'Estoque insuficiente no baú.' });
  });

  it('409 sem texto usa mensagem fixa', async () => {
    const { cliente } = montar(resposta(409, { ok: false, codigo: 'VERSAO_DESATUALIZADA' }));
    const r = await cliente.post('/api/x', {}, { csrf: 't' });
    expect(r).toMatchObject({ ok: false, mensagem: expect.stringContaining('Recarregue') });
  });

  it('429 avisa com o tempo de espera (detalhes.retryAfter)', async () => {
    const { cliente } = montar(resposta(429, { ok: false, erro: 'x', codigo: 'LIMITE_REQUISICOES', detalhes: { retryAfter: 12 } }, { 'retry-after': '12' }));
    const r = await cliente.get('/api/caixa');
    expect(r).toMatchObject({ ok: false, status: 429, codigo: 'LIMITE_REQUISICOES', mensagem: 'Muitas tentativas. Aguarde 12 s e tente de novo.' });
  });

  it('429 sem tempo usa aviso genérico; detalhes de validação são preservados no 400', async () => {
    const a = montar(resposta(429, { ok: false, codigo: 'LIMITE_REQUISICOES' }));
    expect(await a.cliente.get('/api/x')).toMatchObject({ mensagem: 'Muitas tentativas. Aguarde um pouco e tente de novo.' });
    const linhas = [{ indice: 0, motivo: 'inválida' }];
    const b = montar(resposta(400, { ok: false, erro: 'Dados inválidos.', codigo: 'VALIDACAO', detalhes: { linhas } }));
    expect(await b.cliente.post('/api/x', {}, { csrf: 't' })).toMatchObject({ status: 400, detalhes: { linhas } });
  });

  it('500 e corpo que não é JSON dão mensagem genérica, sem texto técnico', async () => {
    const a = montar(resposta(500, { ok: false, erro: 'stack: at Object.<anonymous>', codigo: 'INTERNO' }));
    const ra = await a.cliente.get('/api/x');
    expect(ra).toMatchObject({ ok: false, mensagem: 'Ocorreu um erro. Tente de novo em instantes.' });
    const b = montar(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const rb = await b.cliente.get('/api/x');
    expect(rb).toMatchObject({ ok: false, mensagem: 'Ocorreu um erro. Tente de novo em instantes.' });
  });
});

describe('WEB-052 AC3: falha de rede', () => {
  it('devolve "sem conexão" sem lançar', async () => {
    const { cliente, navegar } = montar(new TypeError('Failed to fetch'));
    const r = await cliente.get('/api/caixa');
    expect(r).toMatchObject({ ok: false, codigo: 'REDE', status: 0, mensagem: 'Sem conexão. Verifique sua internet e tente de novo.' });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('mutação com rede fora também não lança', async () => {
    const { cliente } = montar(new TypeError('Failed to fetch'));
    await expect(cliente.post('/api/x', {}, { csrf: 't' })).resolves.toMatchObject({ ok: false, codigo: 'REDE' });
  });

  it('falha ao buscar o token CSRF não lança', async () => {
    const { cliente } = montar(new TypeError('Failed to fetch'));
    await expect(cliente.post('/api/x', {})).resolves.toMatchObject({ ok: false, codigo: 'REDE' });
  });
});

describe('WEB-052 AC4: sem cookies manuais nem localStorage', () => {
  it('não lê nem grava document.cookie e não toca localStorage/sessionStorage', async () => {
    const lerCookie = vi.spyOn(document, 'cookie', 'get');
    const gravarCookie = vi.spyOn(document, 'cookie', 'set');
    const ls = vi.spyOn(Storage.prototype, 'getItem');
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const { cliente } = montar(resposta(200, { ok: true, dados: { csrf: 'a' } }), resposta(200, { ok: true, dados: {} }));
    await cliente.post('/api/x', {});
    expect(lerCookie).not.toHaveBeenCalled();
    expect(gravarCookie).not.toHaveBeenCalled();
    expect(ls).not.toHaveBeenCalled();
    expect(lsSet).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('o código-fonte do cliente não menciona cookie nem Storage', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const fonte = await readFile(path.resolve(process.cwd(), 'src/components/api.ts'), 'utf8');
    expect(fonte).not.toMatch(/document\.cookie|localStorage|sessionStorage/);
  });
});
