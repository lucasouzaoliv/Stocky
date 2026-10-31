# Relatório de QA — Stocky (STK-001 a STK-025, ondas 0 a 3)

QA: `qa-engineer` · 31/10/2026 · branch `melhorias/workflow-e-revisao` @ `7583d91` · base `origin/main`
Escopo: diff inteiro `git diff origin/main...HEAD` (código de produção não foi alterado pelo QA; só `test/qa-*.test.js` e este arquivo).

## 1. Resumo

| Item | Resultado |
|---|---|
| `npm ci` em cópia limpa (`git archive HEAD` → `/tmp/qa-stocky-limpo`) | OK: `added 307 packages`; `eslint . --max-warnings=0` na cópia limpa: exit 0 |
| `npm run lint` | exit 0, 0 erros, 0 avisos |
| `npm test` (suíte dos devs, 496 testes) | 496 pass, 0 fail, 0 skipped, 0 todo, sem `.only` |
| `npm test` (com os testes do QA, 527 testes) | 524 pass, **3 fail** (todos em `test/qa-defeitos.test.js`, defeitos reais abertos) |
| `node --check` em todos os `.js` versionados | 74 arquivos, 0 falhas |
| `git ls-files \| grep -c '^node_modules/'` | `0` |
| Varredura de segredos (HEAD e diff contra `origin/main`) | Nenhum segredo. Só ocorrências benignas (documentação, regex dos próprios testes, `private_key_id: credencial.privateKeyId`). Fragmentos da chave antiga (id da chave, início do PEM, project id, `client_id`, e-mail da conta de serviço) **ausentes** do estado atual e de todas as linhas adicionadas do diff |
| Teste de mutação (45 mutantes em cópia em `/tmp/qa-mut-work`) | 44 mortos; 1 sobrevivente equivalente (ver §3) |
| Defeitos abertos | **2 médios**, 3 baixos, 2 observações |

**Bloqueio**: defeitos de severidade média abertos (QA-D1, QA-D3) e teste falhando (`test/qa-defeitos.test.js`). Pela regra do WORKFLOW, o veredito é FAIL.

## 2. Evidências de execução

```
$ cd /tmp/qa-stocky-limpo && npm ci
added 307 packages, and audited 308 packages in 5s
32 vulnerabilities (1 low, 19 moderate, 10 high, 2 critical)      <- ver QA-D5
$ npx eslint . --max-warnings=0 ; echo $?
0
$ npm run lint ; echo $?            (repositório)
0
$ npm test                          (antes dos testes do QA)
# tests 496  # pass 496  # fail 0  # cancelled 0  # skipped 0  # todo 0
$ npm test                          (com test/qa-*.test.js)
# tests 527  # pass 524  # fail 3  # skipped 0
  not ok QA-D1 ... ; not ok QA-D2 ... ; not ok QA-D3 ...
$ node --test $(ls test/*.test.js | grep -v qa-defeitos)
# tests 524  # pass 524  # fail 0
$ for f in $(git ls-files '*.js'); do node --check $f; done   -> 74 arquivos, 0 falhas
$ git ls-files | grep -c '^node_modules/'                      -> 0
$ git grep -nE "BEGIN (RSA |EC )?PRIVATE KEY|private_key_id|AIza|xox[bp]-|<token discord>|iam\.gserviceaccount\.com" HEAD
  -> só .claude/agents/qa-engineer.md, docs/*.md, test/firebase.test.js ('id-falso-0000'),
     test/readme.test.js e test/segredos.test.js (regex), utils/firebase.js:41 (lê da credencial)
$ git diff origin/main...HEAD | grep '^+' | grep -F <cada fragmento da chave antiga>  -> 0 ocorrências
$ grep -rn "\.only(\|\.skip(\|skip:\|todo" test/      -> vazio
$ git grep eslint-disable HEAD -- '*.js'              -> vazio
```

## 3. Teste de mutação (prova de que os testes falhariam)

Cada mutação foi aplicada numa cópia nova (`git archive HEAD` em `/tmp/qa-mut-work`) e só os testes do card foram rodados. O repositório real nunca foi mutado.

