# Stocky Web: backlog

Autor: `jira-manager` · 31/10/2026 · Fonte: `docs/web/CONTEXTO.md`, `docs/web/requisitos.md`, `docs/WORKFLOW.md`, `docs/architecture.md`, `docs/qa-report.md` (lições D1 a D6).
Armazenamento: `JIRA_PROJECT_KEY` segue vazio, então os cards ficam só aqui (IDs `WEB-001`…). Nada foi criado no Jira (nem no projeto KAN).

## Convenções para todos os cards
- Camada: `back` = `web/src/server/**` e `web/src/app/api/**`; `front` = `web/src/app/**` (exceto `api`) e `web/src/components/**`; `ambos` = os dois.
- Testes de back em `web/test/server/**`; de interface em `web/test/ui/**`; do QA em `web/test/qa/**`. O Firestore dos testes é sempre o fake (WEB-011); nunca rede, nunca segredo real.
- "Critério verificável" = um teste Vitest (ou comando com saída objetiva) o prova. O QA confirma que o teste falha se a regra for removida.
- Respostas da API: JSON `{ ok: true, dados }` ou `{ ok: false, erro }` com `erro` em português, curto e sem detalhes internos (o architect pode refinar o formato em `docs/web/architecture.md`).
- Os caminhos de rota abaixo são sugestões; o architect fixa o contrato.
- Prioridade Highest só para segurança e perda de dados. Estimativa: cada card cabe em até ~1 dia de uma pessoa.
- Status inicial de todos: **A fazer**.

## Tabela dos cards (ordenada por dependência e risco)

| ID | Título | Camada | Prioridade | Dependências |
|---|---|---|---|---|
| WEB-001 | Criar scaffold Next.js com TypeScript estrito | back | High | n/a |
| WEB-002 | Configurar lint, typecheck e scripts npm | back | High | 001 |
| WEB-003 | Configurar Vitest e Testing Library | back | High | 001 |
| WEB-004 | Higiene do repositório e `.env.example` com valores falsos | back | Highest | 001 |
| WEB-005 | Módulo de variáveis de ambiente validado | back | Highest | 003 |
| WEB-006 | Erro padronizado da API e logger sem segredos | back | High | 003 |
| WEB-007 | CI no GitHub Actions (opcional) | back | Low | 002, 003 |
| WEB-008 | Parser numérico estrito e limites | back | Highest | 003 |
| WEB-009 | Validação de nome e id seguro de item | back | Highest | 003, 008 |
| WEB-010 | Firebase Admin restrito ao servidor | back | Highest | 005 |
| WEB-011 | Fake do Firestore transacional para testes | back | High | 003 |
| WEB-012 | Regras do Firestore que negam todo acesso de cliente | back | Highest | 001 |
| WEB-013 | Modelo de dados e tipos do domínio | back | High | 008, 009, 010 |
| WEB-014 | Semente transacional do catálogo padrão | back | Highest | 011, 013 |
| WEB-015 | Sessão em cookie httpOnly assinado com expiração | back | Highest | 005, 006 |
| WEB-016 | Início do fluxo Discord OAuth2 com state | back | Highest | 015 |
| WEB-017 | Cliente Discord: troca de código e leitura dos cargos | back | Highest | 005, 006 |
| WEB-018 | Converter cargos em nível (membro, gerente, dono) | back | Highest | 005 |
| WEB-019 | Callback do OAuth: validar state e criar sessão | back | Highest | 016, 017, 018 |
| WEB-020 | Revalidação periódica dos cargos | back | Highest | 015, 017, 018 |
| WEB-021 | Logout | back | High | 015 |
| WEB-022 | Camada de autorização para rotas e server actions | back | Highest | 015, 018, 020 |
| WEB-023 | Proteção CSRF nas rotas que alteram dados | back | Highest | 015, 022 |
| WEB-024 | Limite de requisições por usuário | back | High | 022 |
| WEB-025 | Cabeçalhos de segurança | back | High | 001 |
| WEB-026 | Teste de cobertura: nenhuma rota escapa da autorização | back | Highest | 022, 023 |
| WEB-027 | Verificar que nenhum segredo vai ao navegador | ambos | Highest | 005, 010 |
| WEB-028 | Leitura de baú e catálogo | back | High | 013, 014, 022 |
| WEB-029 | Adicionar item ao baú (atômico, com log) | back | Highest | 008, 013, 014 |
| WEB-030 | Remover item do baú (atômico, com log) | back | Highest | 029 |
| WEB-031 | Rotas do baú (consultar, adicionar, remover) | back | Highest | 022, 023, 028, 029, 030 |
| WEB-032 | Leitura de saldo e histórico do caixa | back | High | 013 |
| WEB-033 | Movimentar caixa (entrada e saída, atômico, com anotação e log) | back | Highest | 008, 013 |
| WEB-034 | Rotas do caixa | back | Highest | 022, 023, 032, 033 |
| WEB-035 | Adicionar item ao catálogo (limite de 25 por categoria) | back | High | 009, 014 |
| WEB-036 | Remover item do catálogo (baús e auditoria na mesma transação) | back | Highest | 035 |
| WEB-037 | Rotas do catálogo | back | High | 022, 023, 035, 036 |
| WEB-038 | Zerar baú (um ou ambos) com auditoria | back | Highest | 013, 029 |
| WEB-039 | Rota de zerar baú | back | Highest | 022, 023, 038 |
| WEB-040 | Prévia do ajuste em massa (antes/depois e versão) | back | Highest | 028, 029 |
| WEB-041 | Confirmar ajuste em massa com versão otimista | back | Highest | 040 |
| WEB-042 | Rotas do ajuste em massa | back | Highest | 022, 023, 040, 041 |
| WEB-043 | Consulta de logs de movimentação | back | Medium | 029, 033 |
| WEB-044 | Consulta de auditoria | back | Medium | 036, 038, 041 |
| WEB-045 | Rotas de logs e auditoria | back | Medium | 022, 043, 044 |
| WEB-046 | Cliente de webhook do Discord (resiliente) | back | High | 005, 006 |
| WEB-047 | Webhook de movimentação | back | Medium | 046 |
| WEB-048 | Construtor de embeds de inventário dentro dos limites | back | High | 013, 046 |
| WEB-049 | Webhook de inventário com mensagem editada | back | High | 048 |
| WEB-050 | Webhook de saldo do caixa | back | Medium | 046 |
| WEB-051 | Efeitos pós-transação: webhooks nunca desfazem nem escondem o sucesso | back | Highest | 031, 034, 037, 039, 042, 047, 049, 050 |
| WEB-052 | Cliente de API do front (CSRF, erros, sessão expirada) | front | High | 023, 006 |
| WEB-053 | Layout, tokens visuais e navegação responsiva | front | High | 001 |
| WEB-054 | Guarda de páginas por nível | front | Highest | 022, 053 |
| WEB-055 | Tela de login | front | High | 019, 053 |
| WEB-056 | Componentes de estado: carregando, vazio e erro | front | Medium | 053 |
| WEB-057 | Componente de baú (lista por categoria, adicionar e remover) | front | High | 052, 056 |
| WEB-058 | Páginas Baú dos Membros e Baú da Gerência | front | High | 031, 054, 057 |
| WEB-059 | Tela do Caixa | front | High | 034, 052, 054, 056 |
| WEB-060 | Painel da gerência: catálogo | front | High | 037, 052, 054, 056 |
| WEB-061 | Painel da gerência: zerar baú | front | High | 039, 052, 054 |
| WEB-062 | Tela de ajuste em massa em tabela | front | High | 042, 052, 054, 056 |
| WEB-063 | Tela de logs de movimentação | front | Medium | 045, 052, 054, 056 |
| WEB-064 | Tela de auditoria | front | Medium | 045, 052, 054, 056 |
| WEB-065 | Acessibilidade verificada por teste | front | Medium | 055, 058, 059, 060, 061, 062, 063, 064 |
| WEB-066 | Testes de ponta a ponta dos fluxos no servidor | ambos | High | 051 |
| WEB-067 | Teste de ponta a ponta no navegador (opcional) | ambos | Low | 065, 066 |
| WEB-068 | Configuração da Vercel e variáveis documentadas | back | High | 005, 025 |
| WEB-069 | Build de produção limpo | ambos | High | 065, 068 |
| WEB-070 | README do site | back | Medium | 068 |
| WEB-071 | `npm audit` sem vulnerabilidade crítica ou alta | back | High | 001 (reexecutar na entrega) |

---

# Fundação

## WEB-001 Criar scaffold Next.js com TypeScript estrito
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** n/a
- **Descrição:** Criar `web/` com Next.js (App Router) na versão estável atual (o architect confirma na documentação oficial), TypeScript estrito e alias `@/` para `web/src`. Página inicial mínima.
- **Critérios de aceite:**
  1. `web/tsconfig.json` tem `"strict": true`, `noUncheckedIndexedAccess: true` e `noImplicitOverride: true` (teste lê o JSON).
  2. `npm run build` em `web/` termina com código 0.
  3. Existem `web/src/app/layout.tsx` e `web/src/app/page.tsx`, e `web/src/server/` e `web/src/components/` existem.
  4. `web/package.json` fixa `engines.node` e não contém `dependencies` de Firebase, Discord ou Vercel além do necessário (teste confere que nenhuma dependência é `latest` ou `*`).
- **Arquivos prováveis:** `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`.
- **Status:** A fazer

