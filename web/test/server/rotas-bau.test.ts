import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as CATALOGO } from '@/app/api/catalogo/route';
import { GET as LER } from '@/app/api/bau/[tipo]/route';
import { POST as ADICIONAR } from '@/app/api/bau/[tipo]/adicionar/route';
import { POST as REMOVER } from '@/app/api/bau/[tipo]/remover/route';
import { resetSemente } from '@/server/catalogo/semente';
import { resetContexto } from '@/server/contexto';
import { resetDb, setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import type { PerfilTeste } from '../helpers/pedidos';
import { chamarRota } from '../helpers/rotas';
import { falharCommitDaOperacao } from './commit-falho';

let fake: FakeFirestore;
beforeEach(() => {
  aplicarEnvTeste();
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros: { medicamentos: { bandagem: 10 } }, gerencia: { armas: { colt: 2 }, medicamentos: { bandagem: 5 } } }) });
  setDb(comoDb(fake));
});
afterEach(() => {
  resetDb();
  resetSemente();
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

const corpoOk = (extra: Record<string, unknown> = {}) => ({ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 3, ...extra });
const itens = (tipo: string) => (fake.dump()[`baus/${tipo}`] as { itens: ItensBau }).itens;
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

const ROTAS = [
  { nome: 'GET /api/bau/[tipo]', rota: LER, metodo: 'GET', sufixo: '' },
  { nome: 'POST /api/bau/[tipo]/adicionar', rota: ADICIONAR, metodo: 'POST', sufixo: '/adicionar' },
  { nome: 'POST /api/bau/[tipo]/remover', rota: REMOVER, metodo: 'POST', sufixo: '/remover' },
] as const;

const chamar = (r: (typeof ROTAS)[number], tipo: string, perfil: PerfilTeste, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  chamarRota(r.rota, { metodo: r.metodo, caminho: `/api/bau/${tipo}${r.sufixo}`, params: { tipo }, perfil, corpo, ...extra });

describe('WEB-031 AC1: nível por rota e por tipo', () => {
  const casos: Array<[string, PerfilTeste, number]> = [
    ['membros', 'anonimo', 401],
    ['membros', 'adulterado', 401],
    ['membros', 1, 200],
    ['membros', 2, 200],
    ['membros', 3, 200],
    ['gerencia', 'anonimo', 401],
    ['gerencia', 1, 403],
    ['gerencia', 2, 200],
    ['gerencia', 3, 200],
  ];
  for (const r of ROTAS) {
    for (const [tipo, perfil, esperado] of casos) {
      it(`${r.nome} tipo=${tipo} perfil=${String(perfil)} → ${esperado}`, async () => {
        const { status } = await chamar(r, tipo, perfil, r.metodo === 'POST' ? corpoOk({ quantidade: 1 }) : undefined);
        expect(status).toBe(esperado);
        if (esperado !== 200) {
          expect(fake.chamadas).toHaveLength(0);
        }
      });
    }

    it(`${r.nome}: tipo de baú inexistente → 400, sem tocar o banco`, async () => {
      const { status, corpo } = await chamar(r, 'cofre', 3, r.metodo === 'POST' ? corpoOk() : undefined);
      expect(status).toBe(400);
      expect(corpo.codigo).toBe('VALIDACAO');
      expect(fake.chamadas).toHaveLength(0);
    });
  }

  it('tipo de baú só vale em minúsculas e sem caracteres extras', async () => {
    for (const tipo of ['Membros', 'membros ', '..', 'membros%2F']) {
      expect((await chamar(ROTAS[0], tipo, 3)).status, tipo).toBe(400);
    }
  });

  it('nível 1 não consegue escrever no baú da gerência (nada gravado)', async () => {
    const antes = fake.dump();
    expect((await chamar(ROTAS[1], 'gerencia', 1, corpoOk())).status).toBe(403);
    expect((await chamar(ROTAS[2], 'gerencia', 1, corpoOk())).status).toBe(403);
    expect(fake.dump()).toEqual(antes);
  });
});

describe('WEB-031 GET /api/bau/[tipo]', () => {
  it('devolve o BauDTO com versão e itens', async () => {
    const { status, corpo } = await chamar(ROTAS[0], 'membros', 1);
    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);
    const dados = corpo.dados as { tipo: string; versao: number; categorias: Array<{ id: string; itens: unknown[] }> };
    expect(dados.tipo).toBe('membros');
    expect(dados.categorias.find((c) => c.id === 'medicamentos')!.itens).toEqual([{ id: 'bandagem', nome: 'Bandagem', quantidade: 10 }]);
    expect(escritas()).toEqual([]);
  });

  it('resposta sem cache', async () => {
    const { res } = await chamar(ROTAS[0], 'membros', 1);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/catalogo', () => {
  it('nível 1 lê o catálogo; sem sessão é 401', async () => {
    const ok = await chamarRota(CATALOGO, { caminho: '/api/catalogo', perfil: 1 });
    expect(ok.status).toBe(200);
    expect((ok.corpo.dados as { categorias: unknown[] }).categorias).toHaveLength(6);
    fake.chamadas.length = 0;
    expect((await chamarRota(CATALOGO, { caminho: '/api/catalogo', perfil: 'anonimo' })).status).toBe(401);
    expect(fake.chamadas).toHaveLength(0);
  });
});

describe('WEB-031 AC2: corpo inválido → 400 em português', () => {
  const invalidos: Array<[string, unknown]> = [
    ['campo extra', corpoOk({ usuario: 'outro' })],
    ['campo extra de nível', corpoOk({ nivel: 3 })],
    ['sem quantidade', { categoriaId: 'medicamentos', itemId: 'bandagem' }],
    ['sem itemId', { categoriaId: 'medicamentos', quantidade: 1 }],
    ['sem categoriaId', { itemId: 'bandagem', quantidade: 1 }],
    ['categoriaId numérico', corpoOk({ categoriaId: 5 })],
    ['itemId nulo', corpoOk({ itemId: null })],
    ['itemId perigoso', corpoOk({ itemId: '__proto__' })],
    ['itemId com barra', corpoOk({ itemId: '../x' })],
    ['quantidade booleana', corpoOk({ quantidade: true })],
    ['quantidade nula', corpoOk({ quantidade: null })],
    ['quantidade objeto', corpoOk({ quantidade: { $gt: 0 } })],
    ['quantidade "10abc"', corpoOk({ quantidade: '10abc' })],
    ['quantidade "1,5"', corpoOk({ quantidade: '1,5' })],
    ['quantidade 0', corpoOk({ quantidade: 0 })],
    ['quantidade negativa', corpoOk({ quantidade: -1 })],
    ['quantidade decimal', corpoOk({ quantidade: 1.5 })],
    ['quantidade 100001', corpoOk({ quantidade: 100001 })],
    ['corpo é lista', [corpoOk()]],
    ['corpo é texto', 'oi'],
    ['corpo é nulo', null],
    ['objeto vazio', {}],
  ];
  for (const r of [ROTAS[1], ROTAS[2]]) {
    for (const [nome, corpo] of invalidos) {
      it(`${r.nome}: ${nome}`, async () => {
        const antes = fake.dump();
        const { status, corpo: resp } = await chamar(r, 'membros', 1, corpo);
        expect(status).toBe(400);
        expect(resp.ok).toBe(false);
        expect(resp.codigo).toBe('VALIDACAO');
        expect(resp.erro).toMatch(/[a-zçãé]/i);
        expect(resp.erro).not.toMatch(/zod|expected|invalid_type|undefined/i);
        expect(fake.dump()).toEqual(antes);
      });
    }
  }

  it('"10abc" devolve a mensagem de números inteiros', async () => {
    const { corpo } = await chamar(ROTAS[1], 'membros', 1, corpoOk({ quantidade: '10abc' }));
    expect(corpo.erro).toBe('Digite apenas números inteiros, sem pontos, vírgulas ou sinais.');
  });

  it('corpo que não é JSON ou vazio → 400; Content-Type errado → 415; sem Origin → 403', async () => {
    const semJson = await chamar(ROTAS[1], 'membros', 1, undefined, { headers: { 'content-type': 'application/json' } });
    expect(semJson.status).toBe(400);
    const tipoErrado = await chamar(ROTAS[1], 'membros', 1, corpoOk(), { headers: { 'content-type': 'text/plain' } });
    expect(tipoErrado.status).toBe(415);
    const semOrigin = await chamar(ROTAS[1], 'membros', 1, corpoOk(), { origin: null });
    expect(semOrigin.status).toBe(403);
    expect(escritas()).toEqual([]);
  });
});

describe('WEB-031 CSRF', () => {
  for (const r of [ROTAS[1], ROTAS[2]]) {
    it(`${r.nome}: sem token ou com token errado → 403 e nada gravado`, async () => {
      const antes = fake.dump();
      for (const csrf of ['ausente', 'errado'] as const) {
        const { status, corpo } = await chamar(r, 'membros', 1, corpoOk(), { csrf });
        expect(status).toBe(403);
        expect(corpo.codigo).toBe('CSRF');
      }
      expect(fake.dump()).toEqual(antes);
    });
  }
});

describe('WEB-031 AC3: sucesso e erros de regra', () => {
  it('adicionar devolve { quantidade, versao } resultantes (mais ids) e grava log com o usuário da sessão', async () => {
    const { status, corpo } = await chamar(ROTAS[1], 'membros', 1, corpoOk({ quantidade: 5 }));
    expect(status).toBe(200);
    expect(corpo).toEqual({ ok: true, dados: { categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 15, versao: 1 } });
    expect(itens('membros').medicamentos!.bandagem).toBe(15);
    const [log] = logsDe(fake.dump(), 'membros');
    expect(log!.usuario).toEqual({ id: USUARIO.id, nome: 'Teste' });
  });

  it('o usuário do log vem da sessão e não do corpo (corpo com "usuario" é recusado)', async () => {
    const { status } = await chamar(ROTAS[1], 'membros', 1, corpoOk({ usuario: { id: '1', nome: 'Falso' } }), { userId: '555555555555555551' });
    expect(status).toBe(400);
    await chamar(ROTAS[1], 'membros', 1, corpoOk(), { userId: '555555555555555551' });
    expect(logsDe(fake.dump(), 'membros')[0]!.usuario).toMatchObject({ id: '555555555555555551' });
  });

  it('quantidade em texto só de dígitos é aceita', async () => {
    const { status, corpo } = await chamar(ROTAS[1], 'membros', 1, corpoOk({ quantidade: '7' }));
    expect(status).toBe(200);
    expect((corpo.dados as { quantidade: number }).quantidade).toBe(17);
  });

  it('remover devolve a quantidade resultante; remover tudo apaga a chave', async () => {
    const r1 = await chamar(ROTAS[2], 'membros', 1, corpoOk({ quantidade: 4 }));
    expect(r1.corpo.dados).toMatchObject({ quantidade: 6, versao: 1 });
    const r2 = await chamar(ROTAS[2], 'membros', 1, corpoOk({ quantidade: 6 }));
    expect(r2.corpo.dados).toMatchObject({ quantidade: 0, versao: 2 });
    expect(itens('membros')).toEqual({});
  });

  it('estoque insuficiente → 409 com mensagem curta', async () => {
    const { status, corpo } = await chamar(ROTAS[2], 'membros', 1, corpoOk({ quantidade: 11 }));
    expect(status).toBe(409);
    expect(corpo).toMatchObject({ ok: false, codigo: 'ESTOQUE_INSUFICIENTE', erro: 'Estoque insuficiente. Disponível: 10.' });
    expect(itens('membros').medicamentos!.bandagem).toBe(10);
  });

  it('item que não está no baú → 404; item fora do catálogo → 404', async () => {
    const a = await chamar(ROTAS[2], 'membros', 1, corpoOk({ itemId: 'gaze' }));
    expect(a.status).toBe(404);
    expect(a.corpo.erro).toBe('O item não está no baú.');
    const b = await chamar(ROTAS[1], 'membros', 1, corpoOk({ itemId: 'nao_existe' }));
    expect(b.status).toBe(404);
    const c = await chamar(ROTAS[1], 'membros', 1, corpoOk({ categoriaId: 'nada' }));
    expect(c.status).toBe(404);
  });

  it('dois pedidos simultâneos de remover 6 com estoque 10: um 200 e um 409', async () => {
    const r = await Promise.all([
      chamar(ROTAS[2], 'membros', 1, corpoOk({ quantidade: 6 })),
      chamar(ROTAS[2], 'membros', 2, corpoOk({ quantidade: 6 })),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(itens('membros').medicamentos!.bandagem).toBe(4);
  });

  it('o baú da gerência é independente do dos membros', async () => {
    await chamar(ROTAS[1], 'gerencia', 2, corpoOk({ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }));
    expect(itens('gerencia')).toEqual({ armas: { colt: 3 }, medicamentos: { bandagem: 5 } });
    expect(itens('membros')).toEqual({ medicamentos: { bandagem: 10 } });
  });
});

describe('WEB-031 AC4: corpo grande', () => {
  it('corpo acima de 10 KB → 413 e nada gravado', async () => {
    for (const r of [ROTAS[1], ROTAS[2]]) {
      const { status, corpo } = await chamar(r, 'membros', 1, corpoOk({ lixo: 'a'.repeat(11_000) }));
      expect(status).toBe(413);
      expect(corpo.codigo).toBe('CORPO_GRANDE');
    }
    expect(escritas()).toEqual([]);
  });
});

describe('WEB-031 AC5: nenhuma resposta vaza stack nem texto de exceção', () => {
  const VAZAMENTO = 'PERMISSION_DENIED projects/segredo/databases/(default) stack at Object.<anonymous> (/var/task/x.js:1:1)';

  it('falha do Firestore no commit vira INTERNO genérico (500)', async () => {
    const r = await chamar(ROTAS[1], 'membros', 1, corpoOk());
    expect(r.status).toBe(200);
    for (const rota of [ROTAS[1], ROTAS[2]]) {
      const provar = await falharCommitDaOperacao(fake, new Error(VAZAMENTO));
      const { status, texto, corpo } = await chamar(rota, 'membros', 1, corpoOk({ quantidade: 1 }));
      provar();
      expect(status).toBe(500);
      expect(corpo.codigo).toBe('INTERNO');
      expect(texto).not.toMatch(/PERMISSION_DENIED|segredo|stack|\/var\/task|at Object/);
    }
  });

  it('falha de leitura do Firestore também é genérica', async () => {
    fake.falharEm('get', /^baus\/membros$/, new Error(VAZAMENTO));
    const { status, texto } = await chamar(ROTAS[0], 'membros', 1);
    expect(status).toBe(500);
    expect(texto).not.toMatch(/PERMISSION_DENIED|segredo|stack|\/var\/task/);
  });

  it('erros de regra não trazem stack', async () => {
    const { texto } = await chamar(ROTAS[2], 'membros', 1, corpoOk({ quantidade: 999 }));
    expect(texto).not.toMatch(/\bat \w|stack|\.ts:\d+/);
  });
});

describe('WEB-031 métodos', () => {
  it('as rotas só exportam os métodos do contrato', async () => {
    const modulos = await Promise.all([
      import('@/app/api/bau/[tipo]/route'),
      import('@/app/api/bau/[tipo]/adicionar/route'),
      import('@/app/api/bau/[tipo]/remover/route'),
    ]);
    const exportados = modulos.map((m) => Object.keys(m).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)));
    expect(exportados).toEqual([['GET'], ['POST'], ['POST']]);
  });
});
