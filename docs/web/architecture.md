# Stocky Web: arquitetura

Autor: `architect` · 05/11/2026 · Fontes: `docs/web/CONTEXTO.md`, `docs/web/requisitos.md`, `docs/web/config-discord.md`, `docs/web/backlog.md` (WEB-001 a WEB-071), código do bot arquivado (`utils/db.js`, `utils/validacao.js`, `utils/caixa.js`, `utils/permissoes.js`, `utils/embeds.js`, `utils/ui.js`, `interactions/bau-quantidade.js`, `interactions/caixa-modal.js`) e `docs/qa-report.md` (lições D1 a D6).

Este documento é o **contrato**. Quando ele diverge de um "arquivo provável" ou de um caminho de rota sugerido no backlog, vale o que está aqui. Mudança de contrato passa pelo architect; descoberta de problema novo volta ao `jira-manager`.

---

## 0. Decisões do usuário já incorporadas

| Pergunta | Decisão | Onde aparece |
|---|---|---|
| Cargos | `DISCORD_ROLE_MEMBRO/GERENTE/DONO` aceitam lista separada por vírgula; vale o maior nível | §4.5, WEB-018 |
| Q2/Q3 Visual | Roxo como destaque, fundo preto, texto branco; escuro é a base (tema claro só se o sistema pedir) | §7 |
| Q5 Limites | Item 1 a 100.000; caixa 1 a 1.000.000.000; nome 50; anotação 100 | §4.2 |
| Q6 Quem vê o quê | Nível 1 vê logs do Baú dos Membros; logs da gerência, do caixa, auditoria e ajuste em massa só nível 2+ | §6 |
| Q7 Sessão | Sessão de 7 dias (absoluta); cargos revalidados a cada 15 min | ADR-04 |
| Q8 Domínio | `*.vercel.app` | ADR-12 |
| Q9 Zerar | Digitar `ZERAR` | WEB-039/061 |
| Q11 Licença | MIT | §9 |
| Q12 | CI sim (WEB-007), Playwright não (WEB-067 **cancelado**) | §8 |

Padrões assumidos (sem resposta explícita, valem até o usuário dizer o contrário): Q1 nome de exibição "Stocky"; Q4 nomes de tela do bot, tom direto e neutro; Q10 a chave antiga do Firebase é tratada como vazada (rotação obrigatória no deploy).

---

## 1. ADRs

Formato: contexto → decisão → consequência.

**ADR-01 Stack e versões.** O CONTEXTO pede versões estáveis atuais. → Next.js **16.x** (16.4.5 no npm em 05/11/2026), React 19.x, TypeScript 5.x estrito, `firebase-admin` atual, `jose` para JWT, `zod` 4 para forma do corpo, Vitest + Testing Library + `vitest-axe`. Node `22.x` em `engines` e no CI (Next 16 exige Node ≥ 20.9). O backend-dev confirma cada versão com `npm view <pacote> version` ao criar o `package.json` e fixa versões exatas (sem `^`, `latest` ou `*`). → Next 16 removeu `next lint`: o script de lint chama o ESLint direto com `eslint-config-next` (flat config). O antigo `middleware.ts` chama-se `proxy.ts` no Next 16. Em rotas dinâmicas, `params` é `Promise`.

**ADR-02 Só Route Handlers, nenhuma Server Action.** Server actions são endpoints POST implícitos, difíceis de enumerar no teste de cobertura (WEB-026). → Toda leitura e escrita do front passa por `web/src/app/api/**/route.ts`. A diretiva `"use server"` é proibida em `web/src` (teste de varredura falha se aparecer). → WEB-026 AC5 é cumprido por proibição; server components de página só leem a sessão (guarda), nunca dados de domínio.

**ADR-03 Runtime Node, sempre dinâmico.** `firebase-admin` não roda no runtime edge. → Todo `route.ts` exporta `export const runtime = 'nodejs'` e `export const dynamic = 'force-dynamic'`. Nenhuma página protegida é pré-renderizada com dados. → Build não precisa de credencial real (WEB-069 AC2).

**ADR-04 Sessão JWT assinada, sem guardar token do Discord, revalidação por novo OAuth.** O bot não guarda token; guardar refresh token seria mais um segredo em repouso. → Cookie com JWT HS256 (`jose`) assinado com `SESSION_SECRET`, payload `{ sub, nome, nivel, sid, ini, cv }`, `exp = ini + 7 dias` (absoluto: revalidar não estende os 7 dias). `cv` (cargos verificados em) com mais de **15 min** ⇒ a sessão está em estado `revalidar`: rotas respondem 401 `REVALIDAR` e páginas redirecionam para `/api/auth/login?volta=<caminho>`. O login usa `prompt=none`, então quem já autorizou o app volta sem ver a tela do Discord. → Rebaixamento ou saída do servidor vale em no máximo 15 min. Custo de UX: a cada 15 min de uso há um redirecionamento de ~1 s; uma mutação recusada por `REVALIDAR` não foi executada (a guarda vem antes do handler), então refazer é seguro. Alternativa recusada: refresh token cifrado no Firestore (mais segredo guardado, mais código).

**ADR-05 Autorização por wrapper marcado e fail-closed.** → Toda exportação HTTP de `route.ts` é o retorno de `comAutorizacao(...)` ou `rotaPublica(...)`. Ambos anexam um símbolo `MARCA_ROTA` com a declaração (nível, csrf, público). O teste WEB-026 importa cada `route.ts`, exige a marca em cada método e compara com o manifesto. Autenticação **nunca** acontece no `proxy.ts` (ele só põe cabeçalhos); cada rota verifica sozinha.

**ADR-06 CSRF: Origin + token derivado da sessão.** → Mutação exige: `Origin` igual à origem de `APP_URL` (ausente ⇒ 403); `Sec-Fetch-Site`, se presente, igual a `same-origin`; `Content-Type: application/json` (senão 415, exceto `DELETE` sem corpo); cabeçalho `x-csrf-token` igual a `base64url(HMAC-SHA256(SESSION_SECRET, "csrf:" + sid))`, comparado com `timingSafeEqual`. O token chega ao front pelo layout protegido (prop) e por `GET /api/csrf`. → Sem estado no servidor; token muda a cada login.

**ADR-07 Limite de requisições em memória por instância.** Na Vercel não há memória compartilhada; um limitador no Firestore custaria uma escrita por requisição (cota grátis de 20 mil/dia). Público pequeno e todo autenticado. → Janela deslizante em memória (`Map`) por instância: 60 req/min por `userId` nas rotas protegidas, 10 req/min por IP (`x-forwarded-for`, primeiro valor, definido pela Vercel) em `/api/auth/login` e `/api/auth/callback`. Interface `Limitador` injetável para trocar por Firestore se precisar. → Limite é aproximado (cada instância conta separado); documentado no README. É defesa contra abuso acidental, não contra ataque distribuído.

**ADR-08 Modelo de dados com documento por agregado e versão.** → Catálogo num documento; cada baú num documento com `versao` e `itens` aninhados por categoria (sem chave composta, sem misturar metadado com item); saldo num documento; logs em subcoleções por escopo; auditoria em coleção própria. Ver §3. → Tudo cabe com folga em 1 MB; cada operação é uma transação curta.

**ADR-09 Ajuste em massa por ids com versão otimista (corrige D1 e D3).** → O cliente envia `{ categoriaId, itemId, quantidade }` (nunca texto livre) e, na confirmação, a `versao` vista na prévia. O servidor não guarda prévia. `versao` do baú sobe em **toda** escrita (adicionar, remover, zerar, ajuste, remover item do catálogo). Versão diferente ⇒ 409 `VERSAO_DESATUALIZADA`, nada gravado.

**ADR-10 Webhooks depois do commit com `after()`.** → As rotas chamam `publicarEvento(evento)` só depois que a transação confirmou; `publicarEvento` agenda o envio com `after()` de `next/server` (a Vercel mantém a função viva até terminar, sem atrasar a resposta). Em teste o agendador é injetado (`setAgendador`). Cliente de webhook nunca lança. Mensagens de inventário e saldo leem o estado atual no momento do envio (não o instantâneo do commit), para que o último envio mostre o estado mais novo.

**ADR-11 Semente do catálogo transacional e memorizada.** → `garantirCatalogo()` roda uma transação que lê `config/catalogo`, `baus/membros`, `baus/gerencia` e `caixa/saldo` e cria **só os ausentes** (D6). Depois do primeiro sucesso a instância guarda uma flag e não repete. Os serviços de domínio chamam `garantirCatalogo()` antes da própria transação; dentro dela, catálogo ausente vira erro interno (nunca semente silenciosa fora de transação).

**ADR-12 Uma origem só (`APP_URL`).** → `redirect_uri`, checagem de `Origin` e links dos webhooks derivam de `APP_URL` (produção, `https://<projeto>.vercel.app`). Deploys de preview da Vercel têm outra URL e **não conseguem fazer login** (o Discord recusa o redirect e o CSRF recusa a origem). Aceito: só produção e `localhost` funcionam.

**ADR-13 Código compartilhado sem segredo.** O front precisa dos mesmos limites, do mesmo parser numérico e dos tipos das respostas. → `web/src/compartilhado/**` (dono: backend-dev) contém só código puro: `LIMITES`, `parseInteiro`, `formatarDinheiro`, tipos de DTO e códigos de erro. Não importa `server-only`, `@/server/**` nem nada de Node. Componentes `"use client"` podem importar dele; nunca de `@/server/**`.

**ADR-14 Validação de corpo com zod + parser próprio.** → Forma do corpo com `z.strictObject` (campo extra ⇒ 400). Números passam por `parseInteiro` (string de dígitos ASCII ou número inteiro do JSON). Mensagens de erro do zod nunca vão ao usuário cruas: o helper converte em mensagem fixa em português.

**ADR-15 Dependências injetáveis para teste.** → `getDb/setDb/resetDb` (Firestore), `setFetch` (Discord e webhooks), `setAgendador` (pós-commit), `setLimitador`, `resetEnv`, `resetSemente`. O relógio é `Date.now()` para que `vi.useFakeTimers()` funcione. No Vitest, o pacote `server-only` é apontado para um módulo vazio por alias (senão ele lança fora do React Server).

