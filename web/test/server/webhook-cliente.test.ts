import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetContexto, setFetch } from '@/server/contexto';
import { editarWebhook, enviarWebhook, type PayloadWebhook } from '@/server/discord/webhook';
import { resetEnv, type CanalWebhook } from '@/server/env';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarFakeFetch, respostaJson, type RespostaFake } from '../helpers/fake-fetch';

const payload: PayloadWebhook = { embeds: [{ title: 'Olá' }] };
const URL_MEMBROS = ENV_TESTE.WEBHOOK_LOG_MEMBROS!;
const TOKEN_URL = URL_MEMBROS.split('/').pop()!;

let saidas: string[];
beforeEach(() => {
  aplicarEnvTeste();
  saidas = [];
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => void saidas.push(a.map(String).join(' ')));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetContexto();
  limparEnvTeste();
});

const usar = (responder: (i: number) => RespostaFake) => {
  const f = criarFakeFetch((_c, i) => responder(i));
  setFetch(f.fetch);
  return f;
};
const semSegredo = () => {
  const tudo = saidas.join('\n');
  expect(tudo).not.toContain(TOKEN_URL);
  expect(tudo).not.toContain('/api/webhooks/');
  expect(tudo).not.toContain(URL_MEMBROS);
};

describe('WEB-046 AC1: sucesso', () => {
  it('enviar: POST com ?wait=true na URL do canal e devolve o id da mensagem', async () => {
    const f = usar(() => respostaJson({ id: '123456789012345678' }));
    const r = await enviarWebhook('logMembros', payload);
    expect(r).toEqual({ ok: true, mensagemId: '123456789012345678' });
    expect(f.chamadas).toHaveLength(1);
    expect(f.chamadas[0]!.url).toBe(`${URL_MEMBROS}?wait=true`);
    expect(f.chamadas[0]!.metodo).toBe('POST');
    expect(f.chamadas[0]!.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(f.chamadas[0]!.corpo).embeds).toEqual(payload.embeds);
  });

  it('editar: PATCH em /messages/{id}, sem ?wait', async () => {
    const f = usar(() => respostaJson({ id: '555' }));
    expect(await editarWebhook('logMembros', '555', payload)).toEqual({ ok: true, mensagemId: '555' });
    expect(f.chamadas[0]!.url).toBe(`${URL_MEMBROS}/messages/555`);
    expect(f.chamadas[0]!.metodo).toBe('PATCH');
  });

  it('AC5: cada canal usa só a própria URL de getEnv()', async () => {
    const mapa: Record<CanalWebhook, string> = {
      logMembros: 'WEBHOOK_LOG_MEMBROS',
      logGerencia: 'WEBHOOK_LOG_GERENCIA',
      logCaixa: 'WEBHOOK_LOG_CAIXA',
      inventarioMembros: 'WEBHOOK_INVENTARIO_MEMBROS',
      inventarioGerencia: 'WEBHOOK_INVENTARIO_GERENCIA',
      saldoCaixa: 'WEBHOOK_SALDO_CAIXA',
    };
    const f = usar(() => respostaJson({ id: '1' }));
    for (const canal of Object.keys(mapa) as CanalWebhook[]) await enviarWebhook(canal, payload);
    expect(f.chamadas.map((c) => c.url)).toEqual(Object.values(mapa).map((n) => `${ENV_TESTE[n]}?wait=true`));
  });
});

describe('WEB-046 AC4: allowed_mentions vazio sempre', () => {
  it('enviar e editar injetam allowed_mentions { parse: [] }', async () => {
    const f = usar(() => respostaJson({ id: '1' }));
    await enviarWebhook('logMembros', { embeds: [], content: '@everyone' });
    await editarWebhook('logMembros', '1', { embeds: [] });
    for (const c of f.chamadas) expect(JSON.parse(c.corpo).allowed_mentions).toEqual({ parse: [] });
  });

  it('um allowed_mentions vindo no payload não vale: é sobrescrito', async () => {
    const f = usar(() => respostaJson({ id: '1' }));
    await enviarWebhook('logMembros', { embeds: [], allowed_mentions: { parse: ['everyone', 'roles', 'users'] } } as unknown as PayloadWebhook);
    expect(JSON.parse(f.chamadas[0]!.corpo).allowed_mentions).toEqual({ parse: [] });
  });
});

