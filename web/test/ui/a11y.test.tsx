import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialogo } from '@/components/Dialogo';
import { Navegacao } from '@/components/Navegacao';
import { SessaoProvider } from '@/components/SessaoProvider';
import { TelaLogin } from '@/components/TelaLogin';

/*
 * WEB-065. axe-core vem hoje só como dependência transitiva do eslint-config-next
 * (pedir ao backend-dev para declará-lo em devDependencies, mesma versão do lock).
 * O jsdom não calcula layout, então a regra de contraste do axe fica desligada aqui e é
 * coberta pelo cálculo direto a partir dos tokens (bloco "contraste dos tokens").
 */

const exigirPagina = vi.fn();
vi.mock('@/server/auth/pagina', () => ({
  exigirPagina: (...a: unknown[]) => exigirPagina(...a),
  obterUsuarioPagina: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/bau/membros',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (d: string) => {
    throw new Error(`REDIRECT:${d}`);
  },
}));

const RAIZ = process.cwd();
const css = readFileSync(resolve(RAIZ, 'src/app/globals.css'), 'utf8');

/* ---------------------------------------------------------------- axe */

interface Opcoes {
  /** Páginas completas têm h1; telas transitórias (loading) não. */
  semH1?: boolean;
}

async function violacoes(opcoes: Opcoes = {}): Promise<string[]> {
  document.documentElement.lang = 'pt-BR';
  document.title = 'Teste · Stocky';
  const regras: Record<string, { enabled: boolean }> = { 'color-contrast': { enabled: false } };
  if (opcoes.semH1) regras['page-has-heading-one'] = { enabled: false };
  const r = await axe.run(document, { rules: regras });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Replica a casca do layout raiz (link para pular + conteúdo) sem aninhar <html> no jsdom. */
function Casca({ children }: { children: ReactElement }) {
  return (
    <>
      <a className="pular" href="#conteudo">
        Ir para o conteúdo
      </a>
      {children}
    </>
  );
}

/* ---------------------------------------------------------------- dados falsos */

type Modo = 'dados' | 'vazio' | 'erro' | 'carregando';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const ok = (dados: unknown) => json({ ok: true, dados });

const CATALOGO = {
  categorias: [
    { id: 'armas', nome: 'Armas', emoji: '🔫', total: 2, itens: [{ id: 'pistola', nome: 'Pistola' }, { id: 'faca', nome: 'Faca' }] },
    { id: 'drogas', nome: 'Drogas', emoji: '💊', total: 1, itens: [{ id: 'weed', nome: 'Weed' }] },
  ],
};
const bau = (tipo: string, cheio: boolean) => ({
  tipo,
  versao: 3,
  categorias: [
    { id: 'armas', nome: 'Armas', emoji: '🔫', itens: cheio ? [{ id: 'pistola', nome: 'Pistola', quantidade: 1500 }, { id: 'faca', nome: 'Faca', quantidade: 2 }] : [] },
    { id: 'drogas', nome: 'Drogas', emoji: '💊', itens: cheio ? [{ id: 'weed', nome: 'Weed', quantidade: 7 }] : [] },
  ],
});
const logBau = { id: 'b1', acao: 'adicionar', usuario: { id: '1', nome: 'Ana' }, data: '2026-11-05T02:30:00.000Z', versao: 2, categoriaId: 'armas', itemId: 'pistola', nomeItem: 'Pistola', nomeCategoria: 'Armas', quantidade: 5, saldoResultante: 9, resumo: null, auditoriaId: null };
const movCaixa = { id: 'c1', acao: 'entrada', tipo: 'limpo', valor: 2500, anotacao: 'venda', saldoResultante: 9000, usuario: { id: '1', nome: 'Bia' }, data: '2026-11-05T15:30:00.000Z' };
const reg = { id: 'a1', acao: 'catalogo.remover_item', usuario: { id: '9', nome: 'Dono' }, data: '2026-11-05T02:30:00.000Z', resumo: 'Removeu Faca' };

function rota(modo: Modo) {
  return async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = String(entrada);
    if (url === '/api/csrf') return ok({ csrf: 'csrf-falso' });
    if (modo === 'carregando') return new Promise<Response>(() => undefined);
    if (modo === 'erro') return json({ ok: false, codigo: 'INTERNO', erro: 'x' }, 500);
    const cheio = modo === 'dados';
    const pagina = (itens: unknown[]) => ok({ itens: cheio ? itens : [], proximoCursor: cheio ? 'prox' : null });
    if (url === '/api/catalogo') return ok(CATALOGO);
    if (url.startsWith('/api/bau/')) return ok(bau(url.split('/')[3]!, cheio));
    if (url === '/api/caixa') return ok({ sujo: cheio ? 1500 : 0, limpo: cheio ? 2500000 : 0 });
    if (url.startsWith('/api/caixa/historico')) return pagina([movCaixa]);
    if (url.startsWith('/api/logs/caixa')) return pagina([movCaixa]);
    if (url.startsWith('/api/logs/')) return pagina([logBau]);
    if (url.startsWith('/api/auditoria?')) return pagina([reg]);
    if (url.startsWith('/api/auditoria/')) return ok({ ...reg, alvo: {}, antes: { membros: { armas: { pistola: 3 } } }, depois: { membros: { armas: { pistola: 0 } } } });
    return json({ ok: false, codigo: 'NAO_ENCONTRADO', erro: 'x' }, 404);
  };
}