| # | Card | Mutação | Resultado |
|---|---|---|---|
| 1 | 021/005 | roteador não chama `exigirNivel` | morta (13 falhas) |
| 2–3 | 004 | `bau_*:gerencia` exige só membro; tipo forjado vira membro | mortas |
| 4–6 | 003 | sem checagem de DM; config sem cargo libera; negação sempre via `followUp` | mortas |
| 7–10 | 007 | adicionar fora de `runTransaction`; remover deixa negativo; não apaga chave em 0; sem teto 100 000 | mortas |
| 11–12 | 008 | retirar deixa negativo; tipo não validado | mortas |
| 13–14 | 009 | `getSaldo()` sem `await`; leitura antes do `deferReply` | mortas |
| 15–16 | 010 | `embedInventario` sem `await`; sem truncar campo em 1024 | mortas |
| 17–18 | 011 | aceita sinal; aceita dígito unicode (`\p{Nd}`) | mortas |
| 19–22 | 012 | `parseInt` frouxo no baú; `replace(/\D/g,'')` no caixa; log de caixa duplicado; `maxLength` do valor 15 | mortas (#22 só pela suíte inteira: `validacao-handlers`) |
| 23–25 | 013 | ação de auditoria errada; zerar sem auditoria; ajuste parcial | mortas |
| 26 | 014 | `removerItemDoCatalogo` sem `interaction.user` | morta |
| 27–30 | 015 | confirmar sem checar dono; pendência não consumida; TTL ignorado; separa no primeiro `:` | mortas |
| 31–33 | 016 | duplicado só por nome exato; sem teto de 25; sem `maxLength 50` | mortas |
| 34 | 017 | sem tratar item inexistente | morta |
| 35 | 018 | painel da gerência volta com 1 linha | morta |
| 36 | 019 | id do painel gravado em `bau/membros` | morta |
| 37–38 | 020 | sempre busca legada; 10008 não recria | mortas |
| 39–41 | 021 | `GuildMessages` volta; `uncaughtException` sem sair; aceita id com `:` | mortas |
| 42 | 001 | `projectId: env.X \|\| 'fallback'` | **sobreviveu, equivalente**: `validarEnvFirebase` lança antes, o fallback é inalcançável. Além disso `test/segredos.test.js` proíbe literal no arquivo |
| 43 | 001 | sem trocar `\\n` | morta |
| 44–45 | 022 | `start.js` grava `config.json`; sem `exitCode = 1` | mortas |

## 4. Rastreabilidade por card

Legenda: arquivo de teste → cenários. "QA" indica teste novo escrito pelo QA.
Os testes previstos em §6 da arquitetura como `bau-permissoes`, `gerencia-permissoes` e `caixa-setup-permissoes` foram consolidados pelos devs em `test/permissoes-roteador.test.js` (roteador real e handlers reais), o que foi aceito.

### STK-001 — Credenciais do Firebase fora do código — **PASS**
1. Credencial só das 4 vars: `firebase.test.js` "montarCredencialFirebase usa exclusivamente as 4 variáveis", "getDb com as 4 variáveis monta o certificado só a partir delas" (admin simulado).
2. Uma por var ausente/vazia: `firebase.test.js` (loop por `VARIAVEIS_FIREBASE`, ausente e só espaços).
3. `\n` literal: `firebase.test.js` "\\n literal vira quebra de linha real" (mutação #43 morta).
4. Varredura: `segredos.test.js` (PEM, `private_key_id` com valor, `iam.gserviceaccount.com`, `client_id` literal) e "firebase.js não tem fallback". Varredura manual do QA no HEAD e no diff: limpa.
5. Sem rede: "getDb sem variáveis lança antes de initializeApp".

### STK-002 — `node_modules` fora do git — **PASS**
1–3. `repo-hygiene.test.js`: `.gitignore` com as 3 entradas; `git ls-files` sem `node_modules/`; sem `config.json`/`.env`; sem git → `assert.fail` explícito. Comando manual: `0`.

### STK-003 — Permissões centralizadas e DM — **PASS**
1–6. `permissoes.test.js`: tabela nível × cargo, `member` nulo/indefinido, `roles` como array, DM (`motivo: 'dm'`), cargos vazios → `config_ausente`, `negarAcesso` com reply/followUp único efêmero, Discord rejeitando não lança. Mutações #4–6 mortas. QA: `qa-adversarial` repete com `semMembro`, `rolesComoArray` e cargo desconhecido para todos os ids.

### STK-004 — Permissão nos handlers do baú — **PASS**
1–5. `permissoes-roteador.test.js` (4 handlers × membros/gerencia × sem cargo/membro/gerente/dono/DM/tipo forjado; negação é 1ª e única resposta; 0 chamadas no fake). Mutações #2–3 mortas. QA: `qa-adversarial` "nenhum customId nem comando escapa" gera todas as variantes reais de customId (inclusive tipo vazio e id base sem argumentos).
Observação QA-O1 (§5): tipo forjado em DM responde "sem permissão" em vez da mensagem de DM; continua negado.

### STK-005 — Gerente nos handlers de gerência — **PASS**
1–6. `permissoes-roteador.test.js` (todos os ids de gerência × sem cargo/membro/gerente/dono/DM; membro em `ger_zerar_confirmar`, `ger_item_remover:x`, `ger_modal_ajustar:membros` sem chamadas no fake; `ger_abrir_modal_ajustar` → `showModal` como única resposta); `gerencia-ajuste-confirmar.test.js` "permissão pelo roteador real". QA: `qa-adversarial` cobre também `ger_ajuste_confirmar`/`cancelar` com e sem argumentos.

### STK-006 — Gerente no caixa e nos `/setup*` — **PASS**
1–7. `permissoes-roteador.test.js` (caixa e comandos × perfis; negado sem `canal.send` nem escrita); `caixa-menu` usa `permissao: 'gerente'`; `roteador-cobertura.test.js` carrega as pastas reais e falha se faltar `permissao`.

### STK-007 — Estoque atômico — **PASS**
1–6. `db-bau.test.js`: +5/+7 → 12 e 50 adições paralelas; 6+6 com 10 → uma falha, estoque 4; itens diferentes em paralelo; todas as escritas com `emTransacao: true`; 0, -1, 1.5, '5', 100001 → `ErroValidacao` sem gravar; chave apagada em 0. Teste de sanidade prova que o fake faz o ler-alterar-gravar ingênuo perder atualização. Mutações #7–10 mortas. QA: `qa-e2e` repete a concorrência pelo roteador real (dois membros removendo 6+6; add/remove simultâneos na gerência).

### STK-008 — Saldo atômico — **PASS**
1, 2, 3, 5. `caixa.test.js` (concorrência sujo/limpo, retirada exata → 0, inválidos, tipo inválido, só transação). Mutações #11–12 mortas.

### STK-009 — `await` em `getSaldo` no `/setup-caixa` — **PASS**
1–4. `setup-caixa.test.js` (`$1.500`/`$300`, sem documento → `$0`, sem `undefined`/`[object Promise]`, `deferReply` antes da leitura). Mutações #13–14 mortas.

### STK-010 — `await` em Ver Estoque — **PASS** (com QA-D2 baixo aberto)
1–5. `bau-menu.test.js` e `embeds.test.js` (embed resolvido, vazio, falha → `followUp` efêmero e painel restaurado, `deferUpdate` antes, campos ≤ 1024). Mutações #15–16 mortas. O critério 5 (1024 por campo) passa; o limite **total** de 6000 por embed não é respeitado (QA-D2, fora do critério literal).

### STK-011 — Parser estrito — **PASS**
1–8. `validacao.test.js` (todos os valores do critério 2, `"007"`, `"١٢"`, `"１２"`, `"10 0"`, `> MAX_SAFE_INTEGER`, limites exatos, `LIMITES` congelado, `gerarIdItem`/`validarNomeItem`). Mutações #17–18 mortas. QA: `qa-adversarial` com zero-width, fullwidth, `1_000`, `0x10`, `Infinity`, 100 000 dígitos.

### STK-012 — Validação nos handlers — **PASS**
1–7. `validacao-handlers.test.js`, `bau-quantidade.test.js`, `caixa-modal.test.js`, `caixa-menu.test.js`, `bau-item.test.js` (maxLength 6/10, log do caixa 1 vez por sucesso, 0 em recusa, mensagens sem stack). Critério 3 entregue em STK-015 (`gerencia-ajustar.test.js`). Mutações #19–22 mortas.

### STK-013 — Auditoria e atomicidade de remover/zerar/ajustar — **PASS**
1–6. `db-auditoria.test.js` (remove do catálogo e dos 2 baús com 1 auditoria; `falharProximoCommit` e `falharEm` desfazem tudo; zerar só o indicado; `'ambos'` numa transação com 1 log; ajuste tudo-ou-nada; formato ADR-10; `usuario` ausente → `ErroValidacao`; `getAuditoria` desc). Mutações #23–25 mortas. Revisão: a auditoria é gravada com `tx.set` **na mesma transação** em todas as três operações (`utils/db.js:147`, `:179`, `:233`, `:321`).

### STK-014 — `gerencia-selects` usa as funções auditadas — **PASS**
1–5. `gerencia-selects.test.js` (chama com `interaction.user`; `sucesso:false` → erro amigável; Firestore rejeitando → `followUp` efêmero sem detalhe; varredura sem `getDb`/`firebase`; `deferUpdate` antes do banco; painel com 2 linhas). A confirmação de sucesso é `editReply` do painel após `deferUpdate` na mensagem do painel da gerência (canal restrito), não uma mensagem efêmera separada: mesmo padrão do código original, aceito.

### STK-015 — Ajuste em massa reforçado — **FAIL** (QA-D1 e QA-D3, médios)
1–10. `ajuste-texto.test.js`, `ajustes-pendentes.test.js`, `gerencia-ajustar.test.js`, `gerencia-ajuste-confirmar.test.js`, `gerencia-menu.test.js` cobrem todos os critérios literais (defer antes do banco, resumo com Confirmar/Cancelar sem gravar, 1 chamada com o usuário, cancelar, `"Pistola: .50"`, mesmo nome em 2 categorias, linha malformada, limite, só o autor confirma, expiração de 10 min, mensagem ≤ 2000 com anexo). Mutações #27–30 mortas. QA: `qa-e2e` faz o fluxo completo pelo roteador (texto gerado → modal → resumo → intruso negado → confirmar → auditoria → segundo clique "expirou"), duplo clique simultâneo aplica 1 vez, item removido do catálogo com ajuste pendente → tudo recusado.
Defeitos: QA-D1 (nome com `#` quebra a ida e volta do texto) e QA-D3 (resumo desatualizado sobrescreve movimentações).

### STK-016 (16b back / 16f front) — Id seguro e nome limitado — **FAIL** (QA-D1, médio, causa no cadastro)
1–7. `db-catalogo.test.js` (16b: `"!!!"`, `""`, 51 chars, `"Pistola 9mm"`/`"pistola-9mm"`, `"Gaze"`/`"gaze"`, 26º item, 2 e 30 cadastros paralelos, id sem `/`); `gerencia-modals.test.js` e `gerencia-selects.test.js` (16f: recusa efêmera, catálogo intacto, `maxLength 50`, painel com 2 linhas). Mutações #31–33 mortas. QA: `qa-e2e` cadastra `"  🔫  Pistola   Ação "` (normaliza para `🔫 Pistola Ação`, id `pistola_acao`), recusa `pistola acao` e usa o item no baú.
O cadastro aceita nome iniciado por `#`, que o ajuste em massa trata como cabeçalho (QA-D1).

### STK-017 — Item inexistente em `bau-item` — **PASS**
1–4. `bau-item.test.js` (inexistente → "Item não encontrado" sem modal; categoria inexistente; existente → `showModal` 1ª resposta; título ≤ 45; falha → genérico). Mutação #34 morta.

### STK-018 (18a / 18b) — UI centralizada e sem `config.json` no topo — **PASS**
1–6. `ui.test.js` (ids, rótulos, estilos, `embedCaixa({})`); `ui-duplicacao.test.js` (sem definição local das rows, sem `require` de `config.json`, ids base das rows existem no registro, sem `flags: 64` literal); `gerencia-modals`/`gerencia-selects` (painel com 2 linhas). Mutação #35 morta. Revisão manual: nenhum `require('../config.json')` em `interactions/`, `commands/`, `utils/`, `index.js` ou `deploy-commands.js`.

### STK-019 — Id da mensagem dos painéis — **PASS**
1–4. `db-paineis.test.js` (salvar/obter, `null`, substitui, `bau/*` intocado, chave inválida). Mutação #36 morta.

### STK-020 — Atualização única dos painéis — **PASS**
1–4. `painel.test.js` (id salvo → `fetch(id)` + `edit` sem `fetch({limit})`; migração legada uma vez e grava; 10008 → `send` + novo id; outro erro não recria; `send` rejeitando → `{ok:false, acao:'erro'}`; canal ausente → `ignorado`; varredura `messages.fetch({ limit` só em `utils/painel.js`); testes dos handlers chamadores. Mutações #37–38 mortas. QA: `qa-adversarial` com id salvo de **outro canal** (migra e regrava com o canal atual) e mensagem apagada (recria uma única vez em 3 movimentações).

### STK-021 — Roteador único — **PASS**
1–9. `roteador.test.js` (tabela de ids, `bau_item:adicionar:membros:armas`, desconhecido → `sem_handler` sem resposta, erro → reply/followUp efêmero, nunca lança, `unhandledRejection`/`uncaughtException`, `INTENTS = [Guilds]`, `carregarHandlers` falha sem `permissao`/id duplicado/id com `:`, `index.js` não faz login ao carregar, sem log por interação). Mutações #1, #39–41 mortas.

### STK-022 (22a / 22b) — Config validada e `start.js` sem gravar — **PASS**
1–4. `config.test.js` e `start.test.js` (env completa, 1 teste por variável ausente/vazia/"undefined", `exitCode = 1` sem `iniciar`, `config.json` não criado, `VARIAVEIS_OBRIGATORIAS`). Mutações #44–45 mortas. `deploy-commands.js` usa `getConfig()` (revisão manual; sem teste dedicado, o arquivo executa REST no carregamento: risco baixo, sem critério associado).

### STK-023 — Lint zero — **PASS**
1. `npm run lint` exit 0 (evidência §2). 2. Sem `eslint-disable` e sem regra `off` no `eslint.config.js` (o diff do arquivo contra `86c089e` é vazio). 3. `npm test` da suíte dos devs verde. 4. `node --check` em 74 arquivos.
Os critérios 1, 2 e 4 não tinham teste automatizado; o QA criou `test/qa-lint-higiene.test.js` (ESLint programático com 0 erros/0 avisos, varredura de `eslint-disable`, regras não desligadas, `node --check` em todos os `.js`).

### STK-024 — `package.json` — **PASS**
1–3. `package.test.js` (repository/bugs/homepage com `lucasouzaoliv/stocky`, sem `Luuqee`, scripts e engines, `require` válido). `npm ci` limpo OK.

### STK-025 — README — **PASS** (com observação QA-O2)
1–4. `readme.test.js` (todas as `VARIAVEIS_OBRIGATORIAS` e `VARIAVEIS_FIREBASE`, os 5 comandos `npm`, sem padrões de segredo, aviso de revogação e "start.js não gera config.json", limites e TTL batendo com o código, licença).

## 5. Defeitos

| ID | Severidade | Dono | Card | Status |
|---|---|---|---|---|
| QA-D1 | **Média** | backend-dev (alternativa: frontend-dev no parser) | STK-016b / STK-015 | Aberto, teste falhando |
| QA-D3 | **Média** | backend-dev + frontend-dev (exige ajuste de contrato pelo architect) | STK-015 / STK-013 | Aberto, teste falhando |
| QA-D2 | Baixa | frontend-dev | STK-010 | Aberto, teste falhando |
| QA-D4 | Baixa | frontend-dev | DoD item 6 | Aberto |
| QA-D5 | Baixa | backend-dev (novo card) | dependências | Aberto |
| QA-D6 | Baixa | backend-dev | ADR-01 | Aberto |

### QA-D1 (Média) — Nome de item iniciado por `#` quebra o ajuste em massa
- Arquivos: `utils/validacao.js:69-79` (`validarNomeItem` aceita `#`), `utils/db.js:271-293` (`adicionarItemAoCatalogo`), `utils/ajuste-texto.js:58-66` (`linha.startsWith('#')` vira cabeçalho), `utils/ajuste-texto.js:25` (`gerarTextoAjuste` escreve `#Nome:qtd`).
- Reproduzir: cadastrar o item `#1 Especial` em Armas pelo Painel da Gerência (aceito); depositar 3 no baú; clicar em "Ajustar Baú Membros", copiar o texto **gerado pelo próprio bot** e enviá-lo no modal. Resultado: "Linha 2: Categoria não encontrada", nada pode ser ajustado nessa categoria enquanto a linha existir (todas as linhas seguintes do bloco são ignoradas). Esperado: o texto gerado pelo bot sempre é aceito de volta.
- Teste: `test/qa-defeitos.test.js` "QA-D1" (falha hoje; passa se o cadastro recusar o nome ou se o parser aceitar a linha).
- Correção sugerida: recusar nomes que começam com `#` em `validarNomeItem` (mais simples, sem mudar o formato do texto). Itens já cadastrados com `#` precisam ser tratados também (parser: linha com `#` e `:` final numérico casando item do catálogo).

### QA-D3 (Média) — Resumo do ajuste em massa desatualizado sobrescreve movimentações em silêncio
- Arquivos: `interactions/gerencia-ajustar.js:43-58` (pendência guarda só a quantidade final), `interactions/gerencia-ajuste-confirmar.js:31`, `utils/db.js:184-237` (`ajustarBauEmMassa` grava valor absoluto, sem comparar com o `antes` mostrado).
- Reproduzir: gerente envia `Colt:5` com estoque 3; o resumo mostra `3 → 5`. Antes de confirmar (janela de até 10 min), um membro deposita 10 Colt (estoque 13). O gerente confirma: o estoque vira 5 e o depósito de 10 some sem aviso. A auditoria registra `antes: 13`, mas o gerente aprovou `3 → 5`.
- Impacto: perda de atualização no fluxo que o STK-015 deveria proteger com a confirmação; é o mesmo tipo de defeito que STK-007 corrigiu nas operações comuns.
- Teste: `test/qa-defeitos.test.js` "QA-D3" (falha hoje).
- Correção sugerida (precisa de decisão do architect, muda assinatura de §4.6): guardar o `antes` de cada linha na pendência e fazer `ajustarBauEmMassa` recusar (`sucesso:false`, "o baú mudou desde o resumo, refaça") quando o valor atual de alguma chave alterada diferir do `antes` esperado.

### QA-D2 (Baixa) — Embed de inventário pode passar do limite total de 6000 caracteres
- Arquivo: `utils/embeds.js:95-121`. Cada campo é truncado em 1024, mas 6 categorias × 1024 + título/rodapé = 6133 caracteres medidos (catálogo cheio, 25 itens por categoria, nomes de 50 caracteres).
- Reproduzir: `test/qa-defeitos.test.js` "QA-D2" (`embedLength` = 6133). No Discord, a edição/envio falha com erro 50035: Ver Estoque mostra o erro genérico e o painel de inventário deixa de atualizar (falha só logada).
- Correção sugerida: orçamento total (ex.: `floor((6000 - cabeçalho) / nº de categorias)` por campo) ou dividir em dois embeds.

### QA-D4 (Baixa) — Banco acessado antes da primeira resposta, sem `defer`, em três modais
- Arquivos: `interactions/bau-quantidade.js:58-72` (3 leituras + transação antes do `reply`), `interactions/caixa-modal.js:67-68`, `interactions/gerencia-modals.js:15`.
- Medido com o registro ordenado dos fakes: `bau-quantidade` faz `get catalogo/items` ×2, `get bau/membros`, `set bau/membros` antes da 1ª resposta; `caixa-modal` faz a transação do saldo antes; `gerencia-modals` faz a transação do catálogo antes.
- Comportamento igual ao original (não é regressão) e normalmente rápido, mas o DoD item 6 exige resposta ou `defer` em até 3 s; com o Firestore frio ou com reexecução de transação há risco de "A interação falhou" com a escrita já feita. Sugestão: `deferReply(efêmero)` no início e `editReply` no fim.

### QA-D5 (Baixa) — Dependências com vulnerabilidades conhecidas
- `npm ci` / `npm audit --omit=dev`: 32 vulnerabilidades (2 críticas, 10 altas), entre elas `@fastify/busboy`, `@grpc/grpc-js`, `protobufjs` (transitivas de `discord.js`/`firebase-admin`), todas com `npm audit fix` disponível. Fora do escopo dos 25 cards: abrir card novo pelo `jira-manager`.

### QA-D6 (Baixa) — `getCatalogo` grava o catálogo padrão fora de transação
- Arquivo: `utils/db.js:241-249`. Na primeira leitura (documento inexistente) faz `set(CATALOGO_PADRAO)` fora de `runTransaction`, contrariando a ADR-01 ("toda função que altera `catalogo/items` roda dentro de transação"). Se um `adicionarItemAoCatalogo` (que cria o documento na transação) terminar entre a leitura e esse `set`, o item novo é sobrescrito. Só ocorre com o banco vazio (primeiro uso); código anterior igual.

### Observações (não bloqueiam)
- **QA-O1**: `customId` de baú com tipo forjado enviado em DM recebe "Você não tem permissão" em vez da mensagem de DM (o nível `null` é resolvido antes de olhar a guilda, `utils/roteador.js:107-111`). Continua negado e sem tocar o banco; está conforme o contrato §4.5 ("nível null → nega com sem_cargo").
- **QA-O2**: o README trocou a licença de MIT para ISC e um `LICENSE` ISC foi adicionado, mas a pergunta P5 (qual licença vale) está em aberto no `docs/architecture.md` §9 e o STK-024 dizia para não mexer até a resposta. Confirmar com o usuário.

## 6. Revisão de código (diff inteiro)

- **Permissões**: todo módulo de `interactions/` e `commands/` declara `permissao`; `carregarHandlers` recusa módulo sem ela; `rotearInteracao` chama `exigirNivel` antes de `execute` (`utils/roteador.js:107-114`). O registro casa só pelo id base exato (`split(':')[0]`), sem prefixo parcial. QA enumerou todos os ids registrados × variantes de argumento × 6 perfis (`qa-adversarial`): nenhum escapa; DM, membro nulo, sem cargo e cargo desconhecido não tocam o banco. Os ids de botões `ger_ajuste_*` levam o id da pendência, e a autoria é conferida no handler.
- **await / defer / showModal**: nenhum `await` faltando encontrado. `showModal` é a primeira resposta em `bau-item`, `caixa-menu`, `gerencia-abrir-modal`, `gerencia-selects` (`ger_cat_adicionar`); a negação do roteador acontece antes. Exceção de prazo: QA-D4.
- **Validação de entrada**: parser estrito em todos os campos numéricos; `tipo` do caixa validado; `values[0]` do zerar validado contra lista; `tipo` vindo de customId validado no back (`exigirTipoBau`) e no nível de permissão.
- **Corridas**: estoque, saldo, catálogo, remoção, zerar e ajuste em transação; duplo clique em Confirmar consumido antes do primeiro `await` (testado em paralelo). Corrida restante: QA-D3 (lógica, entre o resumo e a confirmação) e QA-D6.
- **Erros**: mensagens genéricas efêmeras, sem `erro.message` nem stack para o usuário (grep: único `erro.message` é em `utils/config.js:110`, no log de inicialização). Efeitos secundários (log, canais, painel) não desfazem nem escondem o sucesso.
- **Duplicação**: rows, embeds do caixa e atualização de painel centralizados; varreduras em `ui-duplicacao.test.js` e `painel.test.js`.
- **Limites do Discord**: selects de categoria/itens ≤ 25 (teto de 25 itens por categoria e 6 categorias); ≤ 5 linhas de componentes; modal do ajuste `maxLength 4000`; títulos de modal ≤ 45; campos de embed ≤ 1024; descrições ≤ 4096 (resumo, histórico, logs, erros do ajuste); mensagem ≤ 2000 com anexo. Pendência: total de 6000 por embed (QA-D2).
- **Firestore 1 MB**: `bau/{tipo}` tem no máximo 6 × 25 = 150 chaves (dezenas de KB); `catalogo/items` idem; auditoria de `zerar('ambos')` tem ≤ 300 números. Sem risco.
- **Auditoria na mesma transação**: confirmado nas três operações; falha injetada em qualquer escrita desfaz tudo (testes de STK-013).
- **Ajuste em massa**: pendência única por id (8 hex, `MAX_PENDENTES = 50`), expira em 10 min, só o autor confirma ou cancela, consumida antes do `await`. Ver QA-D1 e QA-D3.
- **Migração legada de painéis**: sem id → busca uma vez nas 10 últimas, adota e grava; id de outro canal → migra; 10008 → recria e grava; outros erros não recriam (evita duplicar painel por erro transitório).

## 7. Testes novos do QA

| Arquivo | Conteúdo | Estado |
|---|---|---|
| `test/qa-e2e.test.js` | 10 fluxos de ponta a ponta pelo roteador real: baú (adicionar → categoria → item → modal → quantidade → ver estoque), remover até zerar, concorrência 6+6 e add/remove paralelos, caixa completo com histórico, ajuste em massa confirmado (intruso, auditoria, 2º clique), duplo clique simultâneo, remoção de item com ajuste pendente, cadastro com emoji/acento, zerar ambos | passa |
| `test/qa-adversarial.test.js` | 14 testes: todos os ids × DM/sem membro/sem cargo/cargo desconhecido/membro/gerente/dono, ids parecidos, quantidade e valor gigantes e unicode, nomes com emoji/zero-width/cirílico/1 MB, ajuste com 4000 caracteres de lixo, limites 4096/25 opções/5 linhas, painel de outro canal e apagado, limites exatos | passa |
| `test/qa-lint-higiene.test.js` | STK-023: ESLint 0/0, sem `eslint-disable`, regras não desligadas, `node --check` | passa |
| `test/qa-defeitos.test.js` | QA-D1, QA-D2, QA-D3 | **falha de propósito** até a correção; não apagar |

## 8. Mudanças de comportamento visíveis

Comparado com `origin/main` (`git show origin/main:<arquivo>`). Todas são intencionais e documentadas, salvo onde indicado.

| # | Mudança | Onde está documentado |
|---|---|---|
| 1 | Baú dos Membros passa a exigir o cargo de membro (antes qualquer pessoa usava) | README "Permissões por cargo"; ADR-05; STK-004 |
| 2 | Baú da Gerência passa a exigir gerente ou dono (antes qualquer pessoa) | README; ADR-05; arquitetura §7 risco 3 |
| 3 | Painel da Gerência (catálogo, zerar, logs, ajuste) passa a exigir gerente (antes sem checagem) | README; STK-005 |
| 4 | `/setup` e `/setup-caixa` passam a exigir gerente | README; ADR-05 (pergunta P3 em aberto) |
| 5 | Negação do caixa muda de "Apenas **Consejeros** e **El Diablo** podem usar o caixa" para "❌ Você não tem permissão para isso." | Contrato §4.4 `MENSAGENS` (não citado no README) |
| 6 | Uso em DM recebe "❌ Use este comando dentro do servidor." | README; §4.4 |
| 7 | Quantidade e valor estritos: `10abc`, `50.000`, `-50`, `1,5` passam a ser recusados (antes viravam 10, 50000, 50, 15) com mensagem explicando o formato | README "Limites de entrada"; ADR-04; P4 |
| 8 | Limites: 100 000 por movimentação de item, US$ 1 000 000 000 por operação de caixa; `maxLength` da quantidade 10 → 6 e do valor 15 → 10 | README; ADR-04; P1 |
| 9 | Ajuste em massa: agora pede confirmação (resumo antes/depois com Confirmar/Cancelar, 10 min, só o autor), é tudo-ou-nada (antes aplicava as linhas válidas e listava erros), recusa item ambíguo sem cabeçalho, separa no último `:`, resposta efêmera adiada; inventário grande vai como anexo `.txt`; baú vazio mostra um exemplo de formato (antes "Bau vazio.") | README "Ajuste em massa"; STK-015 |
| 10 | Cadastro de item: nome até 50 caracteres, espaços colapsados, duplicado ignorando caixa/acentos recusado, teto de 25 itens por categoria; id gerado muda para nomes com símbolos (ex.: `AK-47` → `ak_47`, antes `ak47`); itens já cadastrados não mudam | README "Limites"; STK-016 |
| 11 | Remover item do catálogo, zerar baú e ajuste gravam auditoria na coleção `auditoria` (sem tela) | README "Auditoria"; ADR-10; N2 |
| 12 | Painel da gerência volta sempre com as duas linhas de botões (antes sumia "Ajustar" após cadastrar/remover/zerar) | STK-018 critério 5 |
| 13 | Painéis de inventário e saldo: id guardado em `paineis/*`; mensagem apagada é recriada; não edita mais "a primeira mensagem do bot nas últimas 10" depois da migração | README "Painéis fixos"; ADR-07 |
| 14 | Ver Estoque e `/setup-caixa` voltam a funcionar (antes quebravam por falta de `await`) | STK-009, STK-010 |
| 15 | Item removido do catálogo: selecionar mostra "Item não encontrado" (antes a interação falhava) | STK-017 |
| 16 | Falhas internas viram mensagem efêmera genérica e o painel é restaurado (antes "A interação falhou" ou silêncio) | ADR-11; §4.5 |
| 17 | Listas longas truncadas com "… e mais N" (inventário por campo, histórico do caixa, logs, resumo do ajuste); título do modal de quantidade cortado em 45 | STK-010; §4.8 |
| 18 | Ver Logs com entrada sem item mostra "Item removido" (antes quebrava) | §4.8 `embedLogsBau` |
| 19 | Remover item/zerar: a confirmação aparece antes da atualização dos painéis de inventário (antes depois) | STK-020 (falha de painel não esconde sucesso) |
| 20 | Inicialização: o bot não sobe sem as 16 variáveis do Discord e as 4 `FIREBASE_*` (lista todas as ausentes); `start.js` não gera mais `config.json` | README "Configuração"; ADR-03/08; arquitetura §7 risco 2 |
| 21 | Fim dos logs `BUTTON RECEBIDO`/`NENHUM HANDLER` e da lista de ids no boot | STK-021 |
| 22 | README: licença MIT → ISC e `LICENSE` ISC adicionado | README; **não confirmado** pelo usuário (QA-O2, P5) |

## 9. Para a reentrega

1. backend-dev: QA-D1 (recusar `#` inicial em `validarNomeItem` ou acordo com frontend-dev no parser), QA-D6; com o architect, contrato de QA-D3.
2. frontend-dev: QA-D3 (pendência guarda o `antes`), QA-D2, QA-D4.
3. jira-manager: card novo para QA-D5 (dependências) e para N1/N2/N3 da arquitetura §8; confirmar P5 com o usuário (QA-O2).
4. Na reentrega o QA revalida tudo; `test/qa-defeitos.test.js` precisa passar sem alteração (pode ser ajustado só para aceitar uma correção equivalente).

VEREDITO: FAIL
