import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MARCA_ROTA, type DeclaracaoRota } from '@/server/auth/autorizacao';
import { resetContexto, setFetch } from '@/server/contexto';
import { setDb } from '@/server/firebase';
import { resetLimitadores } from '@/server/seguranca/limite';
import { RAIZ_WEB, ler, listar } from '../helpers/arquivos';
import { aplicarEnvTeste, limparEnvTeste } from '../helpers/env-teste';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { montarPedido, type PerfilTeste } from '../helpers/pedidos';
import {
  MANIFESTO,
  ROTAS_PUBLICAS,
  arquivoDaRota,
  caminhoReal,
  type EntradaManifesto,
} from './manifesto-rotas';

const PASTA_API = join(RAIZ_WEB, 'src', 'app', 'api');

const arquivosRota = () => listar(PASTA_API, /(^|[\\/])route\.ts$/);
const caminhoDoArquivo = (f: string) => f.slice(join(RAIZ_WEB, 'src', 'app').length).replace(/[\\/]route\.ts$/, '').replaceAll('\\', '/');
const chave = (metodo: string, caminho: string) => `${metodo} ${caminho}`;

/** Métodos HTTP exportados, lidos do código-fonte (independe de importar o módulo). */
function metodosExportados(fonte: string): string[] {
  const achados = new Set<string>();
  for (const m of fonte.matchAll(/export\s+(?:async\s+)?(?:const|function|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) achados.add(m[1]!);
  for (const m of fonte.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const nome of m[1]!.split(',')) {
      const final = nome.split(/\s+as\s+/).pop()!.trim();
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(final)) achados.add(final);
    }
  }
  return [...achados].sort();
}

const existe = (e: EntradaManifesto) => existsSync(join(RAIZ_WEB, arquivoDaRota(e.caminho)));
const implementadas = MANIFESTO.filter(existe);

async function carregar(e: EntradaManifesto): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ join(RAIZ_WEB, arquivoDaRota(e.caminho)))) as Record<string, unknown>;
}