**ADR-16 Zerar baú vazio é válido.** → Zerar sempre grava auditoria (com `antes` possivelmente vazio), sobe a `versao` de cada baú alvo e cria um log por baú. Dois zerar simultâneos: o segundo registra `antes` vazio (WEB-039 AC4). Nunca há auditoria com conteúdo duplicado.

**ADR-17 Uma mensagem fixa de inventário por baú.** O limite do Discord é 6000 caracteres somando **todos** os embeds de uma mensagem; 150 itens não cabem sempre. → Uma mensagem por baú, até 10 embeds e 6000 caracteres; o excedente vira "… e mais N itens, veja no site" com link para `APP_URL/bau/<tipo>`. Criação da mensagem usa reserva transacional (§4.10) para não duplicar.

**ADR-18 Índice composto só para a auditoria filtrada.** → Filtro por ação (`where acao ==` + `orderBy data desc`) exige índice composto: vai em `web/firestore.indexes.json` e no passo de deploy. Logs não precisam (uma subcoleção por escopo, ordenação de campo único). O fake não exige índice, então o QA confere o arquivo de índices por teste.

---

## 2. Estrutura de pastas de `web/`

Dono entre colchetes: **B** = backend-dev, **F** = frontend-dev, **Q** = qa-engineer.

```
web/
├── package.json, package-lock.json            [B]
├── tsconfig.json, next.config.ts              [B]
├── eslint.config.mjs, vitest.config.ts        [B]
├── firestore.rules, firestore.indexes.json, firebase.json   [B]
├── vercel.json                                [B] (região das funções, sem segredo)
├── .gitignore, .env.example                   [B]
├── README.md, LICENSE (MIT)                   [B]
├── scripts/
│   ├── verificar-bundle.mjs                   [B] WEB-027
│   └── verificar-build.mjs                    [B] WEB-069
├── src/
│   ├── proxy.ts                               [B] cabeçalhos + nonce da CSP (sem auth)
│   ├── compartilhado/                         [B] puro, importável pelo cliente (ADR-13)
│   │   ├── limites.ts                         LIMITES, constantes de sessão
│   │   ├── numero.ts                          parseInteiro
│   │   ├── formatacao.ts                      formatarDinheiro, formatarNumero, formatarData
│   │   ├── erros.ts                           CodigoErro, MENSAGENS_LOGIN
│   │   └── api-tipos.ts                       DTOs das respostas e corpos
│   ├── server/                                [B] tudo importa 'server-only'
│   │   ├── env.ts, contexto.ts, erros.ts, http.ts, log.ts, paginacao.ts, firebase.ts
│   │   ├── validacao/   item.ts, corpo.ts, texto.ts
│   │   ├── dominio/     tipos.ts, refs.ts
│   │   ├── catalogo/    padrao.ts, semente.ts, leitura.ts, operacoes.ts
│   │   ├── bau/         leitura.ts, operacoes.ts, zerar.ts, ajuste.ts
│   │   ├── caixa/       leitura.ts, operacoes.ts
│   │   ├── logs/        registrar.ts, leitura.ts
│   │   ├── auditoria/   registrar.ts, leitura.ts
│   │   ├── auth/        sessao.ts, oauth.ts, niveis.ts, revalidacao.ts, autorizacao.ts, pagina.ts
│   │   ├── seguranca/   csrf.ts, limite.ts, cabecalhos.ts
│   │   ├── discord/     api.ts, webhook.ts
│   │   └── webhooks/    formatacao.ts, movimentacao.ts, inventario-embeds.ts, mensagem-fixa.ts,
│   │                    inventario.ts, saldo.ts, eventos.ts
│   ├── app/
│   │   ├── api/**                             [B] rotas (§5)
│   │   ├── layout.tsx, globals.css, page.tsx, error.tsx, loading.tsx, not-found.tsx   [F]
│   │   ├── login/page.tsx                     [F]
│   │   └── (protegido)/                       [F]
│   │       ├── layout.tsx                     guarda de sessão + SessaoProvider + navegação
│   │       ├── bau/[tipo]/page.tsx
│   │       ├── caixa/page.tsx
│   │       ├── painel/page.tsx
│   │       ├── ajuste/[tipo]/page.tsx
│   │       ├── logs/page.tsx
│   │       └── auditoria/page.tsx
│   └── components/                            [F]
│       ├── api.ts                             cliente HTTP (WEB-052)
│       ├── SessaoProvider.tsx, Navegacao.tsx, SemPermissao.tsx, Estados.tsx, Dialogo.tsx
│       ├── CampoQuantidade.tsx
│       └── Bau.tsx, Caixa.tsx, Catalogo.tsx, ZerarBau.tsx, AjusteTabela.tsx, Logs.tsx, Auditoria.tsx
└── test/
    ├── setup.ts                               [B]
    ├── helpers/                               [B] fake-firestore.ts, fake-fetch.ts, requisicao.ts, sessao-teste.ts, env-teste.ts
    ├── server/**                              [B]
    ├── ui/**                                  [F] (o smoke inicial é criado por B na onda 0 e passa a F)
    │   └── helpers/                           [F] render com SessaoProvider, mock do api.ts
    └── qa/**                                  [Q]
```

Também fora de `web/`: `.github/workflows/web.yml` [B]; `docs/web/deploy.md` [B]; `docs/web/architecture.md` [architect]; `docs/web/backlog.md` [jira-manager]; `docs/web/qa-report.md` [Q].

Regras de import (verificadas por teste, WEB-010/027):
- `@/server/**` só é importado por `app/api/**`, por server components (sem `"use client"`) e por testes.
- `"use client"` e `components/**` importam só `@/compartilhado/**`, `@/components/**`, React e Next.
- `firebase-admin` só em `server/firebase.ts`. O pacote `firebase` (SDK cliente) não pode existir no `package.json`.

---

## 3. Modelo de dados (Firestore)

Todos os campos de data são string ISO 8601 em UTC gerada no servidor (`new Date().toISOString()`). Usuário é sempre `{ id: string, nome: string }` vindo da sessão.

| Caminho | Conteúdo | Escrito por |
|---|---|---|
| `config/catalogo` | `DocCatalogo` | semente, catálogo |
| `baus/membros`, `baus/gerencia` | `DocBau` | semente, baú, zerar, ajuste, remover do catálogo |
| `caixa/saldo` | `DocSaldo` | semente, caixa |
| `logs/{membros\|gerencia\|caixa}/entradas/{autoId}` | `LogBau` ou `LogCaixa` | mesma transação da alteração |
| `auditoria/{autoId}` | `DocAuditoria` | mesma transação da alteração |
| `webhook_mensagens/{inventario_membros\|inventario_gerencia\|saldo_caixa}` | `DocMensagemFixa` | pós-commit (§4.10) |

```ts
// web/src/server/dominio/tipos.ts
export type TipoBau = 'membros' | 'gerencia';
export type AlvoZerar = TipoBau | 'ambos';
export type TipoCaixa = 'sujo' | 'limpo';
export type AcaoCaixa = 'entrada' | 'saida';
export type EscopoLog = TipoBau | 'caixa';
export type Nivel = 0 | 1 | 2 | 3;
export type NivelAcesso = 1 | 2 | 3;
export interface UsuarioRef { id: string; nome: string }
export interface UsuarioSessao extends UsuarioRef { nivel: NivelAcesso }

export interface ItemCatalogo { id: string; nome: string }
export interface CategoriaCatalogo { id: string; nome: string; emoji: string; itens: ItemCatalogo[] } // ordem do array = ordem de exibição
export interface DocCatalogo { categorias: CategoriaCatalogo[]; atualizadoEm: string }

export interface DocBau {
  versao: number;                                    // inteiro ≥ 0, +1 em toda escrita
  itens: Record<string, Record<string, number>>;     // itens[categoriaId][itemId] = quantidade > 0
  atualizadoEm: string;
}
export interface DocSaldo { sujo: number; limpo: number; versao: number; atualizadoEm: string }

export type AcaoLogBau = 'adicionar' | 'remover' | 'zerar' | 'ajuste' | 'catalogo_remover';
export interface LogBau {
  acao: AcaoLogBau; usuario: UsuarioRef; data: string; versao: number;
  // presentes em adicionar/remover/catalogo_remover; null em zerar/ajuste
  categoriaId: string | null; itemId: string | null; nomeItem: string | null; nomeCategoria: string | null;
  quantidade: number | null; saldoResultante: number | null;
  // zerar/ajuste: resumo e ligação com a auditoria
  resumo: string | null; auditoriaId: string | null;
}
export interface LogCaixa {
  acao: AcaoCaixa; tipo: TipoCaixa; valor: number; anotacao: string;
  saldoResultante: number; usuario: UsuarioRef; data: string;
}

export type AcaoAuditoria = 'catalogo.adicionar_item' | 'catalogo.remover_item' | 'bau.zerar' | 'bau.ajuste_massa';
export interface DocAuditoria {
  acao: AcaoAuditoria; usuario: UsuarioRef; data: string;
  alvo: Record<string, string | string[]>;  // ex.: { tipo: 'membros' } | { alvos: ['membros','gerencia'] } | { categoriaId, itemId, nomeItem }
  resumo: string;                           // texto curto pt-BR para a lista (≤ 200)
  antes: unknown;                           // mapas categoriaId → itemId → quantidade, por baú quando aplicável
  depois: unknown;                          // null em remoção; {} em zerar
}
export interface DocMensagemFixa { mensagemId: string | null; reservadoAte: string | null; atualizadoEm: string }
```