## WEB-002 Configurar lint, typecheck e scripts npm
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-001
- **Descrição:** ESLint com a config do Next e `tsc --noEmit`. Scripts padrão do projeto.
- **Critérios de aceite:**
  1. `web/package.json` tem os scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test` (teste confere a existência e o conteúdo de `lint` e `typecheck`).
  2. `npm run lint` sai com código 0 e `--max-warnings=0`.
  3. `npm run typecheck` sai com código 0.
  4. Teste de higiene: nenhum `eslint-disable` e nenhuma regra `off` adicionada à config, e nenhum `@ts-ignore`/`@ts-nocheck` em `web/src` e `web/test`.
- **Arquivos prováveis:** `web/eslint.config.mjs`, `web/package.json`, `web/test/server/higiene.test.ts`.
- **Status:** A fazer

## WEB-003 Configurar Vitest e Testing Library
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-001
- **Descrição:** Vitest com ambientes separados (node para `web/test/server`, jsdom para `web/test/ui`), alias `@/`, Testing Library e jest-dom.
- **Critérios de aceite:**
  1. `npm test` roda ao menos um teste de servidor e um de UI (smoke) e passa.
  2. Teste de higiene falha se existir `.only`, `.skip`, `.todo` ou `xit` em `web/test`.
  3. Um teste de servidor importa `@/server/...` pelo alias sem erro.
  4. Os testes rodam sem nenhuma variável `FIREBASE_*` ou `DISCORD_*` definida.
- **Arquivos prováveis:** `web/vitest.config.ts`, `web/test/setup.ts`, `web/test/server/smoke.test.ts`, `web/test/ui/smoke.test.tsx`.
- **Status:** A fazer

## WEB-004 Higiene do repositório e `.env.example` com valores falsos
- **Tipo:** Tarefa · **Prioridade:** Highest (segredo) · **Camada:** back · **Dependências:** WEB-001
- **Descrição:** `.gitignore` do site e `.env.example` com todas as variáveis previstas e valores obviamente falsos. Varredura automatizada de segredos.
- **Critérios de aceite:**
  1. `web/.gitignore` contém `node_modules/`, `.next/`, `.env`, `.env.local`, `.env*.local`, `.vercel/`, `coverage/` (teste lê o arquivo).
  2. `web/.env.example` lista cada variável de `requisitos.md` (Firebase, Discord, `SESSION_SECRET`, `APP_URL`, os 6 webhooks) e todo valor casa com um padrão de falso (`troque-aqui`, `exemplo`, `000…`); nenhum valor com cara de chave real.
  3. Teste de varredura falha se o repositório rastreado contiver `BEGIN PRIVATE KEY`, `private_key_id` com valor, `discord.com/api/webhooks/<id>/<token>` com token real, ou padrão de token do Discord.
  4. `git ls-files` não contém `.env`, `.env.local`, `node_modules/` nem `.next/`.
- **Arquivos prováveis:** `web/.gitignore`, `web/.env.example`, `web/test/server/segredos.test.ts`.
- **Status:** A fazer

## WEB-005 Módulo de variáveis de ambiente validado
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-003
- **Descrição:** `getEnv()` lê `process.env` sob demanda (nunca no topo do módulo), valida tudo e devolve objeto tipado. Falha com a lista de TODAS as ausentes. Marcado como `server-only`.
- **Critérios de aceite:**
  1. Com todas as variáveis válidas, `getEnv()` devolve o objeto tipado com os valores.
  2. Para cada variável obrigatória, um teste: ausente ou só espaços lança erro cujo texto cita o nome (e nunca o valor das demais).
  3. `SESSION_SECRET` com menos de 32 caracteres é recusado; `APP_URL` precisa ser URL `https` (aceita `http://localhost` somente fora de produção).
  4. `FIREBASE_PRIVATE_KEY` com `\n` literal é convertida em quebra de linha.
  5. Cada webhook precisa casar `https://discord.com/api/webhooks/...`; valor fora desse padrão é recusado.
  6. O módulo importa `server-only`; teste de varredura garante que nenhum arquivo em `web/src/components` nem `"use client"` o importe.
- **Arquivos prováveis:** `web/src/server/env.ts`, `web/test/server/env.test.ts`.
- **Status:** A fazer

## WEB-006 Erro padronizado da API e logger sem segredos
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-003
- **Descrição:** Tipos `ErroApp` (código, status, mensagem pt-BR) e helper de resposta JSON. Logger que remove segredos e nunca devolve stack ao usuário.
- **Critérios de aceite:**
  1. Erro de validação vira status 400, sem sessão 401, sem permissão 403, não encontrado 404, conflito 409, limite 429, interno 500; cada um com `erro` em português.
  2. Erro desconhecido (ex.: `Error('FIREBASE_PRIVATE_KEY=abc')`) vira 500 com mensagem genérica e sem o texto original no corpo.
  3. O logger mascara valores das variáveis de `getEnv()` e padrões de URL de webhook e de token; teste injeta um segredo falso e confere que a saída não o contém.
  4. Corpo da resposta nunca contém `stack`.
- **Arquivos prováveis:** `web/src/server/erros.ts`, `web/src/server/http.ts`, `web/src/server/log.ts`, `web/test/server/erros.test.ts`.
- **Status:** A fazer

## WEB-007 CI no GitHub Actions (opcional)
- **Tipo:** Tarefa · **Prioridade:** Low · **Camada:** back · **Dependências:** WEB-002, WEB-003
- **Descrição:** Workflow que roda `npm ci`, lint, typecheck, test e build em `web/` a cada push e PR, sem segredos.
- **Critérios de aceite:**
  1. `.github/workflows/web.yml` roda os 5 passos na ordem e usa `working-directory: web`.
  2. O workflow não referencia `secrets.*` (teste lê o YAML).
  3. Usa `npm ci` e versão de Node igual à de `engines`.
- **Arquivos prováveis:** `.github/workflows/web.yml`, `web/test/server/ci.test.ts`.
- **Status:** A fazer

---

# Dados, validação e Firestore

## WEB-008 Parser numérico estrito e limites
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-003
- **Descrição:** `parseInteiro` estrito (só dígitos ASCII) e `LIMITES` congelado: quantidade 1 a 100.000, valor do caixa 1 a 1.000.000.000, nome 50, 25 itens por categoria, 200 linhas por ajuste, anotação 100 (valor da anotação a confirmar pelo architect).
- **Critérios de aceite:**
  1. Aceita `"1"`, `"100000"`, `"007"` e números do JSON `10`; recusa `"10abc"`, `"1.5"`, `"1,5"`, `"-5"`, `"+5"`, `"1e3"`, `"0x10"`, `"1_000"`, `" 5 "` com espaço interno, `""`, `null`, `undefined`, `NaN`, `Infinity`, `1.5`, dígitos árabes e fullwidth, e strings com mais de 15 dígitos.
  2. Quantidade: `0` e `100001` recusados, `100000` aceito. Valor do caixa: `0` e `1000000001` recusados, `1000000000` aceito.
  3. A mensagem de erro é em português e distingue "formato", "mínimo" e "acima do limite".
  4. `LIMITES` é `Object.freeze`; tentar alterar não muda o valor (teste).
- **Arquivos prováveis:** `web/src/server/validacao/numero.ts`, `web/src/server/validacao/limites.ts`, `web/test/server/validacao-numero.test.ts`.
- **Status:** A fazer

## WEB-009 Validação de nome e id seguro de item
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-003, WEB-008
- **Descrição:** `validarNomeItem` e `gerarIdItem`. Como o ajuste usará ids (não texto), a lição D1 se cumpre pelo desenho; mesmo assim o nome não pode quebrar nada.
- **Critérios de aceite:**
  1. Nome: `trim`, espaços colapsados, 1 a 50 caracteres; `""`, só espaços e 51 caracteres recusados; 50 aceito.
  2. Id: minúsculo, sem acento, tudo fora de `[a-z0-9]` vira `_`, `_` repetidos colapsados e aparados, máximo 50, nunca vazio; `"!!!"` e `"🔫"` são recusados (id vazio).
  3. Id nunca contém `/`, `.`, `__` nem `#` (o separador `__` do bot não existe no site); `"A/B"`, `"../x"` e `"__proto__"` geram id seguro ou erro, nunca chave perigosa.
  4. Nomes equivalentes geram o mesmo id (`"Pistola 9mm"`, `"pistola-9mm"`, `"PISTOLA 9MM"`), permitindo detectar duplicado.
  5. Nome iniciado por `#` é aceito e o id gerado ignora o `#` (D1: nenhum formato textual depende do nome).
- **Arquivos prováveis:** `web/src/server/validacao/item.ts`, `web/test/server/validacao-item.test.ts`.
- **Status:** A fazer

## WEB-010 Firebase Admin restrito ao servidor
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-005
- **Descrição:** `getDb()` com Admin SDK inicializado uma vez a partir de `getEnv()`, com `setDb`/`resetDb` para injeção em testes. Importa `server-only`. Nenhum pacote cliente do Firebase (`firebase`) nas dependências.
- **Critérios de aceite:**
  1. Com `setDb(fake)`, `getDb()` devolve o fake e não chama `firebase-admin` (espião).
  2. Sem variáveis, `getDb()` falha antes de `initializeApp`.
  3. `initializeApp` é chamado no máximo uma vez em chamadas repetidas.
  4. `web/package.json` não depende de `firebase` (SDK cliente); só de `firebase-admin` (teste lê o JSON).
  5. Varredura: nenhum arquivo em `web/src/components`, nenhum com `"use client"` e nenhum de `web/src/app` fora de `api` e de server components importa `firebase-admin` ou `@/server/db`.
- **Arquivos prováveis:** `web/src/server/firebase.ts`, `web/test/server/firebase.test.ts`.
- **Status:** A fazer

## WEB-011 Fake do Firestore transacional para testes
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-003
- **Descrição:** Portar para TypeScript o fake descrito em `docs/architecture.md` §4.11 (transações em fila, escritas em buffer, `falharProximoCommit`, `dump`, registro de chamadas).
- **Critérios de aceite:**
  1. Duas transações paralelas de ler-alterar-gravar no mesmo documento resultam em ambas aplicadas (atomicidade); o mesmo código fora de transação perde uma atualização (teste de sanidade).
  2. `falharProximoCommit` não aplica nada e a Promise rejeita.
  3. Callback que lança não aplica escritas.
  4. Ler depois de escrever na mesma transação lança erro (regra do Firestore).
  5. `dump()` devolve cópia profunda; `orderBy` + `limit` funcionam em subcoleções; `runTransaction` registra `emTransacao: true`.
- **Arquivos prováveis:** `web/test/helpers/fake-firestore.ts`, `web/test/server/fake-firestore.test.ts`.
- **Status:** A fazer

## WEB-012 Regras do Firestore que negam todo acesso de cliente
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-001
- **Descrição:** `web/firestore.rules` com `allow read, write: if false` para qualquer caminho, mais `firebase.json` apontando para as regras (documentado no README para publicar no console).
- **Critérios de aceite:**
  1. O arquivo contém exatamente uma regra `match /{document=**}` com `allow read, write: if false;` e nenhuma outra instrução `allow` (teste lê o texto).
  2. O texto não contém `if true`, `request.auth != null` nem `allow ... : if` com outra condição.
  3. (Opcional, se o emulador estiver disponível no CI) com `@firebase/rules-unit-testing`, leitura e escrita autenticadas ou anônimas em `bau/membros`, `caixa/saldo` e `auditoria/x` são negadas.
- **Arquivos prováveis:** `web/firestore.rules`, `web/firebase.json`, `web/test/server/regras.test.ts`.
- **Status:** A fazer

## WEB-013 Modelo de dados e tipos do domínio
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-008, WEB-009, WEB-010
- **Descrição:** Definir coleções e tipos (o architect detalha): `catalogo` (categorias e itens), `baus/{tipo}` com `versao` (inteiro incrementado a cada alteração) e itens por id, `caixa/saldo`, `logs` (por baú e do caixa), `auditoria`, `webhook_mensagens` (ids das mensagens editadas). O documento do baú NÃO mistura metadados com itens (lição do bot: campos que não são item quebram a listagem).
- **Critérios de aceite:**
  1. Tipos `TipoBau = 'membros' | 'gerencia'`, `TipoCaixa = 'sujo' | 'limpo'`, `Nivel` e os documentos exportados; `typecheck` passa.
  2. Helpers de referência (`refBau(tipo)`, `refCatalogo()`, `refSaldo()`, `refLogsBau(tipo)`, `refAuditoria()`) rejeitam tipo inválido com `ErroApp` 400.
  3. Teste de contrato: uma função de leitura do baú ignora/rejeita qualquer chave que não seja item e nunca devolve `versao` como item.
  4. Um documento de baú com 6 categorias × 25 itens fica abaixo de 100 KB serializado (teste de tamanho, prova margem ao limite de 1 MB).