beforeEach(() => {
  exigirPagina.mockReset();
  exigirPagina.mockResolvedValue({ usuario: { id: '1', nome: 'Ana', nivel: 3 }, csrf: 'csrf-falso' });
});
afterEach(() => vi.unstubAllGlobals());

async function carregou() {
  await waitFor(() => expect(document.querySelector('.estado--carregando')).toBeNull(), { timeout: 3000 });
}

/* ---------------------------------------------------------------- páginas × estados */

const PAGINAS: Array<{ nome: string; abrir: () => Promise<ReactElement> }> = [
  { nome: '/bau/membros', abrir: async () => (await import('@/app/(protegido)/bau/[tipo]/page')).default({ params: Promise.resolve({ tipo: 'membros' }) }) as Promise<ReactElement> },
  { nome: '/bau/gerencia', abrir: async () => (await import('@/app/(protegido)/bau/[tipo]/page')).default({ params: Promise.resolve({ tipo: 'gerencia' }) }) as Promise<ReactElement> },
  { nome: '/caixa', abrir: async () => (await import('@/app/(protegido)/caixa/page')).default() as Promise<ReactElement> },
  { nome: '/painel', abrir: async () => (await import('@/app/(protegido)/painel/page')).default() as Promise<ReactElement> },
  { nome: '/ajuste/membros', abrir: async () => (await import('@/app/(protegido)/ajuste/[tipo]/page')).default({ params: Promise.resolve({ tipo: 'membros' }) }) as Promise<ReactElement> },
  { nome: '/logs', abrir: async () => (await import('@/app/(protegido)/logs/page')).default() as Promise<ReactElement> },
  { nome: '/auditoria', abrir: async () => (await import('@/app/(protegido)/auditoria/page')).default() as Promise<ReactElement> },
];

async function montarPagina(abrir: () => Promise<ReactElement>, modo: Modo) {
  vi.stubGlobal('fetch', vi.fn(rota(modo)));
  const pagina = await abrir();
  const r = render(
    <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
      <Casca>{pagina}</Casca>
    </SessaoProvider>,
  );
  if (modo === 'carregando') await waitFor(() => expect(document.querySelector('.estado--carregando')).not.toBeNull());
  else await carregou();
  return r;
}

describe('WEB-065 AC1: axe sem violações em cada tela e estado', () => {
  for (const modo of ['carregando', 'vazio', 'erro', 'dados'] as const) {
    describe(`estado ${modo}`, () => {
      it.each(PAGINAS)('$nome', async ({ abrir }) => {
        await montarPagina(abrir, modo);
        expect(await violacoes()).toEqual([]);
      });
    });
  }

  it('/login sem erro e com erro', async () => {
    const a = render(<Casca><TelaLogin /></Casca>);
    expect(await violacoes()).toEqual([]);
    a.unmount();
    render(<Casca><TelaLogin erro="acesso_negado" /></Casca>);
    expect(await violacoes()).toEqual([]);
  });

  it('/ , 404, erro e carregamento de rota', async () => {
    const { default: Inicio } = await import('@/app/page');
    const { default: NaoEncontrada } = await import('@/app/not-found');
    const { default: Erro } = await import('@/app/error');
    const { default: CarregandoRota } = await import('@/app/(protegido)/loading');
    for (const [el, opcoes] of [
      [<Inicio key="i" />, {}],
      [<NaoEncontrada key="n" />, {}],
      [<Erro key="e" error={new Error('x')} reset={() => undefined} />, {}],
      [<CarregandoRota key="c" />, { semH1: true }],
    ] as const) {
      const r = render(<Casca>{el}</Casca>);
      expect(await violacoes(opcoes)).toEqual([]);
      r.unmount();
    }
  });

  it('casca protegida: navegação e página de baú juntas', async () => {
    vi.stubGlobal('fetch', vi.fn(rota('dados')));
    const { Bau } = await import('@/components/Bau');
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
        <Casca>
          <div className="casca">
            <Navegacao nivel={3} csrf="csrf-falso" />
            <div className="casca__principal">
              <main id="conteudo" tabIndex={-1} className="conteudo">
                <Bau tipo="membros" titulo="Baú dos Membros" />
              </main>
            </div>
          </div>
        </Casca>
      </SessaoProvider>,
    );
    await carregou();
    expect(await violacoes()).toEqual([]);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });
});