Notas:
- O baú nunca tem chave com quantidade 0: ao zerar a quantidade, a chave do item é apagada, e a categoria vazia também.
- Id de item é único **por categoria**; a chave no baú é `itens[categoriaId][itemId]` (WEB-035 AC6). Ids seguem `^[a-z0-9]+(_[a-z0-9]+)*$`, até 50 caracteres, então são seguros como nome de campo do Firestore.
- Tamanho: 6 categorias × 25 itens dão menos de 10 KB por baú e no catálogo; auditoria de `zerar('ambos')` tem no máximo 300 números. Ajuste grava 3 documentos por transação (baú, auditoria, um log), bem abaixo do limite de 500 escritas.
- Paginação (logs, histórico, auditoria): ordena por `data desc` (o Firestore desempata por id do documento); `cursor` é o id do último documento da página; o servidor lê esse documento e usa `startAfter(snapshot)`. Cursor inexistente ⇒ 400. `limite` padrão 20, aceito de 1 a 100, fora disso ⇒ 400 (decisão: recusar, não reduzir).
- Índice composto em `firestore.indexes.json`: coleção `auditoria`, campos `acao ASC, data DESC` (ADR-18).
- Regras: `match /{document=**} { allow read, write: if false; }` e nada mais (WEB-012).

### 3.1 Catálogo padrão (WEB-014), copiado de `utils/db.js` do bot

Ids mantidos como no bot (todos casam o padrão seguro). A detecção de duplicado compara `id` **e** `gerarIdItem(nome)` dos itens existentes, então cadastrar "Desert Eagle" (id `desert_eagle`) é recusado como duplicado de `desert`.

```ts
// web/src/server/catalogo/padrao.ts
export const CATALOGO_PADRAO: readonly CategoriaCatalogo[] = deepFreeze([
  { id: 'medicamentos', nome: 'Medicamentos', emoji: '💊', itens: [
    { id: 'bandagem', nome: 'Bandagem' },
    { id: 'gaze', nome: 'Gaze' },
    { id: 'adrenalina', nome: 'Adrenalina' },
  ]},
  { id: 'armas', nome: 'Armas', emoji: '🔫', itens: [
    { id: 'colt', nome: 'Colt' },
    { id: 'usp', nome: 'USP' },
    { id: 'desert', nome: 'Desert Eagle' },
    { id: 'ak_47', nome: 'AK 47' },
  ]},
  { id: 'coletesemuni', nome: 'Coletes e Munição', emoji: '🦺', itens: [
    { id: 'colete', nome: 'Colete' },
    { id: 'colete_danificado', nome: 'Colete Danificado' },
    { id: 'muni_9mm', nome: 'Munição 9MM' },
    { id: 'muni_45acp', nome: 'Munição .45 ACP' },
    { id: 'muni_50', nome: 'Munição .50' },
    { id: 'muni_50ae', nome: 'Munição .50 AE' },
  ]},
  { id: 'materiais', nome: 'Materiais', emoji: '🪛', itens: [
    { id: 'laptop', nome: 'Laptop' },
    { id: 'caixa_polvora', nome: 'Caixa de Pólvora' },
    { id: 'sulfato_bario', nome: 'Sulfato de Bário' },
    { id: 'alcool_gel', nome: 'Álcool em Gel' },
    { id: 'sabonete', nome: 'Sabonete' },
    { id: 'pecas_roupas', nome: 'Peças de Roupas' },
    { id: 'kit_eletronico', nome: 'Kit Eletrônico' },
    { id: 'cobre', nome: 'Cobre' },
    { id: 'plastico', nome: 'Plástico' },
    { id: 'sucata_metal', nome: 'Sucata de Metal' },
    { id: 'aluminio', nome: 'Alumínio' },
    { id: 'borracha', nome: 'Borracha' },
  ]},
  { id: 'drogas', nome: 'Drogas', emoji: '🌿', itens: [
    { id: 'cocaina', nome: 'Cocaína' },
    { id: 'lsd', nome: 'LSD' },
    { id: 'meta', nome: 'Meta' },
  ]},
  { id: 'extras', nome: 'Extras', emoji: '📦', itens: [
    { id: 'fichas_cassino', nome: 'Fichas de Cassino' },
    { id: 'agulha', nome: 'Agulha' },
    { id: 'linha', nome: 'Linha' },
    { id: 'resina', nome: 'Resina' },
    { id: 'tesoura', nome: 'Tesoura' },
    { id: 'notas_marcadas', nome: 'Notas Marcadas' },
  ]},
]);
```
Total: 6 categorias, 34 itens (máximo de 12 por categoria, abaixo de 25). O teste de WEB-014 confere esta lista item a item contra o `utils/db.js` do bot (lendo o arquivo do bot como texto), para que uma cópia errada falhe.

---

## 4. Contratos dos módulos de servidor

Convenções: todo arquivo de `server/` começa com `import 'server-only'`. Funções de domínio lançam `ErroApp`; nunca devolvem `{ sucesso: false }`. "Tx" no nome = recebe a transação aberta e não a cria. `usuario` é sempre o da sessão.

### 4.1 Infraestrutura

```ts
// server/env.ts (WEB-005)
export type CanalWebhook = 'logMembros' | 'logGerencia' | 'logCaixa' | 'inventarioMembros' | 'inventarioGerencia' | 'saldoCaixa';
export interface Env {
  producao: boolean;                                   // NODE_ENV === 'production'
  appUrl: string;                                      // origem, sem barra final
  sessionSecret: string;                               // ≥ 32 caracteres
  firebase: { projectId: string; clientEmail: string; privateKey: string }; // '\n' literal convertido
  discord: { clientId: string; clientSecret: string; guildId: string;
             cargos: { membro: readonly string[]; gerente: readonly string[]; dono: readonly string[] } };
  webhooks: Readonly<Record<CanalWebhook, string>>;
}
export function getEnv(): Env;            // lê process.env na 1ª chamada e memoriza; erro lista TODAS as ausentes/invalidas pelo nome, nunca valores
export function resetEnv(): void;         // testes
export function valoresSecretos(): string[]; // para o logger mascarar (segredos presentes, sem lançar se env inválido)
```
Variáveis (lista canônica; substitui a de `requisitos.md`):

| Variável | Obrigatória | Segredo | Validação |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | sim | sim | não vazia |
| `FIREBASE_CLIENT_EMAIL` | sim | sim | contém `@` |
| `FIREBASE_PRIVATE_KEY` | sim | sim | contém `BEGIN PRIVATE KEY` após converter `\n` |
| `DISCORD_CLIENT_ID` | sim | público | snowflake `^\d{17,20}$` |
| `DISCORD_CLIENT_SECRET` | sim | sim | não vazia |
| `DISCORD_GUILD_ID` | sim | público | snowflake |
| `DISCORD_ROLE_MEMBRO`, `DISCORD_ROLE_GERENTE`, `DISCORD_ROLE_DONO` | podem ser vazias, mas ao menos um cargo no total | público | lista por vírgula; cada item com `trim`, vazios descartados, cada um snowflake |
| `SESSION_SECRET` | sim | sim | ≥ 32 caracteres |
| `APP_URL` | sim | público | `https://...`; `http://localhost[:porta]` só fora de produção |
| `WEBHOOK_LOG_MEMBROS`, `WEBHOOK_LOG_GERENCIA`, `WEBHOOK_LOG_CAIXA`, `WEBHOOK_INVENTARIO_MEMBROS`, `WEBHOOK_INVENTARIO_GERENCIA`, `WEBHOOK_SALDO_CAIXA` | sim | sim | `^https://(discord\.com\|discordapp\.com)/api/webhooks/\d+/[\w-]+$` |

`FIREBASE_PRIVATE_KEY_ID` foi **retirada** (o `cert()` do Admin SDK não usa). Os testes de WEB-004/068/070 comparam contra esta tabela. Valores para `.env.example` (padrão falso): ids de config-discord.md são públicos e podem ir como exemplo; segredos `troque-aqui`, webhook `https://discord.com/api/webhooks/000000000000000000/troque-aqui`.

```ts
// server/contexto.ts (ADR-15)
export type Agendador = (tarefa: () => Promise<void>) => void;
export function getFetch(): typeof fetch;     export function setFetch(f: typeof fetch): void;
export function agendar(tarefa: () => Promise<void>): void;  // padrão: after() de next/server; captura e loga erro
export function setAgendador(a: Agendador): void;
export function resetContexto(): void;

// server/erros.ts (WEB-006)  — CodigoErro vem de compartilhado/erros.ts
export type CodigoErro =
  | 'VALIDACAO' | 'SEM_SESSAO' | 'REVALIDAR' | 'SEM_PERMISSAO' | 'CSRF' | 'NAO_ENCONTRADO'
  | 'ESTOQUE_INSUFICIENTE' | 'SALDO_INSUFICIENTE' | 'DUPLICADO' | 'LIMITE_CATEGORIA' | 'VERSAO_DESATUALIZADA'
  | 'METODO' | 'CORPO_GRANDE' | 'TIPO_CONTEUDO' | 'LIMITE_REQUISICOES' | 'INTERNO';
// status: VALIDACAO 400 · SEM_SESSAO/REVALIDAR 401 · SEM_PERMISSAO/CSRF 403 · NAO_ENCONTRADO 404 · METODO 405
//         ESTOQUE_INSUFICIENTE/SALDO_INSUFICIENTE/DUPLICADO/LIMITE_CATEGORIA/VERSAO_DESATUALIZADA 409
//         CORPO_GRANDE 413 · TIPO_CONTEUDO 415 · LIMITE_REQUISICOES 429 · INTERNO 500
export class ErroApp extends Error {
  constructor(codigo: CodigoErro, mensagem?: string, detalhes?: DetalhesErro);
  readonly codigo: CodigoErro; readonly status: number; readonly detalhes?: DetalhesErro;
}
export type DetalhesErro = { linhas?: Array<{ indice: number; categoriaId?: string; itemId?: string; motivo: string }>; retryAfter?: number };
export function paraErroApp(e: unknown): ErroApp; // desconhecido → INTERNO com 'Ocorreu um erro. Tente de novo em instantes.'

// server/http.ts (WEB-006)
// Corpo: { ok: true, dados } | { ok: false, erro: string, codigo: CodigoErro, detalhes? }
// Sempre com Cache-Control: no-store e Content-Type application/json; nunca stack.
export function responderOk<T>(dados: T, init?: { status?: number; headers?: HeadersInit }): Response;
export function responderErro(e: unknown): Response;     // loga INTERNO com log.erro; 429 põe Retry-After
export async function lerJson(req: Request, maxBytes: number): Promise<unknown>; // 413 por Content-Length ou tamanho lido; JSON inválido → VALIDACAO

// server/log.ts (WEB-006)
export const log: { info(msg: string, ctx?: object): void; aviso(...): void; erro(msg: string, e?: unknown, ctx?: object): void };
// mascara valoresSecretos(), URLs de webhook, padrões de token do Discord, 'Bearer ...', 'code=...'

// server/paginacao.ts
export interface Paginacao { limite: number; cursor: string | null }
export function lerPaginacao(sp: URLSearchParams): Paginacao; // limite 1..100 (padrão 20) via parseInteiro; cursor ehIdDocumento; senão VALIDACAO
export interface Pagina<T> { itens: T[]; proximoCursor: string | null }

// server/firebase.ts (WEB-010)
export type Db = import('firebase-admin/firestore').Firestore;
export function getDb(): Db;   // initializeApp no máximo uma vez, com getEnv().firebase
export function setDb(db: Db): void;  export function resetDb(): void;
```