- **Arquivos prováveis:** `web/src/server/dominio/tipos.ts`, `web/src/server/dominio/refs.ts`, `web/test/server/dominio.test.ts`.
- **Status:** A fazer

## WEB-014 Semente transacional do catálogo padrão
- **Tipo:** Bug-prevenção (D6) · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-011, WEB-013
- **Descrição:** Catálogo padrão (Medicamentos, Armas, Coletes e Munição, Materiais, Drogas, Extras; itens como no bot, ver `utils/` do bot arquivado) criado na primeira execução DENTRO de transação, sem sobrescrever dados existentes.
- **Critérios de aceite:**
  1. Banco vazio: `garantirCatalogo()` cria as 6 categorias com os itens padrão em uma transação (`emTransacao: true` em toda escrita).
  2. Chamado 20 vezes em paralelo no banco vazio, resulta em um único catálogo e as 20 chamadas devolvem o mesmo conteúdo.
  3. Catálogo já existente (com item adicionado pelo usuário) permanece intacto após `garantirCatalogo()`.
  4. Corrida: `adicionarItem` e `garantirCatalogo` simultâneos no banco vazio nunca perdem o item adicionado (D6).
  5. Nenhuma categoria padrão tem mais de 25 itens; todo id padrão passa em `gerarIdItem` sem colisão.
  6. Também cria `baus/membros` e `baus/gerencia` vazios com `versao: 0` e `caixa/saldo` zerado, na mesma transação.
- **Arquivos prováveis:** `web/src/server/catalogo/padrao.ts`, `web/src/server/catalogo/semente.ts`, `web/test/server/semente.test.ts`.
- **Status:** A fazer

---

# Autenticação, autorização e segurança

## WEB-015 Sessão em cookie httpOnly assinado com expiração
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-005, WEB-006
- **Descrição:** Criar, ler e apagar sessão. Cookie assinado (HMAC com `SESSION_SECRET`, ou JWT via `jose`; o architect decide) com `userId`, `nivel`, `cargosVerificadosEm` e expiração. Sem dado sensível no cookie (sem token do Discord).
- **Critérios de aceite:**
  1. Cookie criado com `HttpOnly`, `Secure` (em produção), `SameSite=Lax`, `Path=/` e `Max-Age`/`Expires` definidos (teste lê o `Set-Cookie`).
  2. Cookie adulterado (um byte) é rejeitado; cookie assinado com outro segredo é rejeitado; cookie expirado é rejeitado; o resultado é "sem sessão", nunca exceção para o usuário.
  3. Comparação de assinatura em tempo constante (usa `timingSafeEqual` ou a biblioteca; teste de varredura).
  4. O conteúdo do cookie decodificado não contém `access_token`, `client_secret` nem cargos brutos.
  5. Sem `SESSION_SECRET` válido, criar sessão lança erro.
- **Arquivos prováveis:** `web/src/server/auth/sessao.ts`, `web/test/server/sessao.test.ts`.
- **Status:** A fazer

## WEB-016 Início do fluxo Discord OAuth2 com state
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-015
- **Descrição:** `GET /api/auth/login` gera `state` aleatório (criptográfico), guarda em cookie curto httpOnly assinado e redireciona ao Discord com `client_id`, `redirect_uri`, `response_type=code`, escopos `identify guilds.members.read` e o `state`.
- **Critérios de aceite:**
  1. Resposta 307/302 para `https://discord.com/oauth2/authorize` com os 5 parâmetros esperados e `scope` exatamente `identify guilds.members.read`.
  2. `redirect_uri` é `${APP_URL}/api/auth/callback` (derivado de `getEnv`, nunca do cabeçalho `Host`).
  3. O `state` tem pelo menos 128 bits de entropia e muda a cada chamada; o cookie do state é httpOnly, Secure (produção), SameSite=Lax, com expiração ≤ 10 min.
  4. `client_secret` não aparece na URL de redirecionamento.
- **Arquivos prováveis:** `web/src/app/api/auth/login/route.ts`, `web/src/server/auth/oauth.ts`, `web/test/server/oauth-login.test.ts`.
- **Status:** A fazer

## WEB-017 Cliente Discord: troca de código e leitura dos cargos
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-005, WEB-006
- **Descrição:** Funções que chamam a API do Discord (via `fetch` injetável nos testes): `trocarCodigo(code)` em `POST /oauth2/token` e `obterMembro(accessToken)` em `GET /users/@me/guilds/{DISCORD_GUILD_ID}/member` (escopo `guilds.members.read`). O token do usuário é usado e descartado, nunca guardado.
- **Critérios de aceite:**
  1. A troca envia `grant_type=authorization_code`, `code`, `redirect_uri` e credenciais do cliente por corpo `application/x-www-form-urlencoded` (teste inspeciona a requisição simulada).
  2. `obterMembro` devolve `{ userId, roles: string[], nome, avatar }`; 404 do Discord (usuário fora do servidor) vira o resultado `naoMembro`, não erro 500.
  3. Resposta 4xx/5xx, JSON inválido, timeout (≥ 5 s) e rede caída viram `ErroApp` genérico, sem repetir o corpo da resposta do Discord nem o token no log.
  4. O código e o token nunca aparecem em log (teste com logger espiado).
- **Arquivos prováveis:** `web/src/server/discord/api.ts`, `web/test/server/discord-api.test.ts`.
- **Status:** A fazer

## WEB-018 Converter cargos em nível (membro, gerente, dono)
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-005
- **Descrição:** `nivelDeCargos(roles, env)` devolve 0 a 3. Hierarquia dono ⊃ gerente ⊃ membro. Cargo não configurado (variável vazia) nunca casa.
- **Critérios de aceite:**
  1. Tabela de testes: nenhum cargo → 0; só membro → 1; só gerente → 2; só dono → 3; gerente + dono → 3; cargo desconhecido → 0.
  2. Lista de cargos vazia, `undefined` ou não-array → 0 sem lançar.
  3. Se `DISCORD_ROLE_*` estiver vazio, esse cargo nunca concede nível, nem para `roles` contendo string vazia.
  4. Nível 0 significa "não entra": `exigirNivel` (WEB-022) nega.
- **Arquivos prováveis:** `web/src/server/auth/niveis.ts`, `web/test/server/niveis.test.ts`.
- **Status:** A fazer

## WEB-019 Callback do OAuth: validar state e criar sessão
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-016, WEB-017, WEB-018
- **Descrição:** `GET /api/auth/callback`: confere `state` do cookie contra o da URL, troca o código, lê membro e cargos, converte em nível e cria a sessão. Apaga o cookie do state.
- **Critérios de aceite:**
  1. `state` ausente, diferente do cookie, cookie ausente/adulterado/expirado → redireciona para `/login?erro=...` sem chamar o Discord.
  2. `code` ausente, ou `error=access_denied` na URL → redireciona para o login com mensagem curta.
  3. Usuário fora do servidor (`naoMembro`) ou nível 0 → sem sessão criada e mensagem "você não tem acesso".
  4. Sucesso: sessão criada com `userId` e `nivel` corretos; redireciona para `/`; cookie do state removido; o `state` não pode ser reutilizado (segunda chamada falha).
  5. Redirecionamento final é sempre caminho relativo fixo (sem open redirect via parâmetro `next` com URL externa).
  6. Falha do Discord em qualquer etapa → login com erro genérico, nenhuma sessão.
- **Arquivos prováveis:** `web/src/app/api/auth/callback/route.ts`, `web/test/server/oauth-callback.test.ts`.
- **Status:** A fazer

## WEB-020 Revalidação periódica dos cargos
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-015, WEB-017, WEB-018
- **Descrição:** Como o token do Discord não é guardado, a sessão guarda `cargosVerificadosEm`; passado o intervalo (sugestão: 15 min) a sessão exige novo login silencioso pelo Discord (redireciona ao OAuth, que reaproveita a autorização) para reler cargos. Rebaixamento ou saída do servidor tem efeito no máximo nesse intervalo. O architect pode escolher guardar o refresh token criptografado; a alternativa precisa de decisão dele.
- **Critérios de aceite:**
  1. Sessão com `cargosVerificadosEm` dentro do intervalo é aceita sem chamar o Discord.
  2. Sessão fora do intervalo é tratada como "revalidar": a rota responde 401 com código `REVALIDAR` e o front redireciona ao login (teste de rota e de guarda).
  3. Após a revalidação, se o nível caiu, a sessão nova tem o nível novo; se caiu para 0, a sessão é encerrada.
  4. O intervalo é constante exportada e testada com relógio simulado (`vi.useFakeTimers`).
- **Arquivos prováveis:** `web/src/server/auth/revalidacao.ts`, `web/src/server/auth/sessao.ts`, `web/test/server/revalidacao.test.ts`.
- **Status:** A fazer

## WEB-021 Logout
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-015
- **Descrição:** `POST /api/auth/logout` apaga o cookie de sessão (exige CSRF, ver WEB-023).
- **Critérios de aceite:**
  1. Resposta com `Set-Cookie` de expiração imediata do cookie de sessão (mesmos atributos `Path`).
  2. Após o logout, a leitura da sessão devolve "sem sessão".
  3. `GET /api/auth/logout` não encerra a sessão (retorna 405), evitando logout por imagem/link.
  4. Chamado sem sessão, responde sucesso idempotente (200) sem erro.
- **Arquivos prováveis:** `web/src/app/api/auth/logout/route.ts`, `web/test/server/logout.test.ts`.
- **Status:** A fazer

## WEB-022 Camada de autorização para rotas e server actions
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-015, WEB-018, WEB-020
- **Descrição:** `comAutorizacao({ nivel, csrf?, limite? }, handler)` que envolve toda rota e server action: sessão válida, não expirada, cargos recentes, nível suficiente; só então executa o handler, e antes de qualquer leitura ou escrita. Fail-closed: handler sem declaração de nível não compila/não carrega. O nível de baú depende do tipo (`gerencia` exige gerente).
- **Critérios de aceite:**
  1. Sem cookie → 401; cookie inválido/expirado → 401; precisa revalidar → 401 `REVALIDAR`; nível insuficiente → 403; nenhum desses casos executa o handler nem toca o Firestore (`fake.chamadas` vazio).
  2. Tabela nível × exigido (0, 1, 2, 3 × membro, gerente, dono) coerente com a hierarquia.
  3. Para rotas de baú, `tipo` `gerencia` com nível 1 → 403; tipo desconhecido (`xyz`) → 400/403 sem executar o handler.
  4. Exceção no handler → resposta 500 genérica (WEB-006), sem vazar detalhe.
  5. O handler recebe o usuário (`id`, `nivel`) da sessão; nunca confia em `userId` vindo do corpo/URL (teste com corpo malicioso).
  6. Tipagem: não existe maneira de exportar `GET/POST` de rota sem passar por `comAutorizacao` (a checagem automática é o WEB-026).
- **Arquivos prováveis:** `web/src/server/auth/autorizacao.ts`, `web/test/server/autorizacao.test.ts`.
- **Status:** A fazer