describe('WEB-065 AC1: diálogos e fluxos abertos (axe)', () => {
  it('diálogo de remoção do catálogo, diálogo de zerar, resumo do ajuste e detalhe da auditoria', async () => {
    vi.stubGlobal('fetch', vi.fn(rota('dados')));
    const { Catalogo } = await import('@/components/Catalogo');
    const { ZerarBau } = await import('@/components/ZerarBau');
    const { Auditoria } = await import('@/components/Auditoria');
    const { AjusteTabela } = await import('@/components/AjusteTabela');

    const a = render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
        <Casca><main id="conteudo" tabIndex={-1}><h1>Painel</h1><Catalogo /></main></Casca>
      </SessaoProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Pistola' }));
    await screen.findByRole('dialog');
    expect(await violacoes()).toEqual([]);
    a.unmount();

    const b = render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
        <Casca><main id="conteudo" tabIndex={-1}><h1>Painel</h1><ZerarBau /></main></Casca>
      </SessaoProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /zerar baú/i }));
    await screen.findByRole('dialog');
    expect(await violacoes()).toEqual([]);
    b.unmount();

    const c = render(<Casca><main id="conteudo" tabIndex={-1}><h1>Auditoria</h1><Auditoria /></main></Casca>);
    fireEvent.click(await screen.findByRole('button', { name: /detalhe|ver|antes/i }));
    await screen.findByRole('region', { name: 'Antes' });
    expect(await violacoes()).toEqual([]);
    c.unmount();

    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
        <Casca><main id="conteudo" tabIndex={-1}><AjusteTabela tipo="membros" titulo="Ajuste" /></main></Casca>
      </SessaoProvider>,
    );
    const campo = (await screen.findAllByLabelText(/Nova quantidade de/))[0]!;
    fireEvent.change(campo, { target: { value: '12' } });
    expect(await violacoes()).toEqual([]);
  });
});

/* ---------------------------------------------------------------- rótulos, nomes, landmarks, ordem de foco */

describe('WEB-065 AC2: rótulos e nomes acessíveis', () => {
  it('todo campo, botão, link e aba das telas com dados tem nome acessível', async () => {
    for (const { abrir } of PAGINAS) {
      const r = await montarPagina(abrir, 'dados');
      const campos = Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], [role="tab"]'));
      expect(campos.length).toBeGreaterThan(0);
      for (const el of campos) expect(el, el.outerHTML.slice(0, 120)).toHaveAccessibleName();
      r.unmount();
    }
  });

  it('o botão de sair e a navegação têm nome; links da navegação não repetem nomes', () => {
    render(<Navegacao nivel={3} csrf="x" />);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    const nomes = screen.getAllByRole('link').map((l) => l.textContent);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('botões só com ícone ou emoji têm aria-label (nenhum botão vazio no código)', () => {
    for (const arquivo of arquivosTsx(join(RAIZ, 'src'))) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(/<button\b[^>]*>\s*<(?:svg|span|img)\b/g)) {
        expect(m[0], arquivo).toMatch(/aria-label=/);
      }
    }
  });
});

