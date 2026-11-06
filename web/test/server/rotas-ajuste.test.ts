import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as CONFIRMAR } from '@/app/api/bau/[tipo]/ajuste/confirmar/route';
import { POST as PREVIA } from '@/app/api/bau/[tipo]/ajuste/previa/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import type { CategoriaCatalogo } from '@/server/dominio/tipos';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';
import { CATALOGO_PADRAO } from '@/server/catalogo/padrao';

let fake: FakeFirestore;
function abrir() {
  resetSemente();
  const catalogo = structuredClone(CATALOGO_PADRAO) as CategoriaCatalogo[];
  catalogo.find((c) => c.id === 'armas')!.itens.push({ id: '1_especial_50', nome: '#1 Especial: .50' });
  fake = criarFakeFirestore({
    seed: {
      ...seedBase({ membros: { armas: { colt: 3 } }, gerencia: { armas: { usp: 1 } }, versao: 4 }),
      'config/catalogo': { categorias: catalogo, atualizadoEm: 'x' },
    },
  });
  setDb(comoDb(fake));
}
beforeEach(() => {
  aplicarEnvTeste();
  abrir();
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const bau = (t = 'membros') => fake.dump()[`baus/${t}`] as { itens: ItensBau; versao: number };
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');
const linha = (categoriaId: string, itemId: string, quantidade: unknown) => ({ categoriaId, itemId, quantidade });
const previa = (tipo: string, perfil: PerfilTeste, corpo: unknown = { linhas: [linha('armas', 'colt', 5)] }, extra: Record<string, unknown> = {}) =>
  chamarRota(PREVIA, { metodo: 'POST', caminho: `/api/bau/${tipo}/ajuste/previa`, params: { tipo }, perfil, corpo, ...extra });
const confirmar = (tipo: string, perfil: PerfilTeste, corpo: unknown = { versao: 4, linhas: [linha('armas', 'colt', 5)] }, extra: Record<string, unknown> = {}) =>
  chamarRota(CONFIRMAR, { metodo: 'POST', caminho: `/api/bau/${tipo}/ajuste/confirmar`, params: { tipo }, perfil, corpo, ...extra });

const ROTAS = [
  ['previa', previa],
  ['confirmar', confirmar],
] as const;

describe('WEB-042 AC1: exigem nível 2 (inclusive para o baú membros) e CSRF', () => {
  for (const [nome, chamar] of ROTAS) {
    for (const tipo of ['membros', 'gerencia']) {
      it(`${nome} ${tipo}: anônimo/adulterado 401, nível 1 → 403, sem tocar o banco`, async () => {
        for (const [perfil, esperado] of [['anonimo', 401], ['adulterado', 401], [1, 403]] as const) {
          const r = await chamar(tipo, perfil);
          expect(r.status, String(perfil)).toBe(esperado);
        }
        expect(fake.chamadas).toHaveLength(0);
      });

      it(`${nome} ${tipo}: gerência (2) e dono (3) são aceitos`, async () => {
        const doc = tipo === 'membros' ? { versao: 4, linhas: [linha('armas', 'colt', 5)] } : { versao: 4, linhas: [linha('armas', 'usp', 5)] };
        for (const nivel of [2, 3] as const) {
          abrir();
          const r = await chamar(tipo, nivel, nome === 'previa' ? { linhas: doc.linhas } : doc);
          expect(r.status, `${nivel}`).toBe(200);
        }
      });

      it(`${nome} ${tipo}: sem CSRF, token errado ou sem Origin → 403 e nada gravado`, async () => {
        const antes = fake.dump();
        for (const extra of [{ csrf: 'ausente' }, { csrf: 'errado' }, { origin: null }]) {
          const r = await chamar(tipo, 2, undefined, extra);
          expect(r.status, JSON.stringify(extra)).toBe(403);
        }
        expect(fake.dump()).toEqual(antes);
        expect(escritas()).toEqual([]);
      });
    }

    it(`${nome}: Content-Type errado → 415`, async () => {
      expect((await chamar('membros', 2, undefined, { headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    });
  }
});

describe('WEB-042 AC3: tipo e tamanho', () => {
  for (const [nome, chamar] of ROTAS) {
    it(`${nome}: tipo de baú inválido → 400 (nível 2) sem tocar o banco`, async () => {
      for (const tipo of ['cofre', 'Membros', '..', 'zerar']) {
        const r = await chamar(tipo, 3);
        expect([r.status, r.corpo.codigo], tipo).toEqual([400, 'VALIDACAO']);
      }
      expect(fake.chamadas).toHaveLength(0);
    });

    it(`${nome}: corpo acima de 100 KB → 413; corpo entre 10 KB e 100 KB é aceito pelo limite`, async () => {
      const grande = await chamar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 5)], lixo: 'a'.repeat(103_000) });
      expect([grande.status, grande.corpo.codigo]).toEqual([413, 'CORPO_GRANDE']);
      const medio = await chamar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 5)], lixo: 'a'.repeat(20_000) });
      expect(medio.status).toBe(400); // passou do limite de 10 KB; recusado só pelo campo extra
      expect(medio.corpo.codigo).toBe('VALIDACAO');
      expect(escritas()).toEqual([]);
    });
  }
});