### 4.2 Validação

```ts
// compartilhado/limites.ts (WEB-008)
export const LIMITES = Object.freeze({
  QUANTIDADE_MIN: 1, QUANTIDADE_MAX: 100_000,
  VALOR_CAIXA_MIN: 1, VALOR_CAIXA_MAX: 1_000_000_000,
  NOME_ITEM_MAX: 50, ID_ITEM_MAX: 50, ITENS_POR_CATEGORIA_MAX: 25,
  ANOTACAO_MAX: 100, AJUSTE_LINHAS_MAX: 200, PAGINA_MAX: 100,
  CORPO_MAX_BYTES: 10_240, CORPO_AJUSTE_MAX_BYTES: 102_400,
});
export const SESSAO_DURACAO_MS = 7 * 24 * 60 * 60 * 1000;
export const REVALIDACAO_MS = 15 * 60 * 1000;
export const FRASE_ZERAR = 'ZERAR';

// compartilhado/numero.ts (WEB-008)
export type ResultadoInteiro = { ok: true; valor: number } | { ok: false; motivo: 'formato' | 'minimo' | 'maximo'; erro: string };
export function parseInteiro(v: unknown, op: { min: number; max: number }): ResultadoInteiro;
// aceita number inteiro seguro, ou string /^[0-9]+$/ (ASCII, sem trim interno; trim só nas pontas) com ≤ 15 dígitos
// mensagens: formato 'Digite apenas números inteiros, sem pontos, vírgulas ou sinais.'
//            minimo 'O valor mínimo é X.'  maximo 'Valor acima do limite (máx. X).'  (X formatado com ponto)

// server/validacao/item.ts (WEB-009)
export function gerarIdItem(nome: string): string;   // mesma regra do bot (minúsculo, sem acento, [^a-z0-9]→'_', colapsa, apara, ≤ 50)
export function validarNomeItem(nome: unknown): { ok: true; nome: string; id: string } | { ok: false; erro: string };
export function ehIdSeguro(v: unknown): v is string;  // ^[a-z0-9]+(_[a-z0-9]+)*$ e ≤ 50; recusa __proto__, '..', '/', '%2F'
export function ehIdDocumento(v: unknown): v is string; // ^[A-Za-z0-9]{1,40}$ (ids automáticos do Firestore)

// server/validacao/texto.ts
export function normalizarAnotacao(v: unknown): string; // remove \p{Cc}, colapsa espaços, trim; vazio ou > 100 → ErroApp VALIDACAO

// server/validacao/corpo.ts (ADR-14)
export function validarCorpo<T>(esquema: z.ZodType<T>, dados: unknown): T; // erro → VALIDACAO com mensagem pt-BR fixa
export const esquemaMovimentoBau;      // { categoriaId, itemId, quantidade: number|string }
export const esquemaMovimentoCaixa;    // { tipo, acao, valor: number|string, anotacao: string }
export const esquemaNovoItem;          // { categoriaId, nome }
export const esquemaZerar;             // { alvo, confirmacao }
export const esquemaPrevia;            // { linhas: Array<{ categoriaId, itemId, quantidade }> }
export const esquemaConfirmar;         // { versao: number, linhas: [...] }
// todos z.strictObject; ids passam por ehIdSeguro; números por parseInteiro dentro do serviço
```

### 4.3 Domínio, catálogo e semente

```ts
// server/dominio/refs.ts (WEB-013)
export function exigirTipoBau(v: unknown): TipoBau;         // senão ErroApp VALIDACAO 'Tipo de baú inválido.'
export function exigirAlvoZerar(v: unknown): AlvoZerar;
export function exigirEscopoLog(v: unknown): EscopoLog;
export function refCatalogo(db: Db): DocumentReference;
export function refBau(db: Db, tipo: TipoBau): DocumentReference;
export function refSaldo(db: Db): DocumentReference;
export function refLogs(db: Db, escopo: EscopoLog): CollectionReference;
export function refAuditoria(db: Db): CollectionReference;
export function refMensagemFixa(db: Db, chave: 'inventario_membros' | 'inventario_gerencia' | 'saldo_caixa'): DocumentReference;
export function lerDocBau(dados: unknown): DocBau;    // normaliza: só itens[cat][item] com inteiro > 0; ignora qualquer outra chave
export function lerDocSaldo(dados: unknown): DocSaldo; // ausente → 0

// server/catalogo/semente.ts (WEB-014)
export async function garantirCatalogo(): Promise<void>;  // ADR-11; cria config/catalogo, baus/* (versao 0, itens {}), caixa/saldo (0, 0, versao 0) só se ausentes
export function resetSemente(): void;

// server/catalogo/leitura.ts (WEB-028)
export async function lerCatalogo(): Promise<CatalogoDTO>;
export async function lerCatalogoTx(tx: Transaction, db: Db): Promise<DocCatalogo>; // ausente → ErroApp INTERNO

// server/catalogo/operacoes.ts (WEB-035, WEB-036)
export async function adicionarItemAoCatalogo(categoriaId: string, nome: unknown, usuario: UsuarioRef):
  Promise<{ categoriaId: string; item: ItemCatalogo }>;
// erros: VALIDACAO (nome), NAO_ENCONTRADO (categoria), DUPLICADO, LIMITE_CATEGORIA; auditoria 'catalogo.adicionar_item' na mesma tx
export async function removerItemDoCatalogo(categoriaId: string, itemId: string, usuario: UsuarioRef):
  Promise<{ item: ItemCatalogo; removidoDe: Record<TipoBau, number>; auditoriaId: string }>;
// uma tx: catálogo + os 2 baús (versao +1 nos dois, sempre) + auditoria 'catalogo.remover_item' + log 'catalogo_remover' em cada baú com quantidade > 0
```

### 4.4 Baú, caixa, logs e auditoria

```ts
// compartilhado/api-tipos.ts (DTOs devolvidos pelas rotas)
export interface CatalogoDTO { categorias: Array<{ id: string; nome: string; emoji: string; itens: ItemCatalogo[]; total: number }> }
export interface BauDTO { tipo: TipoBau; versao: number;
  categorias: Array<{ id: string; nome: string; emoji: string; itens: Array<{ id: string; nome: string; quantidade: number }> }> }
// todas as categorias do catálogo, na ordem dele; itens com quantidade > 0 ordenados por nome (localeCompare 'pt-BR'); item fora do catálogo → nome 'Item removido'
export interface MovimentoBauDTO { categoriaId: string; itemId: string; quantidade: number; versao: number }
export interface SaldoDTO { sujo: number; limpo: number }
export interface PreviaAjusteDTO { tipo: TipoBau; versao: number; alterados: number;
  linhas: Array<{ categoriaId: string; itemId: string; nome: string; antes: number; depois: number }> }
export interface ConfirmacaoAjusteDTO { alterados: number; versao: number; auditoriaId: string | null }
export interface ZerarDTO { alvos: TipoBau[]; itens: number; unidades: number; auditoriaId: string }
export interface LogDTO { id: string; /* campos de LogBau ou LogCaixa */ }
export interface AuditoriaResumoDTO { id: string; acao: AcaoAuditoria; usuario: UsuarioRef; data: string; resumo: string }
export interface AuditoriaDetalheDTO extends AuditoriaResumoDTO { alvo: unknown; antes: unknown; depois: unknown }

// server/bau/leitura.ts (WEB-028)
export async function lerBau(tipo: TipoBau): Promise<BauDTO>;  // chama garantirCatalogo; nenhuma outra escrita

// server/bau/operacoes.ts (WEB-029, WEB-030)
export interface PedidoMovimentoBau { tipo: TipoBau; categoriaId: string; itemId: string; quantidade: unknown }
export async function adicionarAoBau(p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<MovimentoBauDTO>;
export async function removerDoBau(p: PedidoMovimentoBau, usuario: UsuarioRef): Promise<MovimentoBauDTO>;
// uma tx: lê catálogo + baú; valida item ∈ categoria (NAO_ENCONTRADO); soma/subtrai; MAX_SAFE_INTEGER → VALIDACAO;
// remover: ausente → NAO_ENCONTRADO 'O item não está no baú.'; insuficiente → ESTOQUE_INSUFICIENTE 'Estoque insuficiente. Disponível: N.'
// zero → apaga a chave; versao +1; registrarLogTx na mesma tx

// server/bau/zerar.ts (WEB-038)
export async function zerarBau(alvo: unknown, usuario: UsuarioRef): Promise<ZerarDTO>;  // ADR-16; uma tx, uma auditoria, um log por baú

// server/bau/ajuste.ts (WEB-040, WEB-041)
export interface LinhaAjuste { categoriaId: unknown; itemId: unknown; quantidade: unknown } // quantidade 0..100000
export async function preverAjuste(tipo: TipoBau, linhas: unknown): Promise<PreviaAjusteDTO>;  // somente leitura (get simples, sem tx)
export async function confirmarAjuste(tipo: TipoBau, versaoVista: unknown, linhas: unknown, usuario: UsuarioRef): Promise<ConfirmacaoAjusteDTO>;
// validação comum: vazio/ > 200 / repetido / item inexistente / quantidade inválida → VALIDACAO com detalhes.linhas (todas as inválidas)
// confirmar: tx lê baú+catálogo; versao ≠ versaoVista → VERSAO_DESATUALIZADA 'O baú mudou desde o resumo. Refaça o ajuste.'
// alterados 0 → sucesso sem escrita; senão baú (versao +1) + auditoria 'bau.ajuste_massa' + 1 log 'ajuste'

// server/caixa/leitura.ts (WEB-032)
export async function lerSaldo(): Promise<SaldoDTO>;
export async function lerHistoricoCaixa(p: Paginacao): Promise<Pagina<LogDTO>>;   // = lerLogs('caixa', p)

// server/caixa/operacoes.ts (WEB-033)
export async function movimentarCaixa(p: { tipo: unknown; acao: unknown; valor: unknown; anotacao: unknown }, usuario: UsuarioRef): Promise<SaldoDTO>;
// tx: saldo + log 'caixa'; saída maior que saldo → SALDO_INSUFICIENTE 'Saldo insuficiente. Disponível: $N.'

// server/logs/registrar.ts e server/auditoria/registrar.ts
export function registrarLogTx(tx: Transaction, db: Db, escopo: EscopoLog, entrada: Omit<LogBau, 'data'> | Omit<LogCaixa, 'data'>): string;
export function registrarAuditoriaTx(tx: Transaction, db: Db, entrada: Omit<DocAuditoria, 'data'>): string; // devolve o id gerado

// server/logs/leitura.ts (WEB-043) e server/auditoria/leitura.ts (WEB-044)
export async function lerLogs(escopo: EscopoLog, p: Paginacao): Promise<Pagina<LogDTO>>;
export async function lerAuditoria(p: Paginacao & { acao: AcaoAuditoria | null }): Promise<Pagina<AuditoriaResumoDTO>>;
export async function lerAuditoriaPorId(id: string): Promise<AuditoriaDetalheDTO>; // inexistente → NAO_ENCONTRADO
export function exigirAcaoAuditoria(v: string | null): AcaoAuditoria | null;      // desconhecida → VALIDACAO
```