describe('WEB-046 AC2: falhas nunca lançam e nunca registram a URL', () => {
  it.each([400, 401, 403, 500, 502, 503])('HTTP %i → ok:false http', async (status) => {
    usar(() => respostaJson({ message: 'erro' }, status));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'http' });
    await expect(editarWebhook('logMembros', '9', payload)).resolves.toEqual({ ok: false, motivo: 'http' });
    semSegredo();
  });

  it('PATCH com 404 → nao_encontrada (para recriar); POST com 404 continua http', async () => {
    usar(() => respostaJson({ message: 'Unknown Webhook' }, 404));
    await expect(editarWebhook('logMembros', '9', payload)).resolves.toEqual({ ok: false, motivo: 'nao_encontrada' });
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'http' });
  });

  it('rede caída (inclusive com a URL dentro da mensagem do erro) → rede, sem a URL no log', async () => {
    usar(() => new TypeError(`fetch failed: ${URL_MEMBROS}?wait=true`));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'rede' });
    semSegredo();
  });

  it('fetch que lança de forma síncrona também vira rede', async () => {
    setFetch((() => {
      throw new Error(`boom ${URL_MEMBROS}`);
    }) as typeof fetch);
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'rede' });
    semSegredo();
  });

  it.each([
    ['corpo que não é JSON', () => new Response('<html>erro</html>', { status: 200 })],
    ['JSON sem id', () => respostaJson({ ok: true })],
    ['JSON que não é objeto', () => respostaJson([1, 2])],
    ['id que não é numérico', () => respostaJson({ id: '../../x' })],
    ['corpo vazio', () => new Response('', { status: 200 })],
  ])('2xx com %s → ok:false json', async (_n, resp) => {
    usar(() => resp());
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'json' });
  });

  it('timeout de 5 s: fetch que nunca responde → timeout, sem lançar', async () => {
    vi.useFakeTimers();
    const f = usar(() => new Promise<Response>(() => undefined));
    const p = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(4999);
    let resolvido = false;
    void p.then(() => (resolvido = true));
    await Promise.resolve();
    expect(resolvido).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ ok: false, motivo: 'timeout' });
    expect(f.chamadas[0]!.init.signal?.aborted).toBe(true);
    semSegredo();
  });

  it('corpo da resposta que trava também cai no mesmo prazo', async () => {
    vi.useFakeTimers();
    usar(() => ({ status: 200, headers: new Headers(), json: () => new Promise(() => undefined) }) as unknown as Response);
    const p = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ ok: false, motivo: 'timeout' });
  });

  it('AbortError/TimeoutError do próprio fetch → timeout', async () => {
    usar(() => Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'timeout' });
    usar(() => Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'timeout' });
  });

  it('o log de falha tem canal e motivo, mas nunca URL, token nem corpo', async () => {
    usar(() => respostaJson({ message: `segredo ${TOKEN_URL}` }, 500));
    await enviarWebhook('logMembros', payload);
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas.join('\n')).toContain('logMembros');
    semSegredo();
  });
});

describe('WEB-046 AC3: 429 com retry_after', () => {
  it('retry_after curto (no corpo): espera e tenta uma vez mais, e o sucesso conta', async () => {
    vi.useFakeTimers();
    const f = usar((i) => (i === 0 ? respostaJson({ retry_after: 1.5 }, 429) : respostaJson({ id: '77' })));
    const p = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(1499);
    expect(f.chamadas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ ok: true, mensagemId: '77' });
    expect(f.chamadas).toHaveLength(2);
  });

  it('retry_after curto pelo cabeçalho Retry-After também vale', async () => {
    vi.useFakeTimers();
    const f = usar((i) => (i === 0 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : respostaJson({ id: '78' })));
    const p = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual({ ok: true, mensagemId: '78' });
    expect(f.chamadas).toHaveLength(2);
  });

  it('retry_after de 3 s (limite) ainda tenta de novo; de 10 s desiste na hora, sem esperar', async () => {
    vi.useFakeTimers();
    const f3 = usar((i) => (i === 0 ? respostaJson({ retry_after: 3 }, 429) : respostaJson({ id: '1' })));
    const p3 = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p3).resolves.toEqual({ ok: true, mensagemId: '1' });
    expect(f3.chamadas).toHaveLength(2);

    const f10 = usar(() => respostaJson({ retry_after: 10 }, 429));
    const p10 = enviarWebhook('logMembros', payload);
    await expect(p10).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(f10.chamadas).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('segundo 429 seguido desiste (uma única tentativa extra)', async () => {
    vi.useFakeTimers();
    const f = usar(() => respostaJson({ retry_after: 0.5 }, 429));
    const p = enviarWebhook('logMembros', payload);
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(f.chamadas).toHaveLength(2);
  });

  it('429 sem retry_after legível desiste sem esperar', async () => {
    const f = usar(() => new Response('?', { status: 429 }));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(f.chamadas).toHaveLength(1);
  });

  it('429 também vale para editar', async () => {
    const f = usar(() => respostaJson({ retry_after: 60 }, 429));
    await expect(editarWebhook('logMembros', '5', payload)).resolves.toEqual({ ok: false, motivo: 'limite' });
    expect(f.chamadas).toHaveLength(1);
    semSegredo();
  });
});

describe('WEB-046 AC5: canal e id inválidos', () => {
  it('canal desconhecido → canal, sem chamar a rede', async () => {
    const f = usar(() => respostaJson({ id: '1' }));
    await expect(enviarWebhook('inexistente' as CanalWebhook, payload)).resolves.toEqual({ ok: false, motivo: 'canal' });
    await expect(editarWebhook('__proto__' as CanalWebhook, '1', payload)).resolves.toEqual({ ok: false, motivo: 'canal' });
    expect(f.chamadas).toHaveLength(0);
  });

  it('env inválido (webhook ausente) não lança: canal', async () => {
    aplicarEnvTeste({ WEBHOOK_LOG_MEMBROS: undefined });
    resetEnv();
    const f = usar(() => respostaJson({ id: '1' }));
    await expect(enviarWebhook('logMembros', payload)).resolves.toEqual({ ok: false, motivo: 'canal' });
    expect(f.chamadas).toHaveLength(0);
  });

  it.each(['', 'abc', '../x', '1/2', '12 3', '1'.repeat(30)])('id de mensagem inválido %j não vira caminho', async (id) => {
    const f = usar(() => respostaJson({ id: '1' }));
    await expect(editarWebhook('logMembros', id, payload)).resolves.toMatchObject({ ok: false });
    expect(f.chamadas).toHaveLength(0);
  });
});