## WEB-023 Proteção CSRF nas rotas que alteram dados
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-015, WEB-022
- **Descrição:** Toda rota `POST/PUT/PATCH/DELETE` (e server action) exige: verificação de `Origin`/`Sec-Fetch-Site` igual a `APP_URL` e token CSRF (duplo envio, derivado da sessão) no cabeçalho `x-csrf-token`. Métodos GET nunca alteram dados.
- **Critérios de aceite:**
  1. Mutação sem token → 403; token errado/de outra sessão → 403; token correto + `Origin` correto → passa.
  2. `Origin` de outro site ou ausente em mutação → 403, mesmo com token correto.
  3. `Content-Type` diferente de `application/json` em mutação → 415.
  4. Rota `GET` com efeito colateral é proibida: teste de varredura nas rotas `GET` confirma que nenhuma chama função de escrita (lista de serviços de escrita).
  5. Endpoint/atributo que fornece o token ao front só responde a sessão válida.
- **Arquivos prováveis:** `web/src/server/seguranca/csrf.ts`, `web/src/app/api/csrf/route.ts`, `web/test/server/csrf.test.ts`.
- **Status:** A fazer

## WEB-024 Limite de requisições por usuário
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-022
- **Descrição:** Limitador por `userId` (e por IP nas rotas de login), janela deslizante. Na Vercel serverless a memória não é compartilhada: o architect decide se usa Firestore (transação em documento por janela) ou limite aproximado em memória com limite no IP; documentar a limitação.
- **Critérios de aceite:**
  1. Mais de N requisições na janela retornam 429 com `Retry-After`; N e janela são constantes configuráveis (padrão sugerido: 60/min por usuário; 10/min nas rotas de auth por IP).
  2. Usuário A estourar o limite não afeta o usuário B.
  3. Passada a janela (relógio simulado) o acesso volta.
  4. A checagem ocorre depois da autenticação e antes do handler; negado por limite não escreve no domínio.
  5. Chave do limitador usa o `userId` da sessão, nunca cabeçalho controlado pelo cliente (para usuários logados).
- **Arquivos prováveis:** `web/src/server/seguranca/limite.ts`, `web/test/server/limite.test.ts`.
- **Status:** A fazer

## WEB-025 Cabeçalhos de segurança
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-001
- **Descrição:** Cabeçalhos globais em `next.config` (ou middleware): CSP razoável com nonce ou `self`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- **Critérios de aceite:**
  1. Teste lê a configuração/middleware e confirma cada cabeçalho acima com valor esperado; CSP contém `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` e `form-action 'self'`.
  2. CSP não contém `unsafe-eval`; `unsafe-inline` só em `style-src` se justificado pelo architect.
  3. Respostas das rotas `/api/**` incluem `Cache-Control: no-store`.
  4. Cabeçalho `X-Powered-By` desativado (`poweredByHeader: false`).
- **Arquivos prováveis:** `web/next.config.ts`, `web/src/middleware.ts`, `web/test/server/cabecalhos.test.ts`.
- **Status:** A fazer

## WEB-026 Teste de cobertura: nenhuma rota escapa da autorização
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-022, WEB-023
- **Descrição:** Teste automatizado que varre `web/src/app/api/**/route.ts` e as server actions e prova que cada handler exportado passa por `comAutorizacao`, e executa cada rota com 4 perfis.
- **Critérios de aceite:**
  1. A varredura descobre todos os `route.ts`; cada método exportado (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) precisa estar na lista de rotas declarada com nível exigido. Rota nova fora da lista faz o teste falhar.
  2. Únicas exceções permitidas (lista explícita no teste): `/api/auth/login`, `/api/auth/callback`; qualquer outra rota pública faz o teste falhar.
  3. Cada rota protegida é chamada com: sem cookie, cookie adulterado, nível 1, nível 2 e nível 3; o resultado confere com o nível exigido e, nos negados, `fake.chamadas` está vazio.
  4. Cada rota de mutação, chamada sem token CSRF com sessão de nível suficiente, devolve 403 e não escreve.
  5. Server actions: o teste varre arquivos com `"use server"` e exige o wrapper de autorização em cada função exportada.
- **Arquivos prováveis:** `web/test/server/cobertura-rotas.test.ts` (back), `web/test/qa/rotas-adversariais.test.ts` (QA).
- **Status:** A fazer

## WEB-027 Verificar que nenhum segredo vai ao navegador
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** ambos · **Dependências:** WEB-005, WEB-010
- **Descrição:** Garantir que variáveis de ambiente e código de servidor nunca entram no bundle do cliente.
- **Critérios de aceite:**
  1. Nenhuma variável com prefixo `NEXT_PUBLIC_` é de segredo; teste lê `.env.example` e `next.config` e falha se alguma variável da lista de segredos tiver o prefixo.
  2. Após `npm run build` com valores falsos distintivos nas variáveis (ex.: `SEGREDO-FALSO-123`), a busca nesses valores em `.next/static/**` retorna zero ocorrências.
  3. Nenhum arquivo `"use client"` importa módulos de `@/server/**` (varredura de imports, transitiva).
  4. As respostas HTML de `/login` e `/` (render de teste) não contêm nenhum valor de variável secreta nem URL de webhook.
- **Arquivos prováveis:** `web/test/server/bundle-sem-segredos.test.ts`, `web/scripts/verificar-bundle.mjs`.
- **Status:** A fazer

---

# Baú

## WEB-028 Leitura de baú e catálogo
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-013, WEB-014, WEB-022
- **Descrição:** `lerBau(tipo)` devolve itens agrupados por categoria (com nome da categoria e do item vindos do catálogo) e a `versao`. `lerCatalogo()` devolve categorias e itens. Garante a semente antes de ler.
- **Critérios de aceite:**
  1. Baú vazio → todas as categorias sem itens e `versao` 0; estrutura estável (sem `undefined`).
  2. Itens de um baú aparecem na categoria certa com nome e quantidade; item cujo id saiu do catálogo aparece como "Item removido" (não quebra).
  3. Tipo inválido → `ErroApp` 400.
  4. A leitura não escreve no banco (exceto a semente do banco vazio, que é transacional).
  5. Resultado ordenado de forma determinística (categoria na ordem do catálogo; item por nome).
- **Arquivos prováveis:** `web/src/server/bau/leitura.ts`, `web/test/server/bau-leitura.test.ts`.
- **Status:** A fazer

## WEB-029 Adicionar item ao baú (atômico, com log)
- **Tipo:** Tarefa · **Prioridade:** Highest (perda de dados) · **Camada:** back · **Dependências:** WEB-008, WEB-013, WEB-014
- **Descrição:** `adicionarAoBau(tipo, categoriaId, itemId, quantidade, usuario)` em `runTransaction`: confere que o item existe no catálogo, soma, incrementa `versao`, grava o log de movimentação na mesma transação (lição N3).
- **Critérios de aceite:**
  1. Dois `adicionar` simultâneos (+5 e +7) resultam em 12; 50 adições paralelas somam corretamente.
  2. Toda escrita acontece com `emTransacao: true`, e o log (usuário, ação, item, quantidade, saldo resultante, data ISO) é gravado na mesma transação: com `falharProximoCommit`, nem estoque nem log mudam (`dump` idêntico).
  3. Quantidade `0`, `-1`, `1.5`, `"5"`, `100001` → `ErroApp` 400, nada gravado.
  4. Item ou categoria inexistente no catálogo, ou item que não pertence àquela categoria → 404/400, nada gravado.
  5. Resultado acima de `Number.MAX_SAFE_INTEGER` é recusado.
  6. `versao` do baú aumenta em 1 por operação bem-sucedida e não muda em operação recusada.
  7. O `usuario` do log vem da sessão (parâmetro), não de dado do cliente.
- **Arquivos prováveis:** `web/src/server/bau/operacoes.ts`, `web/test/server/bau-adicionar.test.ts`.
- **Status:** A fazer

## WEB-030 Remover item do baú (atômico, com log)
- **Tipo:** Tarefa · **Prioridade:** Highest (perda de dados) · **Camada:** back · **Dependências:** WEB-029
- **Descrição:** `removerDoBau(...)` em transação; estoque nunca negativo; chave apagada ao chegar a zero.
- **Critérios de aceite:**
  1. Duas remoções simultâneas de 6 com estoque 10 → exatamente uma sucesso, outra "estoque insuficiente" (409), estoque final 4.
  2. Remover exatamente o estoque apaga o item do documento (não fica com 0).
  3. Remover de item que não está no baú → 404 ("item não está no baú"), nada gravado.
  4. Log e `versao` na mesma transação; falha de commit não deixa log órfão.
  5. Validação de quantidade igual ao WEB-029 (mesmos valores inválidos).
  6. Adições e remoções de itens diferentes em paralelo não se perdem.
- **Arquivos prováveis:** `web/src/server/bau/operacoes.ts`, `web/test/server/bau-remover.test.ts`.
- **Status:** A fazer

## WEB-031 Rotas do baú (consultar, adicionar, remover)
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-022, WEB-023, WEB-028, WEB-029, WEB-030
- **Descrição:** `GET /api/bau/[tipo]`, `POST /api/bau/[tipo]/adicionar`, `POST /api/bau/[tipo]/remover`. Corpo `{ categoriaId, itemId, quantidade }`.
- **Critérios de aceite:**
  1. Nível exigido: `membros` → 1; `gerencia` → 2, em todas as três rotas (teste por rota e por nível).
  2. Corpo com campo extra, tipo errado ou ausente → 400; quantidade como string `"10abc"` → 400 com mensagem em português.
  3. Sucesso devolve `{ ok: true, dados: { quantidade, versao } }`; erros de regra devolvem 409/404 com `erro` curto.
  4. Corpo grande demais (> 10 KB) → 413.
  5. Nenhuma resposta contém stack nem texto de exceção do Firestore.
- **Arquivos prováveis:** `web/src/app/api/bau/[tipo]/route.ts`, `web/src/app/api/bau/[tipo]/adicionar/route.ts`, `web/src/app/api/bau/[tipo]/remover/route.ts`, `web/test/server/rotas-bau.test.ts`.
- **Status:** A fazer

---

# Caixa

## WEB-032 Leitura de saldo e histórico do caixa
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-013
- **Descrição:** `lerSaldo()` e `lerHistoricoCaixa({ limite, cursor })`.
- **Critérios de aceite:**
  1. Documento inexistente ou campo ausente → `{ sujo: 0, limpo: 0 }`.
  2. Histórico ordenado do mais novo para o mais antigo, paginado; `limite` máximo 100 (valor maior é reduzido ou recusado).
  3. Cada entrada traz usuário, tipo, ação, valor, anotação, saldo resultante e data ISO.
- **Arquivos prováveis:** `web/src/server/caixa/leitura.ts`, `web/test/server/caixa-leitura.test.ts`.
- **Status:** A fazer