### 4.5 Autenticação, autorização e segurança

```ts
// server/auth/niveis.ts (WEB-018)
export function nivelDeCargos(roles: unknown, cargos: Env['discord']['cargos']): Nivel;
// não-array → 0; ignora strings vazias; dono ⊃ gerente ⊃ membro; maior nível vence; lista vazia de config nunca casa

// server/auth/sessao.ts (WEB-015)
export interface Sessao { sub: string; nome: string; nivel: NivelAcesso; sid: string; ini: number; cv: number; exp: number }
export function nomeCookieSessao(): string;   // '__Host-stocky_sessao' em produção; 'stocky_sessao' fora
export async function criarTokenSessao(d: { userId: string; nome: string; nivel: NivelAcesso; ini?: number }): Promise<string>; // sid 128 bits; cv = agora
export async function lerSessao(token: string | undefined): Promise<Sessao | null>; // assinatura, alg HS256 fixo, exp; nunca lança
export type EstadoSessao = 'ok' | 'revalidar';
export function estadoSessao(s: Sessao, agoraMs: number): EstadoSessao;
export function cookieSessao(token: string): ResponseCookie;   // HttpOnly, Secure (prod), SameSite=Lax, Path=/, Max-Age = segundos até exp
export function cookieApagarSessao(): ResponseCookie;           // Max-Age=0, mesmo Path

// server/auth/revalidacao.ts (WEB-020)
export function precisaRevalidar(s: Sessao, agoraMs: number): boolean; // agora - cv > REVALIDACAO_MS

// server/auth/oauth.ts (WEB-016, WEB-019)
export const NOME_COOKIE_STATE = 'stocky_oauth';
export function caminhoVoltaSeguro(v: unknown): string;   // só caminhos internos de uma lista fixa (/, /bau/membros, ...); senão '/'
export async function iniciarLogin(volta: unknown): Promise<{ url: string; cookieState: ResponseCookie }>;
// URL https://discord.com/oauth2/authorize com client_id, redirect_uri=${APP_URL}/api/auth/callback, response_type=code,
// scope='identify guilds.members.read', state (32 bytes base64url), prompt=none
// cookie: JWT 10 min { state, volta }, HttpOnly, Secure(prod), SameSite=Lax, Path=/api/auth
export async function concluirLogin(url: URL, cookieState: string | undefined, sessaoAtual: Sessao | null):
  Promise<{ ok: true; token: string; volta: string } | { ok: false; erro: 'state' | 'negado' | 'sem_acesso' | 'discord' }>;
// ordem: state (não chama Discord se falhar) → error/code → trocarCodigo → obterMembro → nivelDeCargos;
// se sessaoAtual é do mesmo usuário e válida, preserva ini (7 dias absolutos)

// server/discord/api.ts (WEB-017)
export async function trocarCodigo(code: string): Promise<{ accessToken: string }>;  // POST https://discord.com/api/v10/oauth2/token
export async function obterMembro(accessToken: string): Promise<{ tipo: 'membro'; userId: string; roles: string[]; nome: string; avatar: string | null } | { tipo: 'naoMembro' }>;
// GET https://discord.com/api/v10/users/@me/guilds/{guildId}/member; nome = nick ?? user.global_name ?? user.username (≤ 32)
// timeout 5 s (AbortSignal.timeout); qualquer falha → ErroApp INTERNO sem corpo da resposta nem token no log

// server/auth/autorizacao.ts (WEB-022, ADR-05)
export const MARCA_ROTA: unique symbol;
export type NivelRota<P> = NivelAcesso | 'opcional' | ((params: P) => NivelAcesso); // função pode lançar VALIDACAO (tipo inválido)
export interface OpcoesRota<P> { nivel: NivelRota<P>; corpoMax?: number }      // csrf é automático para POST/PUT/PATCH/DELETE e não pode ser desligado
export interface ContextoRota<P> { req: NextRequest; usuario: UsuarioSessao | null; params: P; corpo: unknown }
// usuario é não nulo sempre que nivel ≠ 'opcional'; corpo = lerJson(req, corpoMax ?? LIMITES.CORPO_MAX_BYTES) nas mutações, undefined em GET
export function comAutorizacao<P extends Record<string, string> = Record<string, never>>(
  opcoes: OpcoesRota<P>, handler: (ctx: ContextoRota<P>) => Promise<Response>
): ((req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>) & { [MARCA_ROTA]: DeclaracaoRota };
export function rotaPublica(handler: (req: NextRequest) => Promise<Response>):
  ((req: NextRequest) => Promise<Response>) & { [MARCA_ROTA]: DeclaracaoRota };  // aplica limite por IP
// Ordem fixa: sessão (401 SEM_SESSAO) → revalidar (401 REVALIDAR) → nível (resolve params; 400 tipo; 403) →
//             CSRF/Origin/Content-Type nas mutações (403/415) → limite (429) → corpo (413/400) → handler → responderErro em exceção.
// 'opcional' (só logout): sem sessão segue com usuario null e exige apenas Origin; com sessão exige também o token.

// server/auth/pagina.ts (guarda de página, usado por server components do front)
export type EstadoPagina = { estado: 'ok'; usuario: UsuarioSessao; csrf: string } | { estado: 'sem_sessao' } | { estado: 'revalidar' };
export async function obterUsuarioPagina(): Promise<EstadoPagina>;    // usa cookies() de next/headers; nunca toca o Firestore
export async function exigirPagina(nivel: NivelAcesso, caminho: string): Promise<{ usuario: UsuarioSessao; csrf: string } | { semPermissao: true; usuario: UsuarioSessao; csrf: string }>;
// sem sessão → redirect('/login'); revalidar → redirect('/api/auth/login?volta=' + caminho)

// server/seguranca/csrf.ts (WEB-023)
export function tokenCsrf(sid: string): string;
export function verificarMutacao(req: Request, sessao: Sessao | null): void; // lança CSRF ou TIPO_CONTEUDO

// server/seguranca/limite.ts (WEB-024, ADR-07)
export interface Limitador { consumir(chave: string, agoraMs: number): { ok: true } | { ok: false; retryAfterS: number } }
export const LIMITE_USUARIO = { max: 60, janelaMs: 60_000 }; export const LIMITE_IP_AUTH = { max: 10, janelaMs: 60_000 };
export function criarLimitadorMemoria(cfg: { max: number; janelaMs: number }): Limitador;
export function setLimitador(qual: 'usuario' | 'ip', l: Limitador): void; export function resetLimitadores(): void;
export function ipDaRequisicao(req: Request): string;  // x-forwarded-for[0] ou 'desconhecido'

// server/seguranca/cabecalhos.ts (WEB-025)
export function montarCsp(nonce: string, producao: boolean): string;
// default-src 'self'; script-src 'self' 'nonce-X' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
// font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://discord.com; frame-ancestors 'none'
// ('unsafe-inline' só em style-src: React/Next geram atributos style; não executa código). Em dev acrescenta 'unsafe-eval' só em script-src e só fora de produção.
export const CABECALHOS_FIXOS: Readonly<Record<string, string>>;
// X-Content-Type-Options nosniff; Referrer-Policy strict-origin-when-cross-origin; Strict-Transport-Security max-age=63072000; includeSubDomains;
// Permissions-Policy camera=(), microphone=(), geolocation=(); Cross-Origin-Opener-Policy same-origin; X-Frame-Options DENY
// proxy.ts gera nonce por requisição (crypto.randomUUID → base64), aplica CSP + fixos, repassa 'x-nonce'. next.config: poweredByHeader false.
```

### 4.6 Discord: webhooks e eventos