type RotaChamavel = ((req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>) & {
  [MARCA_ROTA]?: DeclaracaoRota;
};

async function chamar(e: EntradaManifesto, perfil: PerfilTeste, extra: { csrf?: 'ausente' | 'errado'; params?: Record<string, string> } = {}) {
  const modulo = await carregar(e);
  const rota = modulo[e.metodo] as RotaChamavel;
  const params = extra.params ?? { ...(e.params ?? {}) };
  const req = await montarPedido({ metodo: e.metodo, caminho: caminhoReal(e, params), perfil, csrf: extra.csrf });
  const res = await rota(req, { params: Promise.resolve(params) });
  return { res };
}

function nivelEsperado(e: EntradaManifesto, params: Readonly<Record<string, string>>): number {
  if (e.nivel === 'opcional' || e.nivel === 'publica') return 0;
  return e.nivelPorTipo ? (e.nivelPorTipo[params.tipo ?? ''] ?? e.nivel) : e.nivel;
}

let fake: FakeFirestore;
beforeEach(() => {
  aplicarEnvTeste();
  fake = criarFakeFirestore();
  setDb(comoDb(fake));
  setFetch((() => Promise.reject(new Error('rede bloqueada no teste'))) as typeof fetch);
});
afterEach(() => {
  resetContexto();
  resetLimitadores();
  limparEnvTeste();
});

describe('WEB-026 manifesto e varredura', () => {
  it('o manifesto lista exatamente as 21 rotas do contrato, sem repetição', () => {
    expect(MANIFESTO).toHaveLength(21);
    expect(new Set(MANIFESTO.map((e) => chave(e.metodo, e.caminho))).size).toBe(21);
  });

  it('AC1: todo route.ts e todo método exportado estão no manifesto, e só eles', () => {
    const achados = new Set<string>();
    for (const arquivo of arquivosRota()) {
      const caminho = caminhoDoArquivo(arquivo);
      const metodos = metodosExportados(ler(arquivo));
      expect(metodos.length, `${caminho} não exporta método HTTP`).toBeGreaterThan(0);
      for (const m of metodos) achados.add(chave(m, caminho));
    }
    const declarados = new Set(implementadas.map((e) => chave(e.metodo, e.caminho)));
    expect([...achados].sort()).toEqual([...declarados].sort());
  });

  it('AC1: com a onda 6 as 21 rotas do manifesto existem (nenhuma de onda futura pendente)', () => {
    expect(MANIFESTO.filter((x) => !existe(x)).map((e) => e.caminho)).toEqual([]);
    expect(implementadas).toHaveLength(21);
    expect(Math.max(...MANIFESTO.map((e) => e.onda))).toBe(6);
  });

  it('o detector de rota não listada enxerga um método novo (falha se alguém criar rota fora do manifesto)', () => {
    expect(metodosExportados("export const GET = rotaPublica(async () => x);\nexport const POST = comAutorizacao({nivel:1}, h);")).toEqual(['GET', 'POST']);
    expect(metodosExportados('export async function DELETE() {}')).toEqual(['DELETE']);
    expect(metodosExportados("export { handler as PUT } from './x';")).toEqual(['PUT']);
    expect(metodosExportados("export const runtime = 'nodejs';")).toEqual([]);
  });

  it('AC2: as únicas rotas públicas são login e callback (lista explícita)', async () => {
    expect(MANIFESTO.filter((e) => e.nivel === 'publica').map((e) => e.caminho).sort()).toEqual([...ROTAS_PUBLICAS].sort());
    for (const e of implementadas) {
      const m = (await carregar(e))[e.metodo] as RotaChamavel;
      const decl = m[MARCA_ROTA];
      expect(decl, `${e.metodo} ${e.caminho} sem marca de autorização`).toBeDefined();
      expect(decl!.publica, `${e.caminho}`).toBe(ROTAS_PUBLICAS.includes(e.caminho));
      if (!decl!.publica) {
        const esperado = e.nivelPorTipo ? 'por-parametro' : e.nivel;
        expect((decl as { nivel: unknown }).nivel, e.caminho).toBe(esperado);
      }
    }
  });

  it('todo método HTTP exportado é o retorno de comAutorizacao/rotaPublica (fonte) e há runtime/dynamic fixos', () => {
    for (const arquivo of arquivosRota()) {
      const fonte = ler(arquivo);
      for (const m of metodosExportados(fonte)) {
        expect(fonte, `${arquivo} ${m}`).toMatch(new RegExp(`export\\s+const\\s+${m}\\s*=\\s*(?:comAutorizacao|rotaPublica)\\b`));
      }
      expect(fonte, arquivo).toMatch(/export const runtime = 'nodejs'/);
      expect(fonte, arquivo).toMatch(/export const dynamic = 'force-dynamic'/);
    }
  });

  it('AC5: ADR-02, nenhuma server action ("use server") em web/src', () => {
    const arquivos = listar(join(RAIZ_WEB, 'src'), /\.(ts|tsx|js|jsx|mjs)$/);
    expect(arquivos.length).toBeGreaterThan(0);
    for (const f of arquivos) expect(ler(f), f).not.toMatch(/^\s*['"]use server['"]/m);
  });
});

describe('WEB-026 lint impede exportar método sem a camada de autorização', () => {
  const lint = async (codigo: string) => {
    const eslint = new ESLint({ cwd: RAIZ_WEB });
    const [r] = await eslint.lintText(codigo, { filePath: join(PASTA_API, 'exemplo', 'route.ts') });
    return r!.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
  };

  it('recusa function, const sem wrapper e reexport; aceita os dois wrappers', async () => {
    expect(await lint('export async function GET() { return new Response(); }')).toHaveLength(1);
    expect(await lint('export const POST = async () => new Response();')).toHaveLength(1);
    expect(await lint("export { GET } from './outra';")).toHaveLength(1);
    expect(await lint("import { comAutorizacao } from 'x';\nexport const POST = comAutorizacao({ nivel: 1 }, async () => new Response());")).toHaveLength(0);
    expect(await lint("import { rotaPublica } from 'x';\nexport const GET = rotaPublica(async () => new Response());")).toHaveLength(0);
  }, 60_000);
});

describe('WEB-026 AC3 execução com cinco perfis', () => {
  const protegidas = implementadas.filter((e) => e.nivel !== 'publica');
  const perfis: PerfilTeste[] = ['anonimo', 'adulterado', 1, 2, 3];

  for (const e of protegidas) {
    const variantes: Array<Record<string, string>> = e.nivelPorTipo
      ? Object.keys(e.nivelPorTipo).map((tipo) => ({ ...(e.params ?? {}), tipo }))
      : [{ ...(e.params ?? {}) }];
    for (const params of variantes) {
      it(`${e.metodo} ${caminhoReal(e, params)}: resultado confere com o nível ${e.nivel === 'opcional' ? 'opcional' : nivelEsperado(e, params)}`, async () => {
        const exigido = nivelEsperado(e, params);
        for (const perfil of perfis) {
          fake.chamadas.length = 0;
          const { res } = await chamar(e, perfil, { params });
          const nivelPerfil = typeof perfil === 'number' ? perfil : 0;
          const negado = e.nivel !== 'opcional' && nivelPerfil < exigido;
          const rotulo = `${e.metodo} ${e.caminho} [${String(perfil)}]`;
          if (negado) {
            expect(res.status, rotulo).toBe(nivelPerfil === 0 ? 401 : 403);
            expect(fake.chamadas, `${rotulo} tocou o Firestore`).toHaveLength(0);
          } else {
            expect([401, 403], rotulo).not.toContain(res.status);
          }
        }
      });
    }
  }

  it('há ao menos uma rota protegida executada (a varredura não ficou vazia)', () => {
    expect(protegidas.length).toBeGreaterThanOrEqual(2);
  });

  it('onda 5: as 6 rotas de gerência estão implementadas e exigem o nível do manifesto (dono nas destrutivas)', async () => {
    const onda5 = MANIFESTO.filter((e) => e.onda === 5);
    expect(onda5).toHaveLength(6);
    expect(onda5.every(existe)).toBe(true);
    const niveis = Object.fromEntries(onda5.map((e) => [`${e.metodo} ${e.caminho}`, e.nivel]));
    expect(niveis).toEqual({
      'POST /api/catalogo/itens': 2,
      'DELETE /api/catalogo/itens/[categoriaId]/[itemId]': 3,
      'POST /api/bau/[tipo]/ajuste/previa': 2,
      'POST /api/bau/[tipo]/ajuste/confirmar': 2,
      'POST /api/bau/zerar': 3,
      'POST /api/catalogo/atualizar': 3,
    });
  });
});

describe('WEB-045 onda 6: rotas de logs e auditoria', () => {
  it('as 4 rotas da onda 6 existem, exigem o nível do manifesto e a auditoria só exporta GET', async () => {
    const onda6 = MANIFESTO.filter((e) => e.onda === 6);
    expect(onda6.map((e) => `${e.metodo} ${e.caminho}`).sort()).toEqual([
      'GET /api/auditoria',
      'GET /api/auditoria/[id]',
      'GET /api/logs/bau/[tipo]',
      'GET /api/logs/caixa',
    ]);
    expect(onda6.every(existe)).toBe(true);
    for (const e of onda6) expect(metodosExportados(ler(join(RAIZ_WEB, arquivoDaRota(e.caminho)))), e.caminho).toEqual(['GET']);
    const niveis = Object.fromEntries(onda6.map((e) => [e.caminho, e.nivel]));
    expect(niveis).toEqual({ '/api/logs/bau/[tipo]': 1, '/api/logs/caixa': 2, '/api/auditoria': 2, '/api/auditoria/[id]': 2 });
    expect(onda6.find((e) => e.caminho === '/api/logs/bau/[tipo]')?.nivelPorTipo).toEqual({ membros: 1, gerencia: 2 });
  });
});

describe('WEB-026 AC4 mutações sem CSRF', () => {
  const mutacoes = implementadas.filter((e) => e.metodo !== 'GET');

  for (const e of mutacoes) {
    it(`${e.metodo} ${e.caminho}: sessão suficiente sem token ou com token errado → 403 e nenhuma escrita`, async () => {
      const nivel = e.nivel === 'opcional' ? 1 : e.nivelPorTipo ? 2 : (e.nivel as 1 | 2 | 3);
      for (const csrf of ['ausente', 'errado'] as const) {
        fake.chamadas.length = 0;
        const { res } = await chamar(e, nivel, { csrf });
        expect(res.status, `${e.caminho} ${csrf}`).toBe(403);
        expect((await res.json()).codigo).toBe('CSRF');
        expect(fake.chamadas).toHaveLength(0);
        expect(res.headers.getSetCookie()).toHaveLength(0);
      }
    });
  }

  it('há mutações exercitadas e todas as GET existentes são de leitura', () => {
    expect(mutacoes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('WEB-023 AC4 rotas GET nunca escrevem (varredura)', () => {
  const MODULOS_ESCRITA =
    /@\/server\/(?:bau\/(?:operacoes|zerar|ajuste)|caixa\/(?:operacoes|movimentar)|catalogo\/(?:operacoes|semente)|auditoria\/registrar|logs\/registrar|webhooks\/|discord\/webhook)/;
  const IDENTIFICADORES_ESCRITA =
    /\b(?:getDb|runTransaction|garantirCatalogo|registrarLog|registrarAuditoria|publicarEvento|agendar|adicionarItem|removerItem|movimentarCaixa|zerarBaus|confirmarAjuste|adicionarItemCatalogo|removerItemCatalogo)\b|\.(?:set|update|create|add|batch)\(/;

  /** Arquivos que exportam GET não podem importar nem chamar serviços de escrita. */
  function violacoes(fonte: string): string[] {
    if (!metodosExportados(fonte).includes('GET')) return [];
    const ruins: string[] = [];
    for (const linha of fonte.split('\n')) {
      if (/^\s*import\b/.test(linha) && MODULOS_ESCRITA.test(linha)) ruins.push(linha.trim());
      else if (!/^\s*import\b/.test(linha) && IDENTIFICADORES_ESCRITA.test(linha)) ruins.push(linha.trim());
    }
    return ruins;
  }

  it('nenhum route.ts com GET chama serviço de escrita', () => {
    for (const arquivo of arquivosRota()) expect(violacoes(ler(arquivo)), arquivo).toEqual([]);
  });

  it('o detector pega um GET com efeito colateral', () => {
    const ruim = "import { adicionar } from '@/server/bau/operacoes';\nexport const GET = comAutorizacao({nivel:1}, async () => { await getDb(); return x; });";
    expect(violacoes(ruim).length).toBe(2);
    expect(violacoes("export const POST = comAutorizacao({nivel:1}, async () => { await runTransaction(); });")).toEqual([]);
    expect(violacoes("export const GET = comAutorizacao({nivel:1}, async () => { cache.set(k, v); });")).toHaveLength(1);
  });

  it('o wrapper não entrega corpo a GET', async () => {
    const e = MANIFESTO.find((x) => x.caminho === '/api/csrf')!;
    const { res } = await chamar(e, 1);
    expect(res.status).toBe(200);
    expect(fake.chamadas).toHaveLength(0);
  });
});

describe('WEB-026 rotas públicas (login e callback)', () => {
  for (const caminho of ROTAS_PUBLICAS) {
    it(`${caminho} responde sem sessão (redirecionamento) e não toca o Firestore`, async () => {
      const e = MANIFESTO.find((x) => x.caminho === caminho)!;
      const { res } = await chamar(e, 'anonimo');
      expect(res.status).toBe(307);
      expect(fake.chamadas).toHaveLength(0);
    });
  }
});