## WEB-033 Movimentar caixa (entrada e saída, atômico, com anotação e log)
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-008, WEB-013
- **Descrição:** `movimentarCaixa({ tipo: 'sujo'|'limpo', acao: 'entrada'|'saida', valor, anotacao }, usuario)` em transação, com log na mesma transação.
- **Critérios de aceite:**
  1. Entradas paralelas de 100 e 200 somam 300; saídas paralelas que juntas excedem o saldo: uma passa, outra é recusada (409); o saldo nunca fica negativo.
  2. Saída exata do saldo → 0.
  3. Valor `0`, `-1`, `1.5`, `"1.000,50"`, `1000000001`, `NaN` → 400, nada gravado; tipo ou ação inválidos → 400.
  4. Anotação obrigatória: vazia ou só espaços → 400; acima do limite → 400; é guardada aparada e sem caracteres de controle.
  5. Saldo e log na mesma transação: com `falharProximoCommit`, `dump` idêntico e nenhum log.
  6. Resultado acima de `Number.MAX_SAFE_INTEGER` recusado.
  7. Sujo e limpo são independentes: movimentar um não altera o outro.
- **Arquivos prováveis:** `web/src/server/caixa/operacoes.ts`, `web/test/server/caixa-operacoes.test.ts`.
- **Status:** A fazer

## WEB-034 Rotas do caixa
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-022, WEB-023, WEB-032, WEB-033
- **Descrição:** `GET /api/caixa` (saldo), `GET /api/caixa/historico`, `POST /api/caixa/movimentar`.
- **Critérios de aceite:**
  1. Todas exigem nível 2; nível 1 e sem sessão negados sem tocar o banco.
  2. Mutação exige CSRF (sem token → 403).
  3. Corpo inválido → 400 em português; saldo insuficiente → 409; sucesso devolve o saldo novo.
  4. `limite`/`cursor` da query validados (não numérico → 400).
- **Arquivos prováveis:** `web/src/app/api/caixa/route.ts`, `web/src/app/api/caixa/historico/route.ts`, `web/src/app/api/caixa/movimentar/route.ts`, `web/test/server/rotas-caixa.test.ts`.
- **Status:** A fazer

---

# Catálogo

## WEB-035 Adicionar item ao catálogo (limite de 25 por categoria)
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-009, WEB-014
- **Descrição:** `adicionarItemAoCatalogo(categoriaId, nome, usuario)` em transação. Recusa duplicado por id equivalente.
- **Critérios de aceite:**
  1. Nome válido cria o item com id gerado; devolve `{ id, nome }`.
  2. `"!!!"`, `""`, 51 caracteres → 400; categoria inexistente → 404.
  3. `"Gaze"` e `"gaze"`, ou `"Pistola 9mm"` e `"pistola-9mm"` → o segundo recusado como duplicado (409).
  4. 26º item na mesma categoria → 409; 25º aceito.
  5. Dois cadastros paralelos do mesmo nome → um grava; 30 cadastros distintos paralelos na mesma categoria respeitam o limite de 25.
  6. Mesmo id em categorias diferentes é permitido? Decisão de teste: id é único por categoria (documentar); chave do baú usa `categoriaId` + `itemId`.
  7. Escrita em transação com log de auditoria da inclusão (`catalogo.adicionar_item`) na mesma transação.
- **Arquivos prováveis:** `web/src/server/catalogo/operacoes.ts`, `web/test/server/catalogo-adicionar.test.ts`.
- **Status:** A fazer

## WEB-036 Remover item do catálogo (baús e auditoria na mesma transação)
- **Tipo:** Tarefa · **Prioridade:** Highest (perda de dados) · **Camada:** back · **Dependências:** WEB-035
- **Descrição:** `removerItemDoCatalogo(categoriaId, itemId, usuario)`: remove do catálogo e dos dois baús em UMA transação e grava auditoria com `antes` (quantidades nos dois baús) e `depois: null`.
- **Critérios de aceite:**
  1. Remove o item do catálogo e dos baús `membros` e `gerencia`; auditoria `catalogo.remover_item` com usuário, data ISO, alvo e quantidades anteriores.
  2. `falharProximoCommit` ou falha injetada em qualquer escrita → `dump` idêntico e zero auditorias.
  3. Item inexistente → 404, nada gravado; `usuario` ausente → erro.
  4. `versao` dos baús afetados é incrementada (invalida ajustes em andamento, WEB-041).
  5. Item que estava em estoque 0/ausente nos baús: remove só do catálogo, auditoria com 0.
- **Arquivos prováveis:** `web/src/server/catalogo/operacoes.ts`, `web/test/server/catalogo-remover.test.ts`.
- **Status:** A fazer

## WEB-037 Rotas do catálogo
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-022, WEB-023, WEB-035, WEB-036
- **Descrição:** `GET /api/catalogo`, `POST /api/catalogo/itens`, `DELETE /api/catalogo/itens/[categoriaId]/[itemId]`.
- **Critérios de aceite:**
  1. `GET` exige nível 1 (necessário para o baú dos membros); `POST` e `DELETE` exigem nível 2 e CSRF.
  2. Corpo inválido → 400; duplicado/limite → 409; inexistente → 404.
  3. Parâmetros de caminho validados (id com formato seguro); `../` e `%2F` não passam.
  4. Sucesso devolve o catálogo atualizado ou o item.
- **Arquivos prováveis:** `web/src/app/api/catalogo/route.ts`, `web/src/app/api/catalogo/itens/route.ts`, `web/src/app/api/catalogo/itens/[categoriaId]/[itemId]/route.ts`, `web/test/server/rotas-catalogo.test.ts`.
- **Status:** A fazer

---

# Zerar baú

## WEB-038 Zerar baú (um ou ambos) com auditoria
- **Tipo:** Tarefa · **Prioridade:** Highest (perda de dados) · **Camada:** back · **Dependências:** WEB-013, WEB-029
- **Descrição:** `zerarBau(alvo: 'membros'|'gerencia'|'ambos', usuario)` em uma transação, com auditoria `bau.zerar` contendo o conteúdo anterior.
- **Critérios de aceite:**
  1. `'membros'` não altera `gerencia`; `'gerencia'` não altera `membros`; `'ambos'` altera os dois numa única transação e grava uma auditoria.
  2. A auditoria guarda `antes` (mapa item→quantidade de cada baú zerado) para permitir recuperação manual; `depois` vazio.
  3. Falha de commit → `dump` idêntico, zero auditorias.
  4. Alvo inválido (`'todos'`, `''`, `undefined`) → 400.
  5. `versao` dos baús zerados aumenta (invalida ajustes pendentes).
  6. Baú já vazio: operação válida; auditoria registra `antes` vazio (ou recusa com mensagem; o architect decide e o teste documenta).
  7. Cada zerar cria também um log de movimentação por baú (para aparecer na tela de logs).
- **Arquivos prováveis:** `web/src/server/bau/zerar.ts`, `web/test/server/bau-zerar.test.ts`.
- **Status:** A fazer

## WEB-039 Rota de zerar baú
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-022, WEB-023, WEB-038
- **Descrição:** `POST /api/bau/zerar` com `{ alvo, confirmacao }`. A confirmação é uma frase fixa enviada pelo cliente (ex.: `"ZERAR"`) para evitar clique acidental e chamadas forjadas.
- **Critérios de aceite:**
  1. Exige nível 2 e CSRF; nível 1 e anônimo negados sem escrita.
  2. Sem `confirmacao` correta → 400 e nada alterado.
  3. Alvo inválido → 400; sucesso devolve o resumo (quantos itens/unidades foram zerados).
  4. Dois zerar simultâneos: o segundo vê o baú vazio e não duplica a auditoria com conteúdo falso (auditoria do segundo com `antes` vazio ou recusa).
- **Arquivos prováveis:** `web/src/app/api/bau/zerar/route.ts`, `web/test/server/rotas-zerar.test.ts`.
- **Status:** A fazer

---

# Ajuste em massa (D1 e D3)

## WEB-040 Prévia do ajuste em massa (antes/depois e versão)
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-028, WEB-029
- **Descrição:** `preverAjuste(tipo, linhas: Array<{ categoriaId, itemId, quantidade }>)` valida e devolve o resumo `{ versao, linhas: [{ categoriaId, itemId, nome, antes, depois }], alterados }` sem gravar nada. Entrada por IDs (não por texto), o que elimina a ambiguidade do `#` (D1).
- **Critérios de aceite:**
  1. Nenhuma escrita no banco (`fake.chamadas` sem escritas); o resumo traz `antes` atual, `depois` pedido e a `versao` atual do baú.
  2. Quantidade `0` é permitida (remove o item); 100.001, negativo, decimal, string misturada → linha inválida e a prévia inteira recusada (400) listando as linhas inválidas.
  3. Mais de 200 linhas → 400; lista vazia → 400; item repetido (mesmo `categoriaId`+`itemId`) → 400.
  4. Item inexistente no catálogo → 400 com a linha indicada.
  5. Nomes de item que começam com `#`, contêm `:` ou quebra de linha funcionam normalmente (a entrada nunca é tratada como texto livre) — teste com item `#1 Especial: .50`.
  6. Linhas sem mudança (antes = depois) não contam em `alterados`.
- **Arquivos prováveis:** `web/src/server/bau/ajuste.ts`, `web/test/server/ajuste-previa.test.ts`.
- **Status:** A fazer

## WEB-041 Confirmar ajuste em massa com versão otimista
- **Tipo:** Tarefa · **Prioridade:** Highest (perda de dados, corrige D3) · **Camada:** back · **Dependências:** WEB-040
- **Descrição:** `confirmarAjuste(tipo, versaoVista, linhas, usuario)` em UMA transação: lê o baú, compara `versao` com `versaoVista`; se diferente, recusa (409, "o baú mudou desde o resumo, refaça o ajuste"); senão aplica, incrementa `versao`, grava auditoria `bau.ajuste_massa` (antes/depois por item) e logs.
- **Critérios de aceite:**
  1. Cenário D3: resumo mostra `Colt 3 → 5`; antes de confirmar entra um depósito de +10; a confirmação é recusada com 409, o estoque permanece 13 e não há auditoria.
  2. Sem mudança entre prévia e confirmação, aplica tudo e `versao` sobe 1; `alterados` correto.
  3. Tudo ou nada: uma linha inválida/inexistente na revalidação interna cancela todas; `dump` idêntico.
  4. Duas confirmações simultâneas com a mesma `versaoVista` → uma aplica, a outra recebe 409 (sem aplicar duas vezes).
  5. Auditoria na mesma transação; `falharProximoCommit` → nada muda.
  6. Itens fora do pedido não são tocados; `quantidade 0` remove o item.
  7. A versão também muda (e invalida o ajuste) após adicionar, remover, zerar baú e remover item do catálogo (um teste por operação).
  8. Auditoria só se `alterados > 0`; sem alterações devolve sucesso sem escrever versão nova.
- **Arquivos prováveis:** `web/src/server/bau/ajuste.ts`, `web/test/server/ajuste-confirmar.test.ts`.
- **Status:** A fazer