```ts
// server/discord/webhook.ts (WEB-046)
export interface Embed { title?: string; description?: string; url?: string; color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>; footer?: { text: string }; timestamp?: string }
export interface PayloadWebhook { content?: string; embeds: Embed[] }  // allowed_mentions: { parse: [] } sempre injetado pelo cliente
export type ResultadoWebhook = { ok: true; mensagemId: string } | { ok: false; motivo: 'http' | 'nao_encontrada' | 'timeout' | 'rede' | 'limite' | 'canal' | 'json' };
export async function enviarWebhook(canal: CanalWebhook, payload: PayloadWebhook): Promise<ResultadoWebhook>;   // POST ?wait=true
export async function editarWebhook(canal: CanalWebhook, mensagemId: string, payload: PayloadWebhook): Promise<ResultadoWebhook>; // PATCH /messages/{id}; 404 → 'nao_encontrada'
// timeout 5 s; 429 com retry_after ≤ 3 s → 1 nova tentativa; > 3 s → 'limite'; nunca lança; nunca loga a URL

// server/webhooks/formatacao.ts
export const LIMITES_DISCORD = { TITULO: 256, DESCRICAO: 4096, CAMPO_NOME: 256, CAMPO_VALOR: 1024, CAMPOS: 25, EMBEDS: 10, TOTAL: 6000, RODAPE: 2048 };
export function escaparMarkdown(t: string): string;   // escapa \ * _ ~ ` | > # [ ] ( ) e neutraliza @ (insere ​ após @) e <@ / <#
export function truncar(t: string, max: number): string;
export function tamanhoEmbed(e: Embed): number;       // regra do Discord: title + description + fields.name + fields.value + footer.text (+ author.name)
export const COR = { roxo: 0x7C3AED, entrada: 0x22C55E, saida: 0xEF4444, aviso: 0xF59E0B };
export const RODAPE = 'Marabunta Grande • Stocky';

// server/webhooks/movimentacao.ts (WEB-047)
export function embedMovimentoBau(log: LogBau, tipo: TipoBau): Embed;
export function embedMovimentoCaixa(log: LogCaixa): Embed;
export function embedAvisoBau(log: LogBau, tipo: TipoBau): Embed;   // zerar, ajuste, catalogo_remover
// canal: membros → logMembros; gerencia → logGerencia; caixa → logCaixa

// server/webhooks/inventario-embeds.ts (WEB-048) — puro
export function montarEmbedsInventario(bau: BauDTO, linkSite: string): Embed[];  // ADR-17; vazio → 1 embed 'Nenhum item registrado.'

// server/webhooks/mensagem-fixa.ts (WEB-049/050)
export async function publicarMensagemFixa(chave: ChaveMensagem, canal: CanalWebhook, payload: PayloadWebhook): Promise<ResultadoWebhook>;
// 1) tx: lê doc; se tem mensagemId → editar; 404 → limpa id e segue para criar; outro erro → { ok:false } sem criar
// 2) criar: tx reserva (reservadoAte = agora + 30 s) se não houver id nem reserva válida; quem não reservou desiste ({ ok:false, motivo:'limite' })
// 3) enviarWebhook; tx grava mensagemId e limpa reserva

// server/webhooks/inventario.ts, saldo.ts
export async function atualizarInventario(tipo: TipoBau): Promise<ResultadoWebhook>;  // lê lerBau(tipo) na hora
export async function atualizarSaldo(): Promise<ResultadoWebhook>;                   // lê lerSaldo() na hora

// server/webhooks/eventos.ts (WEB-051)
export type EventoDominio =
  | { tipo: 'bau.movimento'; bau: TipoBau; log: LogBau }
  | { tipo: 'bau.aviso'; baus: TipoBau[]; log: LogBau }          // zerar, ajuste, remover do catálogo
  | { tipo: 'caixa.movimento'; log: LogCaixa };
export function publicarEvento(e: EventoDominio): void;   // só agenda (agendar); cada tarefa isolada em try/catch
// mapa: bau.movimento → movimento no log do baú + inventário do baú
//       bau.aviso → aviso no log de cada baú afetado + inventário de cada baú afetado
//       caixa.movimento → movimento no log do caixa + saldo
//       catalogo.adicionar_item → nenhum webhook
```
Para alimentar `publicarEvento`, os serviços de §4.4 devolvem internamente o `LogBau`/`LogCaixa` gravado. Contrato: cada serviço de escrita tem uma versão `...ComEvento` **não exportada pela rota** ou devolve `{ dto, evento }`; o backend-dev escolhe uma das duas e aplica igual em todos. A rota faz: `const r = await servico(...); publicarEvento(r.evento); return responderOk(r.dto)`.

---

## 5. Rotas de API

Todas: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, resposta `{ ok, dados | erro, codigo, detalhes? }`, `Cache-Control: no-store`. Método não exportado → 405 do próprio Next. Mutação = CSRF + Origin + `application/json` + corpo ≤ 10 KB (ajuste ≤ 100 KB).

| Método e caminho | Nível | Entrada | `dados` em sucesso | Erros de regra |
|---|---|---|---|---|
| `GET /api/auth/login?volta=` | público (10/min/IP) | `volta` interno | 307 para o Discord + cookie de state | 429 |
| `GET /api/auth/callback?code&state` | público (10/min/IP) | — | 307 para `volta` + cookie de sessão | 307 `/login?erro=state\|negado\|sem_acesso\|discord` |
| `POST /api/auth/logout` | opcional | `{}` | `{}` + cookie apagado | 403 (Origin/CSRF) |
| `GET /api/csrf` | 1 | — | `{ csrf }` | — |
| `GET /api/catalogo` | 1 | — | `CatalogoDTO` | — |
| `POST /api/catalogo/itens` | 2 | `{ categoriaId, nome }` | `{ categoriaId, item }` (201) | 400, 404, 409 DUPLICADO/LIMITE_CATEGORIA |
| `DELETE /api/catalogo/itens/[categoriaId]/[itemId]` | 3 | ids no caminho (`ehIdSeguro`) | `{ item, removidoDe }` | 400, 404 |
| `GET /api/bau/[tipo]` | membros 1 · gerencia 2 | — | `BauDTO` | 400 tipo |
| `POST /api/bau/[tipo]/adicionar` | membros 1 · gerencia 2 | `{ categoriaId, itemId, quantidade }` | `MovimentoBauDTO` | 400, 404 |
| `POST /api/bau/[tipo]/remover` | membros 1 · gerencia 2 | idem | `MovimentoBauDTO` | 400, 404, 409 ESTOQUE_INSUFICIENTE |
| `POST /api/bau/[tipo]/ajuste/previa` | 2 (os dois tipos) | `{ linhas }` | `PreviaAjusteDTO` | 400 com `detalhes.linhas` |
| `POST /api/bau/[tipo]/ajuste/confirmar` | 2 | `{ versao, linhas }` | `ConfirmacaoAjusteDTO` | 400, 409 VERSAO_DESATUALIZADA |
| `POST /api/bau/zerar` | 3 | `{ alvo, confirmacao: 'ZERAR' }` | `ZerarDTO` | 400 (alvo/confirmação) |
| `GET /api/caixa` | 2 | — | `SaldoDTO` | — |
| `GET /api/caixa/historico?limite&cursor` | 2 | paginação | `Pagina<LogDTO>` | 400 |
| `POST /api/caixa/movimentar` | 2 | `{ tipo, acao, valor, anotacao }` | `SaldoDTO` | 400, 409 SALDO_INSUFICIENTE |
| `GET /api/logs/bau/[tipo]?limite&cursor` | membros 1 · gerencia 2 | paginação | `Pagina<LogDTO>` | 400 |
| `GET /api/logs/caixa?limite&cursor` | 2 | paginação | `Pagina<LogDTO>` | 400 |
| `GET /api/auditoria?limite&cursor&acao` | 2 | paginação + ação | `Pagina<AuditoriaResumoDTO>` | 400 |
| `GET /api/auditoria/[id]` | 2 | `ehIdDocumento` | `AuditoriaDetalheDTO` | 400, 404 |

`/api/bau/zerar` é segmento estático e tem precedência sobre `/api/bau/[tipo]`. O manifesto de WEB-026 fica em `web/test/server/manifesto-rotas.ts` (dono B) e lista exatamente estas 20 entradas; rota nova sem entrada faz o teste falhar.

Corpo de 401 `REVALIDAR` inclui `detalhes: {}` e o front navega para `/api/auth/login?volta=<location.pathname>`. 429 traz `Retry-After` e `detalhes.retryAfter`.

---

## 6. Matriz de permissão

Dono (3) ⊃ Gerência (2) ⊃ Membro (1). Nível 0 (fora do servidor ou sem cargo configurado) não cria sessão. **Decisão do usuário (05/11): ações destrutivas são exclusivas do dono** (zerar baú e remover item do catálogo). Gerência faz todo o resto.

| Recurso / ação | 1 Membro | 2 Gerência | 3 Dono |
|---|:-:|:-:|:-:|
| Entrar no site, ver o próprio nome, sair | ✔ | ✔ | ✔ |
| Ver catálogo (`GET /api/catalogo`) | ✔ | ✔ | ✔ |
| Baú dos Membros: ver, adicionar, remover | ✔ | ✔ | ✔ |
| Logs do Baú dos Membros | ✔ | ✔ | ✔ |
| Baú da Gerência: ver, adicionar, remover | ✘ | ✔ | ✔ |
| Logs do Baú da Gerência | ✘ | ✔ | ✔ |
| Caixa: saldo, histórico, entrada, saída, logs do caixa | ✘ | ✔ | ✔ |
| Catálogo: adicionar item | ✘ | ✔ | ✔ |
| Catálogo: remover item | ✘ | ✘ | ✔ |
| Zerar baú (membros, gerência ou ambos) | ✘ | ✘ | ✔ |
| Ajuste em massa (qualquer baú) | ✘ | ✔ | ✔ |
| Auditoria (lista e detalhe) | ✘ | ✔ | ✔ |

Páginas (guarda de UX em `(protegido)/layout.tsx` + `exigirPagina`; a segurança real é a da tabela acima):

| Página | Nível | Menu |
|---|---|---|
| `/login` | público | — |
| `/` | 1 (redireciona para `/bau/membros`) | — |
| `/bau/membros` | 1 | "Baú dos Membros" |
| `/bau/gerencia` | 2 | "Baú da Gerência" |
| `/caixa` | 2 | "Caixa" |
| `/painel` (catálogo + zerar) | 2 | "Painel" |
| `/ajuste/membros`, `/ajuste/gerencia` | 2 | dentro do Painel |
| `/logs` | 1 (nível 1 vê só a aba Baú dos Membros; 2+ vê as três) | "Logs" |
| `/auditoria` | 2 | "Auditoria" |

**Ajuste de critério do backlog:** WEB-053 AC2 e WEB-054 AC2 listam "Logs" como nível 2+. Pela decisão Q6, `/logs` passa a ser nível 1 com abas filtradas. O `jira-manager` deve atualizar esses dois critérios; até lá vale este documento.

---

## 7. Front-end: tokens e padrões

Tokens em `web/src/app/globals.css` (dono F). Escuro é o padrão; `@media (prefers-color-scheme: light)` troca para o claro. Razões de contraste calculadas (WCAG):

| Token | Escuro | Claro | Contraste verificado |
|---|---|---|---|
| `--cor-fundo` | `#0B0A10` | `#FFFFFF` | — |
| `--cor-superficie` | `#17141F` | `#F5F3FA` | — |
| `--cor-borda` | `#2E2A3A` | `#DDD8E8` | (não é texto) |
| `--cor-texto` | `#FFFFFF` | `#0B0A10` | 19,7:1 |
| `--cor-texto-suave` | `#C8C2D6` | `#4B4458` | 10,5:1 na superfície escura · 8,4:1 na clara |
| `--cor-destaque` (links, foco, ícones) | `#A78BFA` | `#6D28D9` | 6,7:1 na superfície · 6,5:1 na clara |
| `--cor-botao` (fundo do botão principal) | `#7C3AED` | `#6D28D9` | texto branco 5,7:1 · 7,1:1 |
| `--cor-erro` | `#F87171` | `#B91C1C` | 6,6:1 · 6,5:1 |
| `--cor-sucesso` | `#4ADE80` | `#15803D` | 10,4:1 · 5,0:1 |
| `--cor-aviso` | `#FBBF24` | `#B45309` | 10,9:1 · 5,0:1 |

