import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { movimentarCaixa } from '@/server/caixa/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto, setFetch } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { atualizarSaldo, embedSaldo } from '@/server/webhooks/saldo';
import { LIMITES_DISCORD, tamanhoEmbed } from '@/server/webhooks/formatacao';
import { aplicarEnvTeste, ENV_TESTE, limparEnvTeste } from '../helpers/env-teste';
import { criarDiscordFake } from '../helpers/discord-fake';
import { respostaJson } from '../helpers/fake-fetch';
import { comoDb, criarFakeFirestore, type Dados, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, seedBase } from '../helpers/estado';

let fake: FakeFirestore;
let saidas: string[];
const abrir = (seed: Record<string, Dados>) => {
  fake = criarFakeFirestore({ seed });
  setDb(comoDb(fake));
};
const doc = () => fake.dump()['webhook_mensagens/saldo_caixa'] as { mensagemId: string | null } | undefined;
const discord = (...args: Parameters<typeof criarDiscordFake>) => {
  const d = criarDiscordFake(...args);
  setFetch(d.fetch);
  return d;
};
const camposDe = (d: ReturnType<typeof criarDiscordFake>) => {
  const embed = ([...d.mensagens.values()][0]!.payload.embeds as Array<{ fields: Array<{ name: string; value: string }> }>)[0]!;
  return Object.fromEntries(embed.fields.map((f) => [f.name, f.value]));
};

beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  saidas = [];
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => void saidas.push(a.map(String).join(' ')));
  abrir(seedBase({ saldo: { sujo: 1500, limpo: 2500000 } }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDb();
  resetSemente();
  resetContexto();
  limparEnvTeste();
});

describe('WEB-050 AC1: sujo e limpo em pt-BR, nunca undefined', () => {
  it('mostra os dois saldos formatados', async () => {
    const d = discord();
    await atualizarSaldo();
    expect(camposDe(d)).toEqual({ 'Dinheiro sujo': '$1.500', 'Dinheiro limpo': '$2.500.000' });
    expect(d.posts()[0]!.url).toBe(`${ENV_TESTE.WEBHOOK_SALDO_CAIXA}?wait=true`);
  });

  it('documento de saldo ausente → $0 nos dois, sem undefined/NaN/null', async () => {
    abrir({});
    const d = discord();
    await atualizarSaldo();
    expect(camposDe(d)).toEqual({ 'Dinheiro sujo': '$0', 'Dinheiro limpo': '$0' });
    expect(JSON.stringify([...d.mensagens.values()][0]!.payload)).not.toMatch(/undefined|NaN|null/);
  });

  it('campo ausente ou inválido vira $0; embedSaldo tolera entrada incompleta', () => {
    expect(embedSaldo({}).fields?.map((f) => f.value)).toEqual(['$0', '$0']);
    expect(embedSaldo({ sujo: Number.NaN, limpo: 10 }).fields?.map((f) => f.value)).toEqual(['$0', '$10']);
    expect(embedSaldo({ sujo: Number.POSITIVE_INFINITY }).fields?.[0]?.value).toBe('$0');
  });
});

describe('WEB-050 AC2: envia, edita e recria', () => {
  it('primeira vez POST e grava o id; depois PATCH com o saldo atualizado', async () => {
    const d = discord();
    await atualizarSaldo();
    expect(doc()?.mensagemId).toBe([...d.mensagens.keys()][0]);
    await movimentarCaixa({ tipo: 'sujo', acao: 'entrada', valor: 500, anotacao: 'venda' }, USUARIO);
    await atualizarSaldo();
    expect(d.posts()).toHaveLength(1);
    expect(d.patches()).toHaveLength(1);
    expect(camposDe(d)['Dinheiro sujo']).toBe('$2.000');
  });

  it('404 na edição → uma mensagem nova em 3 chamadas e o id novo fica guardado', async () => {
    const d = discord();
    await atualizarSaldo();
    d.apagar([...d.mensagens.keys()][0]!);
    for (let i = 0; i < 3; i += 1) expect((await atualizarSaldo()).ok).toBe(true);
    expect(d.posts()).toHaveLength(2);
    expect(d.mensagens.size).toBe(1);
    expect(doc()?.mensagemId).toBe([...d.mensagens.keys()][0]);
  });

  it('usa a chave saldo_caixa, separada das mensagens de inventário', async () => {
    discord();
    await atualizarSaldo();
    expect(Object.keys(fake.dump()).filter((c) => c.startsWith('webhook_mensagens/'))).toEqual(['webhook_mensagens/saldo_caixa']);
  });
});

describe('WEB-050 AC3: falhas não lançam', () => {
  it('500, 429 longo, timeout, rede e Firestore fora → ok:false', async () => {
    discord(() => respostaJson({}, 500));
    await expect(atualizarSaldo()).resolves.toEqual({ ok: false, motivo: 'http' });

    discord(() => respostaJson({ retry_after: 60 }, 429));
    await expect(atualizarSaldo()).resolves.toEqual({ ok: false, motivo: 'limite' });

    vi.useFakeTimers();
    discord(() => new Promise<Response>(() => undefined));
    const p = atualizarSaldo();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ ok: false, motivo: 'timeout' });
    vi.useRealTimers();

    setFetch((() => Promise.reject(new TypeError(`x ${ENV_TESTE.WEBHOOK_SALDO_CAIXA}`))) as typeof fetch);
    await expect(atualizarSaldo()).resolves.toEqual({ ok: false, motivo: 'rede' });

    fake.falharEm('get', /^caixa\/saldo$/, new Error('indisponível'));
    await expect(atualizarSaldo()).resolves.toEqual({ ok: false, motivo: 'interno' });
    const tudo = saidas.join('\n');
    expect(tudo).not.toContain('/api/webhooks/');
    expect(tudo).not.toContain(ENV_TESTE.WEBHOOK_SALDO_CAIXA!.split('/').pop()!);
  });

  it('usa allowed_mentions vazio', async () => {
    const d = discord();
    await atualizarSaldo();
    expect(JSON.parse(d.chamadas[0]!.corpo).allowed_mentions).toEqual({ parse: [] });
  });
});

describe('WEB-050 AC4: limites de tamanho', () => {
  it('saldo no máximo seguro cabe nos limites do embed', () => {
    const e = embedSaldo({ sujo: Number.MAX_SAFE_INTEGER, limpo: Number.MAX_SAFE_INTEGER });
    expect(tamanhoEmbed(e)).toBeLessThanOrEqual(LIMITES_DISCORD.TOTAL);
    for (const c of e.fields ?? []) expect(c.value.length).toBeLessThanOrEqual(LIMITES_DISCORD.CAMPO_VALOR);
  });
});
