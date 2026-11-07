import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ZERAR } from '@/app/api/bau/zerar/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';
import { falharCommitDaOperacao } from './commit-falho';

const MEMBROS: ItensBau = { medicamentos: { analgesico: 10 }, armas: { colt: 2 } };
const GERENCIA: ItensBau = { armas: { usp: 4 } };

let fake: FakeFirestore;
beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros: MEMBROS, gerencia: GERENCIA, versao: 2 }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const estoque = (t: string) => (fake.dump()[`baus/${t}`] as { itens: ItensBau; versao: number });
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');
const zerar = (perfil: PerfilTeste, corpo: unknown = { alvo: 'ambos', confirmacao: 'ZERAR' }, extra: Record<string, unknown> = {}) =>
  chamarRota(ZERAR, { metodo: 'POST', caminho: '/api/bau/zerar', perfil, corpo, ...extra });

describe('WEB-039 POST /api/bau/zerar (nível 3, só o dono)', () => {
  it('AC1: gerência (nível 2) → 403, nível 1 → 403, anônimo e adulterado → 401; nada tocado', async () => {
    const antes = fake.dump();
    for (const [perfil, esperado] of [[2, 403], [1, 403], ['anonimo', 401], ['adulterado', 401]] as const) {
      fake.chamadas.length = 0;
      const r = await zerar(perfil);
      expect(r.status, String(perfil)).toBe(esperado);
      expect(fake.chamadas, String(perfil)).toHaveLength(0);
    }
    expect(fake.dump()).toEqual(antes);
    expect(auditorias(fake.dump())).toHaveLength(0);
    expect(estoque('membros').itens).toEqual(MEMBROS);
  });

  it('AC1: a gerência com corpo perfeito e CSRF certo continua sendo 403 (o nível vem antes de tudo)', async () => {
    const r = await zerar(2, { alvo: 'membros', confirmacao: 'ZERAR' });
    expect([r.status, r.corpo.codigo]).toEqual([403, 'SEM_PERMISSAO']);
    expect(fake.chamadas).toHaveLength(0);
  });

  it('AC1: dono com CSRF correto zera → 200 com o resumo', async () => {
    const r = await zerar(3);
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toMatchObject({ alvos: ['membros', 'gerencia'], itens: 3, unidades: 16 });
    expect(estoque('membros')).toMatchObject({ itens: {}, versao: 3 });
    expect(estoque('gerencia')).toMatchObject({ itens: {}, versao: 3 });
    expect(auditorias(fake.dump())).toHaveLength(1);
    expect(auditorias(fake.dump())[0]!.usuario).toEqual({ id: USUARIO.id, nome: USUARIO.nome });
  });

  it('AC1: dono sem CSRF ou com token errado → 403 CSRF; sem Origin → 403; nada gravado', async () => {
    for (const extra of [{ csrf: 'ausente' }, { csrf: 'errado' }, { origin: null }]) {
      const r = await zerar(3, undefined, extra);
      expect(r.status, JSON.stringify(extra)).toBe(403);
    }
    expect(fake.dump()['baus/membros']).toMatchObject({ itens: MEMBROS });
    expect(escritas()).toEqual([]);
  });

  it('AC3: "membros" zera só os membros e "gerencia" só a gerência', async () => {
    expect((await zerar(3, { alvo: 'membros', confirmacao: 'ZERAR' })).corpo.dados).toMatchObject({ alvos: ['membros'], unidades: 12 });
    expect(estoque('gerencia').itens).toEqual(GERENCIA);
    expect((await zerar(3, { alvo: 'gerencia', confirmacao: 'ZERAR' })).corpo.dados).toMatchObject({ alvos: ['gerencia'], unidades: 4 });
  });

  it('AC2: sem confirmação, confirmação errada (minúscula, espaços, outra frase, tipo errado) → 400 e nada alterado', async () => {
    const antes = fake.dump();
    for (const confirmacao of [undefined, '', 'zerar', 'Zerar', ' ZERAR', 'ZERAR ', 'ZERAR!', 'SIM', 'ZERAR ZERAR', 5, true, null, ['ZERAR']]) {
      const corpo = confirmacao === undefined ? { alvo: 'ambos' } : { alvo: 'ambos', confirmacao };
      const r = await zerar(3, corpo);
      expect([r.status, r.corpo.codigo], String(confirmacao)).toEqual([400, 'VALIDACAO']);
    }
    expect(fake.dump()).toEqual(antes);
    expect(escritas()).toEqual([]);
  });

  it('AC2: a mensagem pede a palavra ZERAR', async () => {
    const r = await zerar(3, { alvo: 'ambos', confirmacao: 'nao' });
    expect(r.corpo.erro).toBe('Digite ZERAR para confirmar.');
  });

  it('AC3: alvo inválido ou ausente → 400 sem escrita; campo extra → 400', async () => {
    for (const corpo of [
      { alvo: 'todos', confirmacao: 'ZERAR' }, { alvo: '', confirmacao: 'ZERAR' }, { confirmacao: 'ZERAR' }, { alvo: null, confirmacao: 'ZERAR' },
      { alvo: ['membros'], confirmacao: 'ZERAR' }, { alvo: 'Membros', confirmacao: 'ZERAR' }, { alvo: 'ambos', confirmacao: 'ZERAR', extra: 1 },
      {}, null, 'ZERAR', [],
    ]) {
      const r = await zerar(3, corpo);
      expect([r.status, r.corpo.codigo], JSON.stringify(corpo)).toEqual([400, 'VALIDACAO']);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC4: dois zerar simultâneos → o segundo vê o baú vazio e a auditoria dele não duplica o conteúdo', async () => {
    const [a, b] = await Promise.all([zerar(3), zerar(3, undefined, { userId: '555555555555555551' })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const unidades = [a, b].map((r) => (r.corpo.dados as { unidades: number }).unidades).sort((x, y) => x - y);
    expect(unidades).toEqual([0, 16]);
    const lista = auditorias(fake.dump());
    expect(lista).toHaveLength(2);
    expect(lista.filter((x) => JSON.stringify(x.antes) === JSON.stringify({ membros: {}, gerencia: {} }))).toHaveLength(1);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(2);
  });

  it('falha no commit → 500 genérico, baús e auditoria intactos', async () => {
    const antes = fake.dump();
    const provar = await falharCommitDaOperacao(fake, new Error('PERMISSION_DENIED segredo'));
    const r = await zerar(3);
    provar();
    expect([r.status, r.corpo.codigo]).toEqual([500, 'INTERNO']);
    expect(r.texto).not.toMatch(/PERMISSION_DENIED|segredo/);
    expect(fake.dump()).toEqual(antes);
  });

  it('a rota fixa /api/bau/zerar só exporta POST', async () => {
    const m = await import('@/app/api/bau/zerar/route');
    expect(Object.keys(m).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k))).toEqual(['POST']);
  });
});