Padrões: celular primeiro (barra de navegação inferior até 768 px, lateral acima); alvos de toque ≥ 44 px; foco visível com contorno `--cor-destaque` de 2 px; fonte do sistema (sem fonte externa, CSP `font-src 'self'`); `SessaoProvider` recebe `{ usuario, csrf }` do layout protegido; `components/api.ts` lê o token do provider (fallback `GET /api/csrf`) e nunca acessa cookie nem `localStorage`. Datas exibidas em `America/Sao_Paulo`. Dinheiro com `formatarDinheiro` de `compartilhado` (`$1.000`). Nenhum `dangerouslySetInnerHTML` em `web/src` (teste de varredura do F).

---

## 8. Ondas de execução e donos de arquivo

Regra: dentro de uma onda, os conjuntos de arquivos de B e F são disjuntos. F programa contra o contrato (§4 e §5) e testa com `api.ts`/`fetch` simulado; a integração real é provada pelo QA na onda seguinte. Ao fim de cada onda: `npm run lint`, `typecheck`, `test` verdes e passada do QA na onda (rápida); veredito final na onda 7.

| Onda | backend-dev (cards → arquivos) | frontend-dev (cards → arquivos) | Portão de saída |
|---|---|---|---|
| **0 Fundação** | 001, 002, 003, 004, 007, 012, 025 → `web/package.json`, lock, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `test/setup.ts`, `.gitignore`, `.env.example`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `src/proxy.ts`, `server/seguranca/cabecalhos.ts`, `app/layout.tsx` e `app/page.tsx` mínimos, `test/ui/smoke.test.tsx`, `.github/workflows/web.yml`, testes `test/server/{smoke,higiene,segredos,ci,regras,cabecalhos}.test.ts` | — (aguarda) | build 0; lint/typecheck/test verdes; CI verde |
| **1 Base** | 005, 006, 008, 009, 010, 011 → `server/{env,contexto,erros,http,log,firebase}.ts`, `server/validacao/{item,texto}.ts`, `compartilhado/{limites,numero,formatacao,erros}.ts`, `test/helpers/{fake-firestore,env-teste}.ts` + testes | 053, 056 → recebe `app/layout.tsx`, `app/page.tsx`; cria `globals.css`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `components/{Navegacao,Estados}.tsx` + `test/ui/**` | fake com teste de sanidade de concorrência |
| **2 Domínio e login** | 013, 014, 015, 016, 017, 018, 019, 020, 021 → `server/dominio/*`, `server/catalogo/{padrao,semente,leitura}.ts`, `server/auth/{sessao,oauth,niveis,revalidacao,pagina}.ts`, `server/discord/api.ts`, `app/api/auth/{login,callback,logout}/route.ts`, `compartilhado/api-tipos.ts`, `test/helpers/{fake-fetch,requisicao,sessao-teste}.ts` | 052, 055 → `components/api.ts`, `components/SessaoProvider.tsx`, `app/login/page.tsx` | login simulado ponta a ponta nos testes de B |
| **3 Autorização** | 022, 023, 024, 026, 027 → `server/auth/autorizacao.ts`, `server/seguranca/{csrf,limite}.ts`, `server/validacao/corpo.ts`, `server/paginacao.ts`, `app/api/csrf/route.ts`, `test/server/{manifesto-rotas,cobertura-rotas}.ts`, `scripts/verificar-bundle.mjs` | 054, 057 → `app/(protegido)/layout.tsx`, `components/{SemPermissao,Bau,CampoQuantidade,Dialogo}.tsx` | WEB-026 verde com as rotas existentes |
| **4 Baú e caixa** | 028, 029, 030, 031, 032, 033, 034 → `server/bau/{leitura,operacoes}.ts`, `server/caixa/*`, `server/logs/registrar.ts`, `app/api/bau/[tipo]/{route,adicionar,remover}`, `app/api/caixa/**` | 058, 059 → `app/(protegido)/bau/[tipo]/page.tsx`, `app/(protegido)/caixa/page.tsx`, `components/Caixa.tsx` | concorrência 6+6 com estoque 10 e saldo nunca negativo |
| **5 Gerência** | 035, 036, 037, 038, 039, 040, 041, 042 → `server/catalogo/operacoes.ts`, `server/auditoria/registrar.ts`, `server/bau/{zerar,ajuste}.ts`, `app/api/catalogo/**`, `app/api/bau/zerar`, `app/api/bau/[tipo]/ajuste/**` | 060, 061, 062 → `app/(protegido)/painel/page.tsx`, `app/(protegido)/ajuste/[tipo]/page.tsx`, `components/{Catalogo,ZerarBau,AjusteTabela}.tsx` | cenário D3 recusado; D1 com `#1 Especial: .50` |
| **6 Leituras e avisos** | 043, 044, 045, 046, 047, 048, 049, 050, 051 → `server/logs/leitura.ts`, `server/auditoria/leitura.ts`, `app/api/logs/**`, `app/api/auditoria/**`, `server/discord/webhook.ts`, `server/webhooks/*`; e a linha `publicarEvento` nas rotas de 031/034/037/039/042 (todas de B) | 063, 064 → `app/(protegido)/logs/page.tsx`, `app/(protegido)/auditoria/page.tsx`, `components/{Logs,Auditoria}.tsx` | webhook fora do ar não muda nenhuma resposta |
| **7 Fechamento** | 068, 069 (parte B), 070, 071, licença → `docs/web/deploy.md`, `web/vercel.json`, `scripts/verificar-build.mjs`, `web/README.md`, `web/LICENSE`, `test/server/{env-documentada,build,readme}.test.ts` | 065, 069 (parte F: zerar avisos de build nos próprios arquivos) → `test/ui/a11y.test.tsx` e ajustes em `components/**` | QA: 066 em `test/qa/**` e `qa-report.md` com VEREDITO |

WEB-067 (Playwright): **cancelado** pela decisão Q12; o `jira-manager` marca o card. WEB-066 é executado pelo **qa-engineer** (arquivos em `web/test/qa/**`, território dele), usando os helpers de `web/test/helpers/**` (B). WEB-027 é "ambos": B escreve teste e script; F só corrige se um arquivo dele violar.

Arquivos que trocam de dono entre ondas (nunca na mesma onda): `app/layout.tsx`, `app/page.tsx` e `test/ui/smoke.test.tsx` (B na onda 0 → F a partir da 1).

---

## 9. Como o QA prova cada card

Regra geral (vale para todos): o QA roda `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm audit --audit-level=high` em `web/`; para cada card escolhe ao menos uma regra central, **remove ou inverte** essa regra numa cópia (mutação) e confirma que o teste citado falha. Testes de concorrência usam o fake com fila de transações e `Promise.all`; nenhum teste usa rede ou segredo real.