describe('WEB-065 landmarks, títulos e ordem de foco', () => {
  it.each(PAGINAS)('$nome: um main#conteudo, um h1 e níveis de título sem salto', async ({ abrir }) => {
    await montarPagina(abrir, 'dados');
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main')).toHaveAttribute('id', 'conteudo');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    let anterior = 0;
    for (const h of Array.from(document.querySelectorAll('h1, h2, h3, h4'))) {
      const nivel = Number(h.tagName[1]);
      expect(nivel - anterior, h.textContent ?? '').toBeLessThanOrEqual(1);
      anterior = nivel;
    }
  });

  it('o link de pular é o primeiro foco, aponta para o main e a navegação vem antes do conteúdo', async () => {
    vi.stubGlobal('fetch', vi.fn(rota('dados')));
    const { Bau } = await import('@/components/Bau');
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 3 }} csrf="csrf-falso">
        <Casca>
          <div className="casca">
            <Navegacao nivel={3} csrf="csrf-falso" />
            <main id="conteudo" tabIndex={-1}>
              <Bau tipo="membros" titulo="Baú dos Membros" />
            </main>
          </div>
        </Casca>
      </SessaoProvider>,
    );
    await carregou();
    const focaveis = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    expect(focaveis[0]).toHaveAttribute('href', '#conteudo');
    expect(document.getElementById('conteudo')).not.toBeNull();
    const nav = screen.getByRole('navigation');
    const primeiroDoConteudo = focaveis.find((el) => document.getElementById('conteudo')!.contains(el))!;
    expect(nav.compareDocumentPosition(primeiroDoConteudo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nenhum tabindex positivo e nenhum autofoco no código', () => {
    for (const arquivo of arquivosTsx(join(RAIZ, 'src'))) {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte, arquivo).not.toMatch(/tabIndex=\{?["']?[1-9]/);
      expect(fonte, arquivo).not.toMatch(/\bautoFocus\b/);
    }
  });
});

/* ---------------------------------------------------------------- AC3: diálogo */

describe('WEB-065 AC3: o Dialogo prende o foco, fecha com Esc e devolve o foco', () => {
  function Exemplo({ bloqueado = false, aoFechar = vi.fn() }: { bloqueado?: boolean; aoFechar?: () => void }) {
    const [aberto, setAberto] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setAberto(true)}>
          Abrir
        </button>
        {aberto ? (
          <Dialogo
            titulo="Confirmar"
            bloqueado={bloqueado}
            aoFechar={() => {
              aoFechar();
              setAberto(false);
            }}
          >
            <button type="button">Primeiro</button>
            <button type="button">Último</button>
          </Dialogo>
        ) : null}
      </>
    );
  }

  it('foco entra no diálogo, Tab e Shift+Tab ciclam nas pontas, Esc fecha e o foco volta', () => {
    const aoFechar = vi.fn();
    render(<Exemplo aoFechar={aoFechar} />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    const dialogo = screen.getByRole('dialog', { name: 'Confirmar' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);
    const [primeiro, ultimo] = [screen.getByRole('button', { name: 'Primeiro' }), screen.getByRole('button', { name: 'Último' })];

    ultimo.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(primeiro).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(ultimo).toHaveFocus();

    abrir.focus(); // foco escapando por fora: o Tab traz de volta
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(abrir).toHaveFocus();
  });

  it('bloqueado ignora Esc (requisição em andamento)', () => {
    const aoFechar = vi.fn();
    render(<Exemplo bloqueado aoFechar={aoFechar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- AC5: aria-live */

describe('WEB-065 AC5: mensagens de sucesso e erro anunciadas', () => {
  it('login: o erro aparece com role="alert"', () => {
    render(<TelaLogin erro="acesso_negado" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('todo elemento de erro ou aviso do código declara role (alert ou status)', () => {
    let achados = 0;
    for (const arquivo of arquivosTsx(join(RAIZ, 'src'))) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(/<(?:p|div|span)\b[^>]*className=(?:"|\{`)[^"`]*(?:__erro|bau__aviso|estado--erro|estado--carregando)[^>]*>/g)) {
        if (m[0].includes('-cheia')) continue; // dica estática ligada ao campo por aria-describedby
        achados++;
        expect(m[0], arquivo).toMatch(/role="(?:alert|status)"|aria-live="polite"/);
      }
    }
    expect(achados).toBeGreaterThan(10);
  });

  it('avisos de sucesso são regiões educadas (status + aria-live="polite") presentes antes da mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn(rota('dados')));
    const { Bau } = await import('@/components/Bau');
    render(
      <SessaoProvider usuario={{ id: '1', nome: 'Ana', nivel: 1 }} csrf="csrf-falso">
        <Bau tipo="membros" titulo="Baú" />
      </SessaoProvider>,
    );
    await carregou();
    const aviso = document.querySelector('.aviso [role="status"]')!;
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(aviso).toBeEmptyDOMElement();
  });
});

/* ---------------------------------------------------------------- AC4: contraste dos tokens */

function tokens(trecho: string): Record<string, string> {
  return Object.fromEntries([...trecho.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe('WEB-065 AC4: contraste dos tokens calculado a partir de globals.css', () => {
  const fimEscuro = css.indexOf('@media (prefers-color-scheme: light)');
  const escuro = tokens(css.slice(0, fimEscuro));
  const claro = { ...escuro, ...tokens(css.slice(fimEscuro, css.indexOf('*,'))) };

  it.each([
    ['escuro', escuro],
    ['claro', claro],
  ] as const)('texto ≥ 4,5:1 em todo fundo onde aparece (tema %s)', (_n, t) => {
    const fundos = ['cor-fundo', 'cor-superficie'];
    for (const texto of ['cor-texto', 'cor-texto-suave', 'cor-destaque', 'cor-erro', 'cor-sucesso', 'cor-aviso']) {
      for (const fundo of fundos) {
        expect(contraste(t[texto]!, t[fundo]!), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contraste(t['cor-botao-texto']!, t['cor-botao']!), 'texto do botão').toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['escuro', escuro],
    ['claro', claro],
  ] as const)('componentes de interface (borda de campo, foco) ≥ 3:1 (tema %s)', (_n, t) => {
    for (const fundo of ['cor-fundo', 'cor-superficie']) {
      expect(contraste(t['cor-borda-campo']!, t[fundo]!), `borda de campo sobre ${fundo}`).toBeGreaterThanOrEqual(3);
      expect(contraste(t['cor-destaque']!, t[fundo]!), `foco sobre ${fundo}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('o texto do diálogo (superfície) e o botão selecionado mantêm contraste; todo token usado em var() existe', () => {
    const usados = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!));
    const definidos = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]!));
    for (const u of usados) expect(definidos.has(u), `--${u} sem definição`).toBe(true);
    expect(contraste(escuro['cor-texto']!, escuro['cor-superficie']!)).toBeGreaterThanOrEqual(7);
  });

  it('campos e opções de escolha usam a borda de campo, não a borda decorativa', () => {
    expect(/\.campo__entrada\s*\{[^}]*border:\s*1px solid var\(--cor-borda-campo\)/.test(css)).toBe(true);
    expect(/\.escolha__opcoes\s*\{[^}]*border:\s*1px solid var\(--cor-borda-campo\)/.test(css)).toBe(true);
  });
});

/* ---------------------------------------------------------------- WEB-069 (front): metadados e login */

describe('WEB-069 front: título por página, favicon, 404 e login', () => {
  it('toda page.tsx define metadata ou generateMetadata com título', () => {
    const paginas = arquivosTsx(join(RAIZ, 'src/app')).filter((a) => a.endsWith('page.tsx') && !a.includes('/api/'));
    expect(paginas.length).toBeGreaterThanOrEqual(8);
    for (const arquivo of paginas) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).toMatch(/export const metadata|export async function generateMetadata/);
    }
  });

  it('favicon simples roxo e preto em src/app/icon.svg', () => {
    const svg = readFileSync(join(RAIZ, 'src/app/icon.svg'), 'utf8');
    expect(svg).toMatch(/#0b0a10/i);
    expect(svg).toMatch(/#9000c0/i);
    expect(svg).not.toMatch(/<script|href=|url\(/i);
  });

  it('404 e erro estão em português, com h1, sem texto técnico', async () => {
    const { default: NaoEncontrada } = await import('@/app/not-found');
    const { default: Erro } = await import('@/app/error');
    const { default: ErroGlobal } = await import('@/app/global-error');
    const a = render(<NaoEncontrada />);
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    a.unmount();
    const erro = Object.assign(new Error('ECONNREFUSED stack'), { digest: 'd1' });
    const b = render(<Erro error={erro} reset={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|stack|d1/);
    b.unmount();
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<ErroGlobal error={erro} reset={() => undefined} />);
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('Algo deu errado');
    expect(html).not.toMatch(/ECONNREFUSED|stack|d1/);
  });

  it('a tela de login não carrega segredo, id de cliente nem destino do OAuth além da rota própria', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<TelaLogin erro="<script>alert(1)</script>" />);
    expect(html).toContain('href="/api/auth/login"');
    expect(html).not.toMatch(/discord\.com|client_id|secret|webhook|process\.env|<script/i);
    const fonte = readFileSync(join(RAIZ, 'src/components/TelaLogin.tsx'), 'utf8') + readFileSync(join(RAIZ, 'src/app/login/page.tsx'), 'utf8');
    expect(fonte).not.toMatch(/process\.env|getEnv/);
  });

  it('sem imports mortos: todo import nomeado de src/app e src/components é usado no arquivo', () => {
    const arquivos = [...arquivosTsx(join(RAIZ, 'src/app')).filter((a) => !a.includes('/api/')), ...arquivosTsx(join(RAIZ, 'src/components'))];
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(/^import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"][^'"]+['"];?$/gm)) {
        const nomes = [m[1], ...(m[2] ?? '').split(',').map((p) => p.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop())].filter(Boolean) as string[];
        const corpo = fonte.replace(m[0], '');
        for (const nome of nomes) expect(new RegExp(`\\b${nome}\\b`).test(corpo), `${arquivo}: import "${nome}" não usado`).toBe(true);
      }
    }
  });
});

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}