## WEB-042 Rotas do ajuste em massa
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-022, WEB-023, WEB-040, WEB-041
- **Descrição:** `POST /api/bau/[tipo]/ajuste/previa` e `POST /api/bau/[tipo]/ajuste/confirmar`. O cliente reenvia as linhas e a `versao` vista; o servidor não guarda estado de prévia (sem pendência em memória, que não funciona em serverless).
- **Critérios de aceite:**
  1. Exigem nível 2 (inclusive para o baú `membros`) e CSRF; nível 1 e anônimo negados sem escrita.
  2. `confirmar` sem `versao` → 400; `versao` desatualizada → 409 com mensagem pedindo para refazer.
  3. Tipo de baú inválido → 400/403; corpo maior que o limite razoável (ex.: 100 KB) → 413.
  4. `previa` nunca escreve (teste verifica `fake.chamadas`).
- **Arquivos prováveis:** `web/src/app/api/bau/[tipo]/ajuste/previa/route.ts`, `web/src/app/api/bau/[tipo]/ajuste/confirmar/route.ts`, `web/test/server/rotas-ajuste.test.ts`.
- **Status:** A fazer

---

# Logs e auditoria

## WEB-043 Consulta de logs de movimentação
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-029, WEB-033
- **Descrição:** `lerLogsBau(tipo, { limite, cursor })` e `lerLogsCaixa` (reuso do histórico).
- **Critérios de aceite:**
  1. Ordem decrescente por data; paginação por cursor sem repetir nem pular entradas (teste com 30 entradas e páginas de 10).
  2. `limite` entre 1 e 100; fora disso é reduzido ou recusado (comportamento fixo e testado).
  3. Entrada cujo item saiu do catálogo traz o nome gravado no log (não depende do catálogo atual).
  4. Cada entrada traz usuário (id e nome), ação, item, quantidade, data ISO.
- **Arquivos prováveis:** `web/src/server/logs/leitura.ts`, `web/test/server/logs-leitura.test.ts`.
- **Status:** A fazer

## WEB-044 Consulta de auditoria
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-036, WEB-038, WEB-041
- **Descrição:** `lerAuditoria({ limite, cursor, acao? })` com filtro por ação.
- **Critérios de aceite:**
  1. Retorna as ações `catalogo.remover_item`, `bau.zerar`, `bau.ajuste_massa` (e `catalogo.adicionar_item`) com `usuario`, `data`, `alvo`, `antes`, `depois`.
  2. Filtro por ação válido funciona; ação desconhecida → 400.
  3. Ordem decrescente e paginação estável.
  4. Auditoria gigante (zerar com 150 itens) não quebra a resposta e vem resumida na lista (`resumo`) com detalhe completo disponível por id.
- **Arquivos prováveis:** `web/src/server/auditoria/leitura.ts`, `web/test/server/auditoria-leitura.test.ts`.
- **Status:** A fazer

## WEB-045 Rotas de logs e auditoria
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-022, WEB-043, WEB-044
- **Descrição:** `GET /api/logs/bau/[tipo]`, `GET /api/logs/caixa`, `GET /api/auditoria`, `GET /api/auditoria/[id]`.
- **Critérios de aceite:**
  1. Logs do baú `membros` exigem nível 1 (decisão a confirmar: pergunta Q6); `gerencia`, caixa e auditoria exigem nível 2; auditoria é só leitura (nenhum método de escrita exportado).
  2. Parâmetros de query inválidos → 400.
  3. Nível insuficiente → 403 sem tocar o banco.
  4. `GET /api/auditoria/[id]` com id inexistente → 404.
- **Arquivos prováveis:** `web/src/app/api/logs/bau/[tipo]/route.ts`, `web/src/app/api/logs/caixa/route.ts`, `web/src/app/api/auditoria/route.ts`, `web/src/app/api/auditoria/[id]/route.ts`, `web/test/server/rotas-logs.test.ts`.
- **Status:** A fazer

---

# Webhooks do Discord (D2)

## WEB-046 Cliente de webhook do Discord (resiliente)
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-005, WEB-006
- **Descrição:** `enviarWebhook(canal, payload)` e `editarWebhook(canal, mensagemId, payload)` com `fetch` injetável, `?wait=true`, timeout, uma tentativa extra em 429 respeitando `retry_after` (limitado), e **nunca lança**: devolve `{ ok, motivo? }`.
- **Critérios de aceite:**
  1. Sucesso devolve `{ ok: true, mensagemId }`.
  2. Resposta 4xx/5xx, timeout (≤ 5 s), rede caída, JSON inválido → `{ ok: false }` sem lançar e sem logar a URL do webhook (log mascarado).
  3. 429 com `retry_after` curto → uma nova tentativa; `retry_after` longo (> 3 s) → desiste sem esperar.
  4. Payload com `allowed_mentions: { parse: [] }` sempre (impede `@everyone` a partir de nome de item/anotação).
  5. A URL do webhook vem só de `getEnv()` pelo nome do canal; canal desconhecido → `{ ok: false }`.
- **Arquivos prováveis:** `web/src/server/discord/webhook.ts`, `web/test/server/webhook-cliente.test.ts`.
- **Status:** A fazer

## WEB-047 Webhook de movimentação
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-046
- **Descrição:** Embed de cada movimentação de baú e de caixa (quem, o quê, quanto, saldo resultante), no canal de log certo (membros, gerência, caixa).
- **Critérios de aceite:**
  1. O canal é escolhido pelo tipo (`membros`, `gerencia`, caixa).
  2. Texto do embed truncado: título ≤ 256, descrição ≤ 4096, cada campo ≤ 1024, total ≤ 6000 mesmo com nome de item e anotação de tamanho máximo.
  3. Nomes com `@everyone`, `<@123>` e markdown são neutralizados (escape) e `allowed_mentions` vazio.
  4. Valores são formatados em pt-BR (ex.: `$1.000`).
- **Arquivos prováveis:** `web/src/server/webhooks/movimentacao.ts`, `web/test/server/webhook-movimentacao.test.ts`.
- **Status:** A fazer

## WEB-048 Construtor de embeds de inventário dentro dos limites
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-013, WEB-046
- **Descrição:** `montarEmbedsInventario(tipo, baú, catálogo)` puro. Respeita 6000 caracteres no total por mensagem, 1024 por campo, 4096 na descrição, 25 campos por embed e 10 embeds por mensagem (lição D2). Se não couber, divide em mais embeds e, no limite, trunca com "… e mais N".
- **Critérios de aceite:**
  1. Catálogo cheio (6 categorias × 25 itens, nomes de 50 caracteres, todas com estoque): soma de caracteres de todos os embeds de uma mensagem ≤ 6000; cada campo ≤ 1024; nenhum embed > 6000 sozinho; no máximo 10 embeds.
  2. Mensagem que excederia: o conteúdo restante é dividido em novos embeds ou truncado com "… e mais N itens"; nenhum item some em silêncio quando ainda há espaço.
  3. Baú vazio → um embed com "Nenhum item".
  4. A contagem de caracteres usa a regra do Discord (título + descrição + nomes e valores de campos + rodapé + autor).
  5. Teste de propriedade (gerador aleatório, 200 casos) nunca produz payload fora dos limites.
- **Arquivos prováveis:** `web/src/server/webhooks/inventario-embeds.ts`, `web/test/server/webhook-embeds.test.ts`.
- **Status:** A fazer

## WEB-049 Webhook de inventário com mensagem editada
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-048
- **Descrição:** Atualiza a mesma mensagem do canal de inventário (um webhook por baú), guardando `mensagemId` em `webhook_mensagens/{chave}`. Se a edição falhar com 404 (mensagem apagada), envia uma nova e guarda o novo id.
- **Critérios de aceite:**
  1. Sem id salvo: envia (`wait=true`) e grava o id; nas próximas, edita via PATCH sem enviar nova.
  2. Edição com 404 → envia nova mensagem e grava o novo id (uma só nova mensagem em 3 chamadas seguidas).
  3. Outros erros (500, timeout) não criam mensagem duplicada e não lançam; devolvem `{ ok: false }`.
  4. Quando o inventário exige mais mensagens do que a anterior (divisão), o comportamento é definido e testado (ex.: uma mensagem por baú, com embeds extras na mesma mensagem até 10; acima disso, trunca com aviso).
  5. Dois atualizadores simultâneos não gravam ids de mensagem diferentes sem controle: a gravação do id é transacional.
  6. Mensagens usam `allowed_mentions` vazio.
- **Arquivos prováveis:** `web/src/server/webhooks/inventario.ts`, `web/test/server/webhook-inventario.test.ts`.
- **Status:** A fazer

## WEB-050 Webhook de saldo do caixa
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-046
- **Descrição:** Mensagem de saldo (sujo e limpo) editada no canal de saldo, mesma estratégia do WEB-049.
- **Critérios de aceite:**
  1. Embed mostra sujo e limpo formatados em pt-BR; saldo ausente → `$0`; nenhum `undefined`.
  2. Primeira vez envia e guarda id; depois edita; 404 recria.
  3. Falhas não lançam.
  4. Respeita os limites de tamanho do embed.
- **Arquivos prováveis:** `web/src/server/webhooks/saldo.ts`, `web/test/server/webhook-saldo.test.ts`.
- **Status:** A fazer

## WEB-051 Efeitos pós-transação: webhooks nunca desfazem nem escondem o sucesso
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** back · **Dependências:** WEB-031, WEB-034, WEB-037, WEB-039, WEB-042, WEB-047, WEB-049, WEB-050
- **Descrição:** Depois que a transação confirma, as rotas disparam os webhooks pertinentes (movimentação, inventário, saldo) como "melhor esforço". Falha do Discord só é logada. Na Vercel, usar `after()` do Next ou aguardar com timeout curto para a função não ser encerrada antes do envio (o architect decide e documenta).
- **Critérios de aceite:**
  1. Mapa de eventos testado: adicionar/remover baú → movimentação + inventário do baú; caixa → movimentação do caixa + saldo; remover item do catálogo, zerar e ajuste → inventário (dos baús afetados) e aviso correspondente.
  2. Webhook rejeitando/lançando/lento: a rota ainda responde 200 com o resultado correto, o Firestore mantém a alteração e a auditoria; resposta não contém erro do Discord.
  3. A transação nunca é chamada de novo nem revertida por falha de webhook (contagem de transações no fake).
  4. Webhooks só disparam após commit: se a transação falhar, nenhum webhook é enviado.
  5. Tempo de resposta da rota não depende de webhook lento (webhook que demora 10 s não atrasa a resposta além de um limite fixo, com relógio simulado).
- **Arquivos prováveis:** `web/src/server/webhooks/eventos.ts`, ajustes finos nas rotas, `web/test/server/efeitos-pos-transacao.test.ts`.
- **Status:** A fazer

---

# Front-end

## WEB-052 Cliente de API do front (CSRF, erros, sessão expirada)
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-023, WEB-006
- **Descrição:** Módulo `api.ts` do cliente: busca e envia o token CSRF, faz `fetch` JSON, converte erros em mensagens para exibir, trata 401 `REVALIDAR` redirecionando ao login e 429 com aviso.
- **Critérios de aceite:**
  1. Mutações enviam `x-csrf-token` e `Content-Type: application/json`; `GET` não envia corpo.
  2. 401 → redireciona para `/login`; `REVALIDAR` → redireciona para `/api/auth/login`; 403, 409 e 429 devolvem mensagem em português para a UI.
  3. Falha de rede → erro "sem conexão" (sem lançar para a árvore de componentes).
  4. Nunca lê nem grava cookies manualmente; nunca acessa `localStorage` para dados de sessão.