| Card | Teste que prova | Mutação/cenário de borda que o QA aplica |
|---|---|---|
| 001 | `test/server/smoke.test.ts` lê `tsconfig.json` e `package.json`; `npm run build` | tirar `strict`; dependência com `^`/`latest` |
| 002 | `test/server/higiene.test.ts` | inserir `eslint-disable`, `@ts-ignore`, regra `off` |
| 003 | smokes de server e ui; higiene de `.only/.skip/.todo/xit` | `it.only` num teste; rodar sem `FIREBASE_*`/`DISCORD_*` |
| 004 | `test/server/segredos.test.ts` + `git ls-files` | PEM falso e URL de webhook com token em arquivo rastreado |
| 005 | `test/server/env.test.ts` (uma variável ausente por vez, listas de cargos) | `SESSION_SECRET` de 31; `APP_URL` http em produção; webhook de outro domínio |
| 006 | `test/server/erros.test.ts` | `Error('FIREBASE_PRIVATE_KEY=abc')` não aparece no corpo nem no log |
| 007 | `test/server/ci.test.ts` lê o YAML | passo fora de ordem; `secrets.` no YAML; Node diferente de `engines` |
| 008 | `test/server/validacao-numero.test.ts` (lista inteira do AC1) | aceitar `"1e3"`, `"１２"`, `100001` |
| 009 | `test/server/validacao-item.test.ts` | `__proto__`, `A/B`, `🔫`, 51 caracteres, `#Item` |
| 010 | `test/server/firebase.test.ts` + varredura de imports | `initializeApp` 2x; `firebase` no package.json |
| 011 | `test/server/fake-firestore.test.ts` | código fora de tx perde atualização (sanidade); get após set lança |
| 012 | `test/server/regras.test.ts` lê `firestore.rules` | trocar `false` por `request.auth != null` |
| 013 | `test/server/dominio.test.ts` | `versao` dentro de `itens`; doc de 6×25 > 100 KB |
| 014 | `test/server/semente.test.ts` (compara §3.1 com `utils/db.js` do bot) | 20 chamadas paralelas; semente fora de tx; item do usuário sobrescrito; corrida com `adicionarItemAoCatalogo` |
| 015 | `test/server/sessao.test.ts` | 1 byte alterado; outro segredo; expirado; `alg: none`; payload com `access_token` |
| 016 | `test/server/oauth-login.test.ts` | `redirect_uri` vindo do `Host`; escopo diferente; state repetido; parâmetros = 5 + `prompt=none` |
| 017 | `test/server/discord-api.test.ts` com `fake-fetch` | 404 → `naoMembro`; timeout; token em log espiado |
| 018 | `test/server/niveis.test.ts` (tabela + listas: `"a, b"`, `" ,a"`, `""`, maior nível vence) | config vazia casando `""`; gerente+dono → 2 |
| 019 | `test/server/oauth-callback.test.ts` | state diferente chama Discord; reuso do state; `volta=https://evil` |
| 020 | `test/server/revalidacao.test.ts` com `vi.useFakeTimers` | 14:59 aceita, 15:01 `REVALIDAR`; rebaixado; nível 0 encerra; `ini` preservado |
| 021 | `test/server/logout.test.ts` | GET encerra sessão; sem sessão ≠ 200 |
| 022 | `test/server/autorizacao.test.ts` (tabela nível × exigido; `fake.chamadas` vazio nos negados) | trocar ordem nível/handler; `userId` do corpo usado |
| 023 | `test/server/csrf.test.ts` | Origin ausente; token de outra sessão; `text/plain` → 415 |
| 024 | `test/server/limite.test.ts` | A estoura e B continua; janela volta; chave por cabeçalho do cliente |
| 025 | `test/server/cabecalhos.test.ts` (chama `montarCsp` e o `proxy`) | `unsafe-eval` em produção; sem `frame-ancestors` |
| 026 | `test/server/cobertura-rotas.test.ts` + `test/qa/rotas-adversariais.test.ts` (Q) | rota nova sem manifesto; export sem `MARCA_ROTA`; arquivo com `"use server"` |
| 027 | `test/server/bundle-sem-segredos.test.ts` + `scripts/verificar-bundle.mjs` após build com `SEGREDO-FALSO-123` | componente client importando `@/server/env` |
| 028 | `test/server/bau-leitura.test.ts` | item fora do catálogo; ordem não determinística; escrita em leitura |
| 029 | `test/server/bau-adicionar.test.ts` | 50 adições paralelas; `falharProximoCommit` deixa log; `versao` sobe em recusa |
| 030 | `test/server/bau-remover.test.ts` | 6+6 com estoque 10; zero deixa chave com 0 |
| 031 | `test/server/rotas-bau.test.ts` | nível 1 em `gerencia`; campo extra; 11 KB → 413 |
| 032 | `test/server/caixa-leitura.test.ts` | doc ausente; limite 101 |
| 033 | `test/server/caixa-operacoes.test.ts` | saídas paralelas; `"1.000,50"`; anotação com `\u0000` e 101 caracteres |
| 034 | `test/server/rotas-caixa.test.ts` | nível 1; sem CSRF; `cursor=abc/def` |
| 035 | `test/server/catalogo-adicionar.test.ts` | `Desert Eagle` duplicado de `desert`; 30 paralelos respeitam 25 |
| 036 | `test/server/catalogo-remover.test.ts` | falha injetada no 2º baú; `versao` não sobe |
| 037 | `test/server/rotas-catalogo.test.ts` | `%2F` e `..` no caminho; DELETE nível 1 |
| 038 | `test/server/bau-zerar.test.ts` | `membros` altera `gerencia`; baú vazio sem auditoria (contraria ADR-16) |
| 039 | `test/server/rotas-zerar.test.ts` | `confirmacao: 'zerar'` minúsculo; dois zerar simultâneos |
| 040 | `test/server/ajuste-previa.test.ts` | prévia escreve; 201 linhas; repetida; `#1 Especial: .50` |
| 041 | `test/server/ajuste-confirmar.test.ts` | cenário D3 (3→5, +10, confirmar → 409, estoque 13); dupla confirmação; versão muda após cada uma das 5 escritas |
| 042 | `test/server/rotas-ajuste.test.ts` | nível 1 em `membros`; sem `versao`; 101 KB |
| 043 | `test/server/logs-leitura.test.ts` (30 entradas, páginas de 10) | página repete/pula; nome do item depende do catálogo |
| 044 | `test/server/auditoria-leitura.test.ts` + leitura de `firestore.indexes.json` | ação desconhecida; lista devolve `antes` gigante |
| 045 | `test/server/rotas-logs.test.ts` | nível 1 lê `logs/caixa`; nível 1 lê `logs/bau/membros` (deve passar) |
| 046 | `test/server/webhook-cliente.test.ts` | 429 com 10 s espera; lança em rede caída; `allowed_mentions` ausente |
| 047 | `test/server/webhook-movimentacao.test.ts` | nome com `@everyone`; anotação de 100 + nome de 50 passam do total |
| 048 | `test/server/webhook-embeds.test.ts` (200 casos aleatórios) | 6×25 nomes de 50 → total > 6000 |
| 049 | `test/server/webhook-inventario.test.ts` | 404 recria 1 vez em 3 chamadas; 500 cria duplicada; 2 simultâneos criam 2 |
| 050 | `test/server/webhook-saldo.test.ts` | saldo ausente mostra `undefined` |
| 051 | `test/server/efeitos-pos-transacao.test.ts` com `setAgendador` capturando tarefas | webhook antes do commit; tx falha e webhook sai; webhook de 10 s atrasa a resposta |
| 052 | `test/ui/api-cliente.test.ts` | GET com corpo; 401 `REVALIDAR` vai para `/login`; acesso a `localStorage` |
| 053 | `test/ui/navegacao.test.tsx` | menu de nível 1 mostra Caixa; sem `aria-current` |
| 054 | `test/ui/guardas.test.tsx` (mock de `@/server/auth/pagina`) | nível 1 em `/caixa` renderiza; `/logs` nível 1 sem aba gerência |
| 055 | `test/ui/login.test.tsx` | `?erro=<script>` refletido |
| 056 | `test/ui/estados.test.tsx` | `ErroTela` sem `role="alert"` |
| 057 | `test/ui/bau.test.tsx` | duplo envio; 409 fecha formulário; remover item com 0 |
| 058 | `test/ui/paginas-bau.test.tsx` | página importa `@/server` no cliente |
| 059 | `test/ui/caixa.test.tsx` | anotação vazia envia |
| 060 | `test/ui/painel-catalogo.test.tsx` | cancelar chama API; 25/25 habilitado |
| 061 | `test/ui/zerar-bau.test.tsx` | `zerar` minúsculo habilita botão |
| 062 | `test/ui/ajuste.test.tsx` | reconfirmar após 409; envia linhas não alteradas |
| 063 | `test/ui/logs.test.tsx` | `<img onerror>` executa; data em UTC |
| 064 | `test/ui/auditoria.test.tsx` | botão que altera dados presente |
| 065 | `test/ui/a11y.test.tsx` (axe em 4 estados por tela; contraste dos tokens de §7) | `--cor-texto-suave` trocado por `#6B6478` (< 4,5:1) |
| 066 | `test/qa/e2e-fluxos.test.ts` (Q) | os 8 fluxos do card, incluindo webhook fora do ar e rebaixamento após 15 min |
| 067 | cancelado (Q12) | — |
| 068 | `test/server/env-documentada.test.ts` | variável sobrando no `.env.example`; segredo marcado "público" |
| 069 | `scripts/verificar-build.mjs` + `test/server/build.test.ts` | linha `warn` no build; `/api/caixa` sem sessão ≠ 401 |
| 070 | `test/server/readme.test.ts` (importa `LIMITES`, `REVALIDACAO_MS`) | README com 100.000 trocado por 10.000 |
| 071 | `npm audit --audit-level=high` e `npm ci` em cópia limpa | moderadas sem justificativa no `qa-report.md` |

Licença: `web/LICENSE` com texto MIT e `"license": "MIT"` em `web/package.json` (teste em `readme.test.ts`). O `LICENSE` da raiz (bot, ISC) não muda sem decisão do usuário.

---

## 10. Riscos

1. **Revalidação por redirecionamento (ADR-04):** a cada 15 min de uso há um salto rápido pelo Discord; formulário não enviado pode se perder. Se `prompt=none` não pular a tela em algum caso, o usuário vê a autorização de novo. Mitigação: `volta` devolve à mesma página; mutação recusada nunca é aplicada.
2. **Limite em memória (ADR-07):** aproximado entre instâncias da Vercel.
3. **Previews da Vercel sem login (ADR-12).**
4. **Índice composto da auditoria (ADR-18):** se não for publicado, o filtro por ação falha em produção (o fake não acusa). Passo obrigatório em `deploy.md`.
5. **Latência:** transação Firestore exige várias idas e voltas; função em `iad1` com Firestore no Brasil pode passar de 1 s por operação. `vercel.json` deve fixar a região da função perto do banco.
6. **Mensagem de inventário truncada (ADR-17)** quando o catálogo crescer muito; o site continua completo.
7. **Corrida entre atualizações de inventário pós-commit:** a última a chegar no Discord pode não ser a mais nova por milissegundos; a próxima operação corrige. Aceito.
8. **Chave antiga do Firebase (Q10):** tratada como vazada; sem conta de serviço nova o deploy não deve acontecer.