describe('WEB-042 POST /api/bau/[tipo]/ajuste/previa', () => {
  it('AC4: nunca escreve (nenhuma escrita em fake.chamadas) e devolve a PreviaAjusteDTO', async () => {
    const r = await previa('membros', 2, { linhas: [linha('armas', 'colt', 5), linha('armas', '1_especial_50', 2)] });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toEqual({
      tipo: 'membros',
      versao: 4,
      alterados: 2,
      linhas: [
        { categoriaId: 'armas', itemId: 'colt', nome: 'Colt', antes: 3, depois: 5 },
        { categoriaId: 'armas', itemId: '1_especial_50', nome: '#1 Especial: .50', antes: 0, depois: 2 },
      ],
    });
    expect(escritas()).toEqual([]);
    expect(r.res.headers.get('cache-control')).toBe('no-store');
  });

  it('AC4: prévia inválida também não escreve; devolve detalhes.linhas com os índices inválidos', async () => {
    const r = await previa('membros', 2, { linhas: [linha('armas', 'colt', 1), linha('armas', 'nada', 1), linha('armas', 'usp', -1)] });
    expect([r.status, r.corpo.codigo]).toEqual([400, 'VALIDACAO']);
    expect((r.corpo.detalhes as { linhas: Array<{ indice: number }> }).linhas.map((l) => l.indice)).toEqual([1, 2]);
    expect(escritas()).toEqual([]);
  });

  it('corpo mal formado → 400: sem linhas, linhas não-lista, linha com campo extra, campo extra no corpo, versão sobrando', async () => {
    for (const corpo of [{}, { linhas: 'x' }, { linhas: [{ ...linha('armas', 'colt', 1), usuario: 'x' }] }, { linhas: [], x: 1 }, { versao: 4, linhas: [linha('armas', 'colt', 1)] }, null, []]) {
      const r = await previa('membros', 2, corpo);
      expect([r.status, r.corpo.codigo], JSON.stringify(corpo)).toEqual([400, 'VALIDACAO']);
      expect(r.corpo.erro).not.toMatch(/zod|expected|invalid_type/i);
    }
    expect(escritas()).toEqual([]);
  });

  it('lista vazia e mais de 200 linhas → 400', async () => {
    expect((await previa('membros', 2, { linhas: [] })).status).toBe(400);
    expect((await previa('membros', 2, { linhas: Array.from({ length: 201 }, () => linha('armas', 'colt', 1)) })).status).toBe(400);
  });
});