- **Arquivos prováveis:** `web/src/components/api.ts` (ou `web/src/lib/api-cliente.ts`), `web/test/ui/api-cliente.test.ts`.
- **Status:** A fazer

## WEB-053 Layout, tokens visuais e navegação responsiva
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-001
- **Descrição:** Layout raiz em pt-BR, tokens de cor/tipografia/espaçamento, navegação celular primeiro (barra inferior ou menu) com itens por nível, e botão de sair. A identidade visual depende da resposta às perguntas Q2 e Q3.
- **Critérios de aceite:**
  1. `<html lang="pt-BR">` e `<title>` por página (teste).
  2. Menu mostra "Baú dos Membros" (nível 1+), "Baú da Gerência", "Caixa", "Painel", "Logs", "Auditoria" (nível 2+); com nível 1 os itens de gerência não aparecem (e o servidor continua negando, WEB-022).
  3. Navegação funciona só com teclado (Tab/Enter) e o item atual tem `aria-current="page"`.
  4. Alvos de toque ≥ 44 px (classe/estilo testado) e nenhum overflow horizontal em largura 360 px (teste de layout simulado ou verificação de CSS).
  5. Botão "Sair" envia `POST` de logout com CSRF.
- **Arquivos prováveis:** `web/src/app/layout.tsx`, `web/src/app/globals.css`, `web/src/components/Navegacao.tsx`, `web/test/ui/navegacao.test.tsx`.
- **Status:** A fazer

## WEB-054 Guarda de páginas por nível
- **Tipo:** Tarefa · **Prioridade:** Highest · **Camada:** front · **Dependências:** WEB-022, WEB-053
- **Descrição:** Server components/layouts por rota que leem a sessão no servidor e redirecionam: sem sessão → `/login`; nível insuficiente → página "sem permissão". É conforto de UX; a segurança real é das rotas.
- **Critérios de aceite:**
  1. Sem sessão, cada página protegida redireciona a `/login` sem renderizar dados.
  2. Nível 1 em `/bau/gerencia`, `/caixa`, `/painel`, `/ajuste`, `/logs`, `/auditoria` → página 403 em português, sem chamar o Firestore.
  3. Tabela página × nível coerente com o menu (um teste percorre todas as páginas).
  4. Sessão a revalidar → redireciona ao início do OAuth.
- **Arquivos prováveis:** `web/src/app/(protegido)/layout.tsx`, `web/src/components/SemPermissao.tsx`, `web/test/ui/guardas.test.tsx`.
- **Status:** A fazer

## WEB-055 Tela de login
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-019, WEB-053
- **Descrição:** `/login` com botão "Entrar com Discord" (link para `/api/auth/login`) e mensagens de erro vindas de `?erro=`.
- **Critérios de aceite:**
  1. Renderiza o botão apontando para `/api/auth/login`.
  2. Cada código de erro conhecido mostra mensagem em português; código desconhecido mostra mensagem genérica (sem refletir o valor da query, sem HTML injetado).
  3. Usuário já logado em `/login` é redirecionado ao início.
  4. Página não expõe nenhuma variável de ambiente.
- **Arquivos prováveis:** `web/src/app/login/page.tsx`, `web/test/ui/login.test.tsx`.
- **Status:** A fazer

## WEB-056 Componentes de estado: carregando, vazio e erro
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** front · **Dependências:** WEB-053
- **Descrição:** Componentes `Carregando`, `Vazio`, `ErroTela` (com botão "Tentar de novo") e `error.tsx`/`loading.tsx` das rotas.
- **Critérios de aceite:**
  1. `Carregando` tem `role="status"` e texto acessível; `ErroTela` tem `role="alert"`.
  2. "Tentar de novo" chama o callback recebido.
  3. Nenhum componente exibe texto técnico/stack; mensagens vêm por props.
  4. Cada página de dados usa os três estados (verificado nos testes das páginas).
- **Arquivos prováveis:** `web/src/components/Estados.tsx`, `web/src/app/error.tsx`, `web/test/ui/estados.test.tsx`.
- **Status:** A fazer

## WEB-057 Componente de baú (lista por categoria, adicionar e remover)
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-052, WEB-056
- **Descrição:** Componente reutilizável do baú: itens por categoria, quantidade, formulário para adicionar/remover item com quantidade (select de categoria/item + campo numérico).
- **Critérios de aceite:**
  1. Mostra os itens agrupados por categoria; estado vazio mostra "Nenhum item".
  2. Campo de quantidade: `inputMode="numeric"`, rótulo associado, rejeita no cliente `0`, negativo, decimal, texto, acima de 100.000, com mensagem; o servidor continua validando (teste que envia valor inválido e vê o erro 400 da API).
  3. Durante o envio o botão fica desabilitado (sem duplo envio); após sucesso a lista é atualizada e há aviso de sucesso (`aria-live`).
  4. Erro de estoque insuficiente (409) aparece como mensagem sem fechar o formulário.
  5. Remover só é oferecido para itens com quantidade > 0.
- **Arquivos prováveis:** `web/src/components/Bau.tsx`, `web/test/ui/bau.test.tsx`.
- **Status:** A fazer

## WEB-058 Páginas Baú dos Membros e Baú da Gerência
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-031, WEB-054, WEB-057
- **Descrição:** `/bau/membros` (nível 1+) e `/bau/gerencia` (nível 2+) usando o componente de baú.
- **Critérios de aceite:**
  1. Cada página consome só as rotas `/api/bau/<tipo>`; nunca importa módulos de servidor de dados no cliente.
  2. `/bau/gerencia` com nível 1 → sem permissão (WEB-054); com nível 2 renderiza.
  3. Estados de carregamento, vazio e erro presentes (testes por estado).
  4. Título e `aria-label` distintos para as duas páginas.
- **Arquivos prováveis:** `web/src/app/(protegido)/bau/[tipo]/page.tsx`, `web/test/ui/paginas-bau.test.tsx`.
- **Status:** A fazer

## WEB-059 Tela do Caixa
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-034, WEB-052, WEB-054, WEB-056
- **Descrição:** `/caixa` (nível 2+): saldos sujo e limpo em destaque, formulário de entrada/saída com valor e anotação obrigatória, histórico.
- **Critérios de aceite:**
  1. Mostra os dois saldos formatados em pt-BR (`$1.000`); `0` quando ausente.
  2. Formulário: valor numérico estrito (1 a 1.000.000.000), anotação obrigatória (botão não envia vazio, com mensagem); tipo (sujo/limpo) e ação (entrada/saída) por controles rotulados.
  3. Saída maior que o saldo → mensagem de erro do servidor exibida.
  4. Histórico lista as últimas movimentações, com estado vazio e botão "carregar mais".
  5. Envio sem duplo clique e atualização dos saldos após sucesso.
- **Arquivos prováveis:** `web/src/app/(protegido)/caixa/page.tsx`, `web/src/components/Caixa.tsx`, `web/test/ui/caixa.test.tsx`.
- **Status:** A fazer

## WEB-060 Painel da gerência: catálogo
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-037, WEB-052, WEB-054, WEB-056
- **Descrição:** `/painel`: lista de categorias e itens, formulário de novo item (nome até 50, `maxLength`), botão remover com diálogo de confirmação mostrando o impacto (quantidades nos baús).
- **Critérios de aceite:**
  1. Adicionar: campo com `maxLength=50`; erros de duplicado, limite de 25 e nome inválido aparecem em português.
  2. Remover exige confirmação (diálogo acessível, foco preso, Esc cancela); cancelar não chama a API.
  3. Categoria com 25 itens mostra o contador "25/25" e desabilita o formulário daquela categoria.
  4. Após sucesso a lista atualiza sem recarregar a página.
- **Arquivos prováveis:** `web/src/app/(protegido)/painel/page.tsx`, `web/src/components/Catalogo.tsx`, `web/test/ui/painel-catalogo.test.tsx`.
- **Status:** A fazer

## WEB-061 Painel da gerência: zerar baú
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-039, WEB-052, WEB-054
- **Descrição:** Ação "Zerar baú" (membros, gerência ou ambos) com confirmação forte: o usuário digita a palavra exigida.
- **Critérios de aceite:**
  1. O botão de confirmar só é habilitado depois de digitar exatamente a frase de confirmação.
  2. Sem confirmar, nenhuma chamada à API é feita; cancelar fecha o diálogo.
  3. O diálogo diz claramente quais baús serão zerados e que a ação fica registrada na auditoria.
  4. Resultado (itens zerados) aparece em `aria-live`; erro da API aparece como alerta.
- **Arquivos prováveis:** `web/src/components/ZerarBau.tsx`, `web/test/ui/zerar-bau.test.tsx`.
- **Status:** A fazer

## WEB-062 Tela de ajuste em massa em tabela
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** front · **Dependências:** WEB-042, WEB-052, WEB-054, WEB-056
- **Descrição:** `/ajuste/[tipo]`: tabela editável com uma linha por item do catálogo (categoria, item, quantidade atual, nova quantidade). Fluxo: editar, "Ver resumo" (chama a prévia, guarda a `versao`), tela de resumo antes/depois, "Confirmar" (reenvia a `versao`) e, em 409, mensagem "o baú mudou, refaça" com botão para recarregar.
- **Critérios de aceite:**
  1. A tabela envia ids (nunca texto livre); item cujo nome começa com `#` ou tem `:` funciona (teste).
  2. Só linhas alteradas vão para a prévia; mais de 200 alteradas bloqueia com mensagem antes de chamar a API.
  3. Campo inválido (`10abc`, negativo, > 100.000) marca a linha com erro (`aria-invalid` e texto) e impede "Ver resumo".
  4. Resumo mostra antes → depois de cada item alterado; "Confirmar" chama a API com a `versao` do resumo.
  5. Resposta 409 mostra o aviso para refazer e descarta o resumo velho (não é possível reconfirmar o mesmo resumo).
  6. Sem alterações, "Ver resumo" fica desabilitado.
- **Arquivos prováveis:** `web/src/app/(protegido)/ajuste/[tipo]/page.tsx`, `web/src/components/AjusteTabela.tsx`, `web/test/ui/ajuste.test.tsx`.
- **Status:** A fazer

## WEB-063 Tela de logs de movimentação
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** front · **Dependências:** WEB-045, WEB-052, WEB-054, WEB-056
- **Descrição:** `/logs`: abas Baú dos Membros, Baú da Gerência e Caixa; lista paginada.
- **Critérios de aceite:**
  1. Abas navegáveis por teclado (`role="tablist"`); cada aba carrega o seu log.
  2. Datas exibidas no fuso `America/Sao_Paulo` em formato pt-BR.
  3. Vazio, carregando, erro e "carregar mais" tratados.
  4. Textos de usuário/anotação são exibidos como texto (nunca `dangerouslySetInnerHTML`; teste com `<img onerror>`).
