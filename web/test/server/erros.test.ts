import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CODIGOS_ERRO, type CodigoErro } from '@/compartilhado/erros';
import { agendar, getFetch, resetContexto, setAgendador, setFetch } from '@/server/contexto';
import { ErroApp, MENSAGEM_INTERNA, paraErroApp } from '@/server/erros';
import { lerJson, responderErro, responderOk } from '@/server/http';
import { log, mascarar } from '@/server/log';
import { aplicarEnvTeste, limparEnvTeste, SEGREDOS_TESTE } from '../helpers/env-teste';

const STATUS: Record<CodigoErro, number> = {
  VALIDACAO: 400, SEM_SESSAO: 401, REVALIDAR: 401, SEM_PERMISSAO: 403, CSRF: 403, NAO_ENCONTRADO: 404, METODO: 405,
  ESTOQUE_INSUFICIENTE: 409, SALDO_INSUFICIENTE: 409, DUPLICADO: 409, LIMITE_CATEGORIA: 409, VERSAO_DESATUALIZADA: 409,
  CORPO_GRANDE: 413, TIPO_CONTEUDO: 415, LIMITE_REQUISICOES: 429, INTERNO: 500,
};

let saidas: string[];

beforeEach(() => {
  aplicarEnvTeste();
  saidas = [];
  for (const metodo of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      saidas.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  resetContexto();
  limparEnvTeste();
});

describe('WEB-006 ErroApp e respostas', () => {
  it.each(CODIGOS_ERRO)('AC1: %s tem o status do contrato e mensagem em português', async (codigo) => {
    const erro = new ErroApp(codigo);
    expect(erro.status).toBe(STATUS[codigo]);
    expect(erro.message.length).toBeGreaterThan(3);
    const res = responderErro(erro);
    expect(res.status).toBe(STATUS[codigo]);
    expect(await res.json()).toEqual({ ok: false, erro: erro.message, codigo });
  });

  it('AC1: todos os códigos do contrato estão cobertos', () => {
    expect([...CODIGOS_ERRO].sort()).toEqual(Object.keys(STATUS).sort());
  });

  it('mensagem e detalhes personalizados são preservados', async () => {
    const detalhes = { linhas: [{ indice: 2, categoriaId: 'armas', itemId: 'ak', motivo: 'Valor inválido.' }] };
    const res = responderErro(new ErroApp('VALIDACAO', 'Linha inválida.', detalhes));
    expect(await res.json()).toEqual({ ok: false, erro: 'Linha inválida.', codigo: 'VALIDACAO', detalhes });
  });

  it('AC2: erro desconhecido vira 500 genérico sem vazar o texto original', async () => {
    const res = responderErro(new Error('FIREBASE_PRIVATE_KEY=abc'));
    const texto = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(texto)).toEqual({ ok: false, erro: MENSAGEM_INTERNA, codigo: 'INTERNO' });
    expect(texto).not.toContain('abc');
    expect(texto).not.toContain('FIREBASE_PRIVATE_KEY');
  });

  it('AC2: valores não-Error (string, null, objeto) também viram 500 genérico', () => {
    for (const valor of ['boom', null, undefined, { stack: 'x' }, 42]) {
      expect(paraErroApp(valor)).toMatchObject({ codigo: 'INTERNO', status: 500, message: MENSAGEM_INTERNA });
    }
  });

  it('AC4: o corpo nunca contém stack, nem em erro interno nem em ErroApp', async () => {
    for (const e of [new Error('x'), new ErroApp('INTERNO'), new ErroApp('VALIDACAO')]) {
      const texto = await responderErro(e).text();
      expect(texto).not.toMatch(/stack|\bat\s.+:\d+:\d+/);
    }
  });

  it('erro interno é logado (com stack só no log) e erro esperado não é', () => {
    responderErro(new ErroApp('VALIDACAO'));
    expect(saidas).toHaveLength(0);
    responderErro(new Error('falha interna'));
    expect(saidas).toHaveLength(1);
    expect(saidas[0]).toContain('falha interna');
  });

  it('respostas sempre trazem no-store e JSON; 429 põe Retry-After arredondado para cima', () => {
    const ok = responderOk({ a: 1 }, { status: 201, headers: { 'X-Teste': '1' } });
    expect(ok.status).toBe(201);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('Content-Type')).toContain('application/json');
    expect(ok.headers.get('X-Teste')).toBe('1');
    const lim = responderErro(new ErroApp('LIMITE_REQUISICOES', undefined, { retryAfter: 12.2 }));
    expect(lim.headers.get('Retry-After')).toBe('13');
    expect(lim.headers.get('Cache-Control')).toBe('no-store');
    expect(responderErro(new ErroApp('LIMITE_REQUISICOES')).headers.get('Retry-After')).toBeNull();
    expect(responderErro(new ErroApp('LIMITE_REQUISICOES', undefined, { retryAfter: 0 })).headers.get('Retry-After')).toBe('1');
  });

  it('responderOk envelopa os dados', async () => {
    expect(await responderOk({ x: [1, 2] }).json()).toEqual({ ok: true, dados: { x: [1, 2] } });
    expect(responderOk(null).status).toBe(200);
  });
});