describe('WEB-042 POST /api/bau/[tipo]/ajuste/confirmar', () => {
  it('AC2: sem versão (ou com versão não numérica) → 400 e nada gravado', async () => {
    for (const corpo of [
      { linhas: [linha('armas', 'colt', 5)] },
      { versao: '4', linhas: [linha('armas', 'colt', 5)] },
      { versao: null, linhas: [linha('armas', 'colt', 5)] },
      { versao: -1, linhas: [linha('armas', 'colt', 5)] },
      { versao: 1.5, linhas: [linha('armas', 'colt', 5)] },
      { versao: 4 },
    ]) {
      const r = await confirmar('membros', 2, corpo);
      expect([r.status, r.corpo.codigo], JSON.stringify(corpo)).toEqual([400, 'VALIDACAO']);
    }
    expect(escritas()).toEqual([]);
  });

  it('AC2/D3: prévia, depósito de +10, confirmação com a versão velha → 409 pedindo para refazer; estoque 13 e zero auditoria', async () => {
    const p = await previa('membros', 2);
    const versao = (p.corpo.dados as { versao: number }).versao;
    const dep = await chamarRota(ADICIONAR, { metodo: 'POST', caminho: '/api/bau/membros/adicionar', params: { tipo: 'membros' }, perfil: 1, corpo: { categoriaId: 'armas', itemId: 'colt', quantidade: 10 } });
    expect(dep.status).toBe(200);
    const antes = fake.dump();
    const r = await confirmar('membros', 2, { versao, linhas: [linha('armas', 'colt', 5)] });
    expect([r.status, r.corpo.codigo]).toEqual([409, 'VERSAO_DESATUALIZADA']);
    expect(r.corpo.erro).toBe('O baú mudou desde o resumo. Refaça o ajuste.');
    expect(bau().itens.armas!.colt).toBe(13);
    expect(auditorias(fake.dump())).toHaveLength(0);
    expect(fake.dump()).toEqual(antes);
  });

  it('fluxo feliz prévia → confirmar: aplica, sobe a versão, grava auditoria e log com o usuário da sessão', async () => {
    const p = await previa('gerencia', 2, { linhas: [linha('armas', 'usp', 6), linha('armas', 'colt', 1)] });
    const versao = (p.corpo.dados as { versao: number }).versao;
    const r = await confirmar('gerencia', 2, { versao, linhas: [linha('armas', 'usp', 6), linha('armas', 'colt', 1)] }, { userId: '555555555555555551' });
    expect(r.status).toBe(200);
    expect(r.corpo.dados).toMatchObject({ alterados: 2, versao: 5 });
    expect(bau('gerencia')).toMatchObject({ versao: 5, itens: { armas: { usp: 6, colt: 1 } } });
    expect(bau('membros').versao).toBe(4);
    expect(auditorias(fake.dump())[0]).toMatchObject({ acao: 'bau.ajuste_massa', usuario: { id: '555555555555555551' } });
    expect(logsDe(fake.dump(), 'gerencia')).toHaveLength(1);
  });

  it('usuário do corpo é ignorado/recusado: campo "usuario" → 400', async () => {
    const r = await confirmar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 5)], usuario: { id: '1', nome: 'Falso' } });
    expect(r.status).toBe(400);
    expect(escritas()).toEqual([]);
  });

  it('D1 pela rota: item "#1 Especial: .50" entra e sai por id', async () => {
    const r = await confirmar('membros', 2, { versao: 4, linhas: [linha('armas', '1_especial_50', 7)] });
    expect(r.status).toBe(200);
    expect(bau().itens.armas!['1_especial_50']).toBe(7);
    const r2 = await confirmar('membros', 2, { versao: 5, linhas: [linha('armas', '1_especial_50', 0)] });
    expect(r2.status).toBe(200);
    expect(bau().itens.armas!['1_especial_50']).toBeUndefined();
  });

  it('linha inválida (quantidade, item inexistente) → 400 com detalhes.linhas e nada gravado', async () => {
    const antes = fake.dump();
    const r = await confirmar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 9), linha('armas', 'colt', 9), linha('nada', 'x', '10abc')] });
    expect(r.status).toBe(400);
    expect((r.corpo.detalhes as { linhas: Array<{ indice: number }> }).linhas.map((l) => l.indice)).toEqual([1, 2]);
    expect(fake.dump()).toEqual(antes);
  });

  it('duas confirmações simultâneas com a mesma versão: um 200 e um 409', async () => {
    const r = await Promise.all([
      confirmar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 5)] }),
      confirmar('membros', 3, { versao: 4, linhas: [linha('armas', 'colt', 8)] }, { userId: '555555555555555551' }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(bau().versao).toBe(5);
    expect(auditorias(fake.dump())).toHaveLength(1);
  });

  it('sem alterações: 200, alterados 0, nenhuma escrita', async () => {
    const r = await confirmar('membros', 2, { versao: 4, linhas: [linha('armas', 'colt', 3)] });
    expect([r.status, r.corpo.dados]).toEqual([200, { alterados: 0, versao: 4, auditoriaId: null }]);
    expect(escritas()).toEqual([]);
  });

  it('falha no commit → 500 genérico e baú intacto', async () => {
    const antes = fake.dump();
    fake.falharProximoCommit(new Error('PERMISSION_DENIED segredo'));
    const r = await confirmar('membros', 2);
    expect([r.status, r.corpo.codigo]).toEqual([500, 'INTERNO']);
    expect(r.texto).not.toMatch(/PERMISSION_DENIED|segredo/);
    expect(fake.dump()).toEqual(antes);
  });

  it('USUARIO usado nos testes não é o da sessão de outros perfis (sanidade do helper)', () => {
    expect(USUARIO.id).toMatch(/^\d{18}$/);
  });
});

describe('WEB-042 métodos exportados', () => {
  it('as duas rotas do ajuste só exportam POST', async () => {
    const m = [await import('@/app/api/bau/[tipo]/ajuste/previa/route'), await import('@/app/api/bau/[tipo]/ajuste/confirmar/route')];
    expect(m.map((x) => Object.keys(x).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)))).toEqual([['POST'], ['POST']]);
  });
});