- **Arquivos prováveis:** `web/src/app/(protegido)/logs/page.tsx`, `web/src/components/Logs.tsx`, `web/test/ui/logs.test.tsx`.
- **Status:** A fazer

## WEB-064 Tela de auditoria
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** front · **Dependências:** WEB-045, WEB-052, WEB-054, WEB-056
- **Descrição:** `/auditoria` (nível 2+): lista de ações sensíveis com filtro por tipo e detalhe antes/depois.
- **Critérios de aceite:**
  1. Lista mostra ação em português (ex.: "Item removido do catálogo"), quem, quando e resumo.
  2. Filtro por ação chama a API com o parâmetro correto.
  3. Detalhe mostra antes/depois; auditoria longa é paginada ou rolável sem quebrar o layout.
  4. Tela é somente leitura: nenhum botão que altere dados.
- **Arquivos prováveis:** `web/src/app/(protegido)/auditoria/page.tsx`, `web/src/components/Auditoria.tsx`, `web/test/ui/auditoria.test.tsx`.
- **Status:** A fazer

## WEB-065 Acessibilidade verificada por teste
- **Tipo:** Melhoria · **Prioridade:** Medium · **Camada:** front · **Dependências:** WEB-055, WEB-058, WEB-059, WEB-060, WEB-061, WEB-062, WEB-063, WEB-064
- **Descrição:** Verificação automatizada (`jest-axe`/`vitest-axe`) de todas as telas e revisão de teclado, foco e contraste.
- **Critérios de aceite:**
  1. Axe sem violações em cada tela, nos estados carregando, vazio, erro e com dados.
  2. Todo campo tem rótulo associado; todo botão de ícone tem nome acessível.
  3. Diálogos prendem o foco, devolvem o foco ao fechar e fecham com Esc.
  4. Contraste dos tokens (texto/fundo) ≥ 4,5:1, verificado por teste que calcula a razão a partir dos tokens.
  5. Mensagens de sucesso/erro usam `aria-live`/`role="alert"`.
- **Arquivos prováveis:** `web/test/ui/a11y.test.tsx`, ajustes em `web/src/components/**`.
- **Status:** A fazer

---

# Testes de ponta a ponta, deploy e entrega

## WEB-066 Testes de ponta a ponta dos fluxos no servidor
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** ambos · **Dependências:** WEB-051
- **Descrição:** Fluxos completos chamando os handlers de rota reais, com fake do Firestore e do Discord (fetch simulado), em `web/test/qa/`.
- **Critérios de aceite:**
  1. Login: OAuth simulado → sessão → acesso por nível (membro, gerente, dono) e negação de quem não está no servidor.
  2. Baú: adicionar, remover até zerar, concorrência (6 + 6 com estoque 10), log e webhooks enviados.
  3. Caixa: entrada, saída, saída recusada, histórico e webhook de saldo.
  4. Catálogo: adicionar, duplicado recusado, 26º recusado, remover com auditoria e baús limpos.
  5. Ajuste em massa: prévia → confirmar com sucesso; prévia → depósito → confirmar recusado (D3); item com `#` (D1).
  6. Zerar um e ambos com auditoria.
  7. Webhook fora do ar: todas as operações acima continuam com sucesso e dados corretos.
  8. Rebaixamento de cargo: após o intervalo de revalidação, o acesso de gerência é negado.
- **Arquivos prováveis:** `web/test/qa/e2e-fluxos.test.ts`, `web/test/helpers/**`.
- **Status:** A fazer

## WEB-067 Teste de ponta a ponta no navegador (opcional)
- **Tipo:** Tarefa · **Prioridade:** Low · **Camada:** ambos · **Dependências:** WEB-065, WEB-066
- **Descrição:** Playwright contra o build local com Firestore/Discord falsos (modo de teste habilitado só fora de produção).
- **Critérios de aceite:**
  1. Fluxo login simulado, adicionar item no baú e ver estoque atualizado em viewport de celular (390×844).
  2. O modo de teste (login falso) não existe no build de produção (teste de varredura do bundle e da rota).
  3. Roda com `npm run e2e` separado do `npm test`.
- **Arquivos prováveis:** `web/e2e/**`, `web/playwright.config.ts`.
- **Status:** A fazer

## WEB-068 Configuração da Vercel e variáveis documentadas
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-005, WEB-025
- **Descrição:** `vercel.json` (se necessário: região, funções), lista das variáveis de ambiente com descrição, onde obter cada uma e o que é segredo; instruções de `redirect URI` no portal do Discord e publicação das regras do Firestore.
- **Critérios de aceite:**
  1. Teste confere que o conjunto de variáveis em `.env.example`, `getEnv()` e na seção de variáveis do README/`docs/web/deploy.md` é idêntico (nenhuma falta, nenhuma sobrando).
  2. Cada variável tem a marcação "segredo" ou "público" no documento; todas as de Firebase, Discord, sessão e webhooks são "segredo".
  3. `vercel.json` (se existir) não contém segredos nem URLs de webhook.
  4. Documento lista o `redirect URI` exato (`${APP_URL}/api/auth/callback`) e o passo de rotação da chave do Firebase se vazar.
- **Arquivos prováveis:** `docs/web/deploy.md`, `web/vercel.json`, `web/test/server/env-documentada.test.ts`.
- **Status:** A fazer

## WEB-069 Build de produção limpo
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** ambos · **Dependências:** WEB-065, WEB-068
- **Descrição:** Garantir `npm run build` sem erro nem aviso, com valores falsos de ambiente, e o app iniciando em modo produção.
- **Critérios de aceite:**
  1. `npm run build` sai com 0 e sem linhas `warn`/`Failed` na saída (teste/script varre a saída).
  2. Nenhuma rota exige variável de ambiente em tempo de build além das falsas do `.env.example`; as rotas de dados são dinâmicas (não pré-renderizadas com dados).
  3. `npm run start` responde `/login` com 200 e `/api/caixa` sem sessão com 401.
  4. Cabeçalhos de segurança presentes na resposta real do build (WEB-025).
- **Arquivos prováveis:** `web/scripts/verificar-build.mjs`, `web/test/server/build.test.ts`.
- **Status:** A fazer

## WEB-070 README do site
- **Tipo:** Tarefa · **Prioridade:** Medium · **Camada:** back · **Dependências:** WEB-068
- **Descrição:** `web/README.md`: o que é, requisitos, instalação, scripts, variáveis (sem valores reais), configuração do Discord e do Firebase, deploy na Vercel, níveis de acesso, limites de entrada, aviso de segredos.
- **Critérios de aceite:**
  1. Todas as variáveis de `getEnv()` aparecem no README (teste).
  2. Os scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test` são citados.
  3. Varredura de segredos sem ocorrências; presença do aviso de rotação de chaves.
  4. Limites (100.000, 1.000.000.000, 50, 25, 200) e o intervalo de revalidação batem com as constantes do código (teste importa as constantes).
- **Arquivos prováveis:** `web/README.md`, `web/test/server/readme.test.ts`.
- **Status:** A fazer

## WEB-071 `npm audit` sem vulnerabilidade crítica ou alta
- **Tipo:** Tarefa · **Prioridade:** High · **Camada:** back · **Dependências:** WEB-001 (reexecutar antes da entrega)
- **Descrição:** Atualizar dependências para que `npm audit` não reporte nível crítico nem alto (lição QA-D5 do bot).
- **Critérios de aceite:**
  1. `npm audit --audit-level=high` em `web/` sai com código 0.
  2. `package-lock.json` está versionado e `npm ci` funciona em cópia limpa.
  3. Se alguma vulnerabilidade moderada permanecer, está listada com justificativa em `docs/web/qa-report.md`.
- **Arquivos prováveis:** `web/package.json`, `web/package-lock.json`.
- **Status:** A fazer

---

# Ordem sugerida de execução (ondas)

1. **Fundação:** 001, 002, 003, 004, 005, 006, 011, 012 (007 quando houver tempo).
2. **Validação e dados:** 008, 009, 010, 013, 014.
3. **Auth e segurança (risco primeiro):** 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 026, 027. Daqui em diante toda rota nova entra na lista do 026.
4. **Núcleo de dados (perda de dados):** 028 a 034, depois 035 a 039.
5. **Ajuste em massa:** 040, 041, 042.
6. **Logs, auditoria e webhooks:** 043 a 051.
7. **Front-end** (pode começar em paralelo com a onda 3 nos cards sem dependência de rotas, como 053): 052 a 065.
8. **Fechamento:** 066, 067, 068, 069, 070, 071.

Dois agentes nunca editam o mesmo arquivo na mesma onda; o architect valida a divisão final em `docs/web/architecture.md`.

# Perguntas ao usuário
(só o que depende de você; cada uma com o padrão que será usado se não houver resposta)

1. **Q1 Nome de exibição:** qual nome aparece no site e no título (ex.: "Stocky", "Stocky Marabunta")? Padrão: "Stocky".
2. **Q2 Identidade visual:** cores principais e se há logo/brasão da facção. **RESPONDIDO pelo usuário:** paleta roxo, preto e branco (roxo como destaque, fundo preto, texto branco). Logo: sem logo por enquanto.
3. **Q3 Modo escuro/claro:** só escuro, só claro, ou os dois seguindo o aparelho? Padrão: os dois, seguindo a preferência do sistema (escuro como base).
4. **Q4 Textos:** o tom das mensagens (formal ou na linguagem da galera) e os nomes das telas (ex.: "Baú dos Membros", "Baú da Gerência", "Caixa da gangue", "Painel da gerência"). Padrão: nomes do bot, tom direto e neutro.
5. **Q5 Limites:** servem 100.000 por operação de item, US$ 1 bilhão por operação de caixa, nome com 50 caracteres e anotação com 100? Padrão: esses valores.
6. **Q6 Quem vê o quê:** membros (nível 1) podem ver os logs do Baú dos Membros ou só a gerência vê logs e auditoria? E o ajuste em massa do Baú dos Membros é só da gerência? Padrão: logs do Baú dos Membros visíveis ao nível 1; todo o resto de logs, auditoria e ajuste só nível 2+.
7. **Q7 Sessão e revalidação:** de quanto em quanto tempo conferir os cargos no Discord (rebaixamento tem efeito nesse prazo)? E por quanto tempo a sessão dura? Padrão: conferir a cada 15 minutos, sessão de 7 dias.
8. **Q8 Domínio:** vai usar o endereço `*.vercel.app` ou um domínio próprio? Padrão: `*.vercel.app` (define `APP_URL` e o redirect do Discord).
9. **Q9 Zerar baú:** confirmar digitando uma palavra (padrão: `ZERAR`) é aceitável, ou prefere só um botão de confirmação? Padrão: digitar a palavra.
10. **Q10 Chaves já vazadas:** a chave do Firebase que esteve no repositório público do bot já foi revogada e há conta de serviço nova só para o site? Padrão: assumir que não e listar a rotação como passo obrigatório no deploy.
11. **Q11 Licença do site:** MIT ou ISC (o bot tem as duas citações)? Padrão: MIT.
12. **Q12 Testes no navegador (WEB-067) e CI (WEB-007):** quer os dois ou basta o conjunto de testes do Vitest? Padrão: CI sim, Playwright não.