describe('WEB-006 logger sem segredos', () => {
  it('AC3: mascara o valor das variáveis de ambiente em mensagem, contexto e erro', () => {
    const segredos = Object.values(SEGREDOS_TESTE);
    log.info(`token ${SEGREDOS_TESTE.SESSION_SECRET}`, { x: SEGREDOS_TESTE.DISCORD_CLIENT_SECRET });
    log.aviso('aviso', { url: SEGREDOS_TESTE.WEBHOOK_LOG_MEMBROS });
    log.erro('falha', new Error(`chave ${SEGREDOS_TESTE.FIREBASE_PRIVATE_KEY}`), { y: ['FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE'] });
    expect(saidas).toHaveLength(3);
    for (const linha of saidas) {
      for (const s of segredos) expect(linha).not.toContain(s);
      expect(linha).not.toContain('FAKEFAKEFAKEFAKE');
      expect(linha).toContain('[oculto]');
    }
  });

  it('AC3: mascara a chave privada na forma com quebra de linha real', () => {
    const real = SEGREDOS_TESTE.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    log.erro('x', undefined, { chave: real });
    expect(saidas[0]).not.toContain('FAKEFAKEFAKEFAKE');
  });

  it('AC3: mascara URLs de webhook, tokens do Discord, Bearer e code= mesmo sem estar na env', () => {
    const webhook = ['https://discord.com/api/webhooks/999999999999999999', 'tokenAleatorio_abc-123'].join('/');
    const tokenDiscord = `${'M'}${'a'.repeat(23)}.${'b'.repeat(6)}.${'c'.repeat(27)}`;
    log.info(`a ${webhook} b ${tokenDiscord} c Bearer abc.def-ghi d ?code=xyz123&state=ok`);
    const linha = saidas[0] as string;
    expect(linha).not.toContain('tokenAleatorio');
    expect(linha).not.toContain(tokenDiscord);
    expect(linha).not.toContain('abc.def-ghi');
    expect(linha).not.toContain('xyz123');
    expect(linha).toContain('code=[oculto]');
    expect(linha).toContain('state=ok');
  });

  it('funciona com a env inválida/ausente (não lança) e sem env mascara só os padrões', () => {
    limparEnvTeste();
    expect(() => log.info('sem env', { a: 1 })).not.toThrow();
    expect(saidas[0]).toContain('sem env');
  });

  it('referência circular e BigInt não derrubam o logger', () => {
    const a: Record<string, unknown> = { n: 10n };
    a.self = a;
    expect(() => log.info('circular', a)).not.toThrow();
    expect(saidas[0]).toContain('[circular]');
    expect(saidas[0]).toContain('"10"');
  });

  it('níveis usam o console correto', () => {
    const info = vi.spyOn(console, 'log');
    const aviso = vi.spyOn(console, 'warn');
    const erro = vi.spyOn(console, 'error');
    log.info('a');
    log.aviso('b');
    log.erro('c');
    expect([info.mock.calls.length, aviso.mock.calls.length, erro.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('mascarar trata caracteres especiais do segredo como literais', () => {
    aplicarEnvTeste({ DISCORD_CLIENT_SECRET: 'a.b*c+d?e(f)[g]' });
    expect(mascarar('x a.b*c+d?e(f)[g] y aXb*c+d?e(f)[g]')).toBe('x [oculto] y aXb*c+d?e(f)[g]');
  });
});

describe('WEB-006 lerJson', () => {
  const pedido = (corpo: BodyInit | null, headers: HeadersInit = {}) =>
    new Request('https://x.vercel.app/api', { method: 'POST', body: corpo, headers });

  it('lê JSON válido', async () => {
    expect(await lerJson(pedido('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it.each(['{', 'texto', '', '   '])('JSON inválido ou vazio (%j) vira VALIDACAO', async (corpo) => {
    await expect(lerJson(pedido(corpo), 100)).rejects.toMatchObject({ codigo: 'VALIDACAO', status: 400 });
  });

  it('corpo ausente vira VALIDACAO', async () => {
    await expect(lerJson(new Request('https://x.vercel.app/api', { method: 'POST' }), 100)).rejects.toMatchObject({
      codigo: 'VALIDACAO',
    });
  });

  it('UTF-8 inválido vira VALIDACAO', async () => {
    await expect(lerJson(pedido(new Uint8Array([0x7b, 0xff, 0x7d])), 100)).rejects.toMatchObject({ codigo: 'VALIDACAO' });
  });

  it('Content-Length acima do limite é recusado antes de ler (413)', async () => {
    const req = pedido('{}', { 'content-length': '101' });
    await expect(lerJson(req, 100)).rejects.toMatchObject({ codigo: 'CORPO_GRANDE', status: 413 });
  });

  it('tamanho real acima do limite é recusado mesmo com Content-Length mentindo', async () => {
    const corpo = JSON.stringify({ a: 'x'.repeat(200) });
    const req = pedido(corpo, { 'content-length': '5' });
    await expect(lerJson(req, 100)).rejects.toMatchObject({ codigo: 'CORPO_GRANDE' });
  });

  it('exatamente no limite passa; um byte a mais não', async () => {
    const exato = JSON.stringify({ a: 'x'.repeat(10) });
    const n = new TextEncoder().encode(exato).length;
    expect(await lerJson(pedido(exato), n)).toEqual({ a: 'x'.repeat(10) });
    await expect(lerJson(pedido(exato), n - 1)).rejects.toMatchObject({ codigo: 'CORPO_GRANDE' });
  });

  it('conta bytes, não caracteres', async () => {
    const corpo = JSON.stringify({ a: 'ç'.repeat(40) });
    await expect(lerJson(pedido(corpo), 60)).rejects.toMatchObject({ codigo: 'CORPO_GRANDE' });
  });
});

describe('WEB-006 contexto injetável', () => {
  it('getFetch devolve o injetado e volta ao global no reset', () => {
    const falso = vi.fn() as unknown as typeof fetch;
    setFetch(falso);
    expect(getFetch()).toBe(falso);
    resetContexto();
    expect(getFetch()).toBe(globalThis.fetch);
  });

  it('agendar usa o agendador injetado e isola erros da tarefa', async () => {
    let tarefa: (() => Promise<void>) | undefined;
    setAgendador((t) => {
      tarefa = t;
    });
    agendar(async () => {
      throw new Error(`falha ${SEGREDOS_TESTE.SESSION_SECRET}`);
    });
    expect(tarefa).toBeDefined();
    await expect((tarefa as () => Promise<void>)()).resolves.toBeUndefined();
    expect(saidas).toHaveLength(1);
    expect(saidas[0]).not.toContain(SEGREDOS_TESTE.SESSION_SECRET);
  });

  it('sem agendador e fora de requisição, a tarefa ainda roda', async () => {
    resetContexto();
    const feito = vi.fn(async () => undefined);
    agendar(feito);
    await new Promise((r) => setImmediate(r));
    expect(feito).toHaveBeenCalledTimes(1);
  });
});
