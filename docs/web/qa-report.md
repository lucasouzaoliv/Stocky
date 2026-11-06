# Stocky Web: relatório de QA (ciclo 2)

Autor: `qa-engineer` · 06/11/2026 · Branch `web/planejamento` (HEAD `49eb7b3`, correções do ciclo 1) · Escopo: WEB-001 a WEB-071 (WEB-067 cancelado).

Revalidação completa, não só do que foi corrigido. As contagens e afirmações do commit dos devs **não** foram usadas como evidência: tudo foi reexecutado do zero (`rm -rf node_modules .next`), as correções foram atacadas com mutações e com uma rodada adversarial nova.

Arquivos do QA neste ciclo (território `web/test/qa/**`, nenhum código de produção alterado, nada commitado):

| Arquivo | O que prova |
|---|---|
| `web/test/qa/ciclo2-adversarial.test.ts` (novo, 105 testes) | QA-W1 sem retorno antecipado (ids reservados na criação, nas rotas e em dados legados com `constructor`/`__proto__` próprios), QA-W5 na anotação e no **nome do item** (20 caracteres invisíveis), NFC/NFD, nomes quase iguais, emoji, entradas enormes, chaves extras, concorrência (zerar × adicionar, ajuste × ajuste, ajuste × adicionar, remover × zerar), sem sessão / adulterada, replay de CSRF, níveis nas rotas de dono |
| `web/test/qa/escape-html.test.ts` (novo, 2 testes, jsdom) | Nome com HTML aparece como texto no Baú e no Catálogo; mata a mutação N11 que a suíte dos devs deixou passar |
| `web/test/qa/{e2e-fluxos,rotas-adversariais,pos-commit,chave-prototipo,texto-invisivel}.test.ts` | Do ciclo 1, conferidos sem alteração pelos devs (diff idêntico à cópia do ciclo 1) |

Observação sobre o ciclo 1: os 4 testes de `chave-prototipo.test.ts` fazem `return` quando a criação de `constructor` é recusada, então hoje passam **sem afirmar nada**. A prova real de QA-W1 está agora em `ciclo2-adversarial.test.ts`.

---

## 1. Execução limpa (`web/`)

| Comando | Resultado |
|---|---|
| `rm -rf node_modules .next && npm ci` | exit 0 |
| `npm run lint` | exit 0, zero erros e zero avisos (inclui os testes novos do QA) |
| `npm run typecheck` | exit 0 |
| `npm test` (estado entregue pelos devs) | 78 arquivos, **1454 testes, todos passando** (inclui `build.test.ts`, que faz build e `next start` reais) |
| `npm test` (com os testes novos do QA) | 80 arquivos, 1561 testes: **1516 passam, 45 falham**, todos em `qa/ciclo2-adversarial.test.ts` (QA-W10 e QA-W5) |
| `sessao.test.ts` "um byte alterado" repetido 30× | **3 falhas em 30** → teste intermitente (QA-W11) |
| `npm run build` com `env -i` (nenhuma variável) | exit 0; nenhuma linha `warn`/`Failed`/`error` |
| `npm run verificar:bundle` | exit 0, `Bundle limpo: 22 arquivos` |
| `npm run verificar:build` | exit 0: build limpo, `/login` 200, `/api/caixa` 401, cabeçalhos conferidos, servidor encerrado (nenhum `next-server` sobrou) |
| `npm audit --omit=dev --audit-level=high` | exit 0; 6 moderadas, nenhuma alta/crítica |
| `npm audit fix --package-lock-only` numa cópia | **lockfile idêntico**: confirma a afirmação dos devs de que o fix "disponível" não muda nada (QA-W6) |
| `.only/.skip/.todo/xit/xdescribe/fit`, `eslint-disable`, `@ts-ignore/@ts-nocheck/@ts-expect-error`, `dangerouslySetInnerHTML`, `"use server"` em `src`, `test`, `scripts` | nenhum (só as amostras dos próprios detectores) |

## 2. Itens do ciclo 1, um a um

| Item | Situação | Evidência |
|---|---|---|
| **QA-W1** ids reservados | **Corrigido** | `item.ts:35` (`IDS_RESERVADOS` = nomes de `Object.prototype` + `prototype`), `ehIdSeguro` recusa; `refs.ts:50-57` (`mapaDaCategoria`/`quantidadeNoBau` com `Object.hasOwn`) em todas as leituras de `operacoes.ts`, `ajuste.ts`, `leitura.ts`, `catalogo/operacoes.ts`. QA: criar `Constructor`, ` CONSTRUCTOR `, `constructor!!`, `Prototype`, `#constructor` → 400 com catálogo intacto; `toString`/`hasOwnProperty`/`valueOf` viram `tostring`… e funcionam; `constructor`, `__proto__`, `prototype`, `hasOwnProperty`, `toString` como `itemId`/`categoriaId` em adicionar/remover/prévia → 400, nada gravado. Dados legados (`constructor: 2` no baú e no catálogo, `__proto__` como chave **própria** vinda de JSON): leitura mostra 2, ignora `__proto__`, nenhum protótipo poluído; adicionar `colt` preserva `constructor`; ajuste de `colt` preserva; `DELETE` do dono → 200, `removidoDe {membros:2, gerencia:7}`, logs numéricos; zerar limpa. Mutações N18/N19 mortas |
| **QA-W2** WEB-069 AC1/3/4 | **Corrigido** | `scripts/verificar-build.mjs` + `test/server/build.test.ts` (varredor da saída, cabeçalhos, e **build e `next start` reais** dentro da suíte); passo no CI (`.github/workflows/web.yml`). Reexecutado: passa |
| **QA-W3** texto do WEB-029 AC3 | **Corrigido** | `docs/web/backlog.md` AC3 agora lista `"10abc"`, `"1,5"`, `"1e3"` e cita ADR-14 para `"5"` |
| **QA-W4** commit falho na tx da semente | **Corrigido** | `test/server/commit-falho.ts` (`falharCommitDaOperacao` roda a semente antes e exige escrita da operação), usado nos testes de commit falho. Mutação refeita (N21: `publicarEventos` dentro da tx do baú) rodando **só os testes dos devs** (`--exclude test/qa/**`): **3 testes dos devs falham**, incluindo os dois de WEB-051 AC4 |
| **QA-W5** invisíveis na anotação | **Parcial** | `texto.ts:7` remove `\p{Cc}\p{Cf}`: ZWSP, ZWNJ, ZWJ, WJ, LRM, RLM, RLO, BOM, soft hyphen, tags, MVS, invisible times → 400. **Ainda passam como anotação "preenchida"**: variation selectors (U+FE00–FE0F, U+E0100…, categoria Mn), combining grapheme joiner (U+034F), hangul filler (U+3164, U+FFA0) e braille blank (U+2800): 7 testes falhando. **No nome do item nada foi feito** → QA-W10 |
| **QA-W6** moderadas | **Risco aceito, justificado** | `web/README.md` "Riscos aceitos": correção exige `google-gax` 6 (major) que o `firebase-admin` fixado não aceita; site não chama glob com entrada do usuário. Afirmação conferida (lockfile não muda) |
| **QA-W7** 307 nas páginas protegidas | **Corrigido** | `loading.tsx` movido para dentro de `(protegido)/`; guarda no `(protegido)/layout.tsx`. Servidor real: `/caixa`, `/painel`, `/bau/membros`, `/bau/gerencia`, `/logs`, `/auditoria`, `/ajuste/membros` sem sessão → **307 `Location: /login`**; sessão adulterada → 307; `/login` logado → 307 para `/`. Teste dos devs (`test/ui/redirect-servidor.test.ts`) é estrutural; o 307 real só foi provado por este QA (QA-W14, baixa) |
| **QA-W8** state sem uso único | **Risco aceito, justificado** | `web/README.md` "Riscos aceitos": JWT de 10 min, `httpOnly`, `Path=/api/auth`, sempre apagado no callback; o `code` do Discord é de uso único; gravar o uso custaria uma escrita por login. Aceito |

## 3. Servidor de produção real (`next start -p 3999`, `envFalso()`, `NODE_ENV=production`)

| Verificação (curl) | Resultado |
|---|---|
| `GET /login` | 200; CSP com nonce e `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy`; HSTS 2 anos; `Permissions-Policy`; COOP; sem `X-Powered-By`; `Cache-Control: private, no-store` |
| Páginas protegidas sem sessão / sessão adulterada | **307 → `/login`** (todas as 7) |
| `/` sem sessão | 200: página estática de entrada, sem nenhum dado (inalterada desde a onda 1) |
| `/login` com sessão | 307 → `/` |
| `GET /api/caixa`, `/api/bau/membros`, `/api/auditoria`, `/api/catalogo`, `/api/csrf` sem sessão | **401** `SEM_SESSAO` |
| `POST /api/bau/membros/adicionar` sem sessão | 401 |
| Sessão forjada nível 1 em `/api/caixa` | 403; `/caixa` nível 1 → página "sem permissão" |
| Nível 1: sem token / token de **outra** sessão / token certo com Origin `https://evil.com` | 403 / **403** / 403 |
| Nível 2: `DELETE /api/catalogo/itens/armas/colt` e `POST /api/bau/zerar` (CSRF certo) | 403 nos dois |
| `GET /api/auth/login?volta=@evil.com` e `//evil.com` | cookie `stocky_oauth` com `volta:"/"`, `HttpOnly`; `Location` só `discord.com/oauth2/authorize` com `redirect_uri` da `APP_URL` |
| Encerramento | `kill -TERM` no grupo do PID 26446; porta 3999 fechada; nenhum `next-server` na lista de processos (o `next start -p 3112` antigo do ciclo 1 também não existe mais) |

## 4. Mutações do ciclo 2 (todas diferentes das 30 do ciclo 1)

Clone local da branch em `scratchpad/mut2` (com `.git`), `node_modules` por link, `build.test.ts` excluído (faz build real, coberto em §1). Linha de base no clone: 46 falhas conhecidas (45 do QA-W10/W5 + `segredos.test.ts`, que não lê o link de `node_modules`). "Novas" = falhas além da linha de base. **25 mutações, 25 mortas** (N11 só pelo teste novo do QA).

| # | Mutação | Novas | Exemplo de teste que pegou |
|---|---|---|---|
| N01 | `DELETE` do catálogo nível 2 **só na rota** (serviço intacto) | 1 | `cobertura-rotas` manifesto × §6 (o serviço ainda dá 403: defesa em profundidade) |
| N02 | baú da gerência exige nível 1 | 13 | `autorizacao` AC3, `cobertura-rotas` AC3 cinco perfis, e2e AC1 |
| N03 | CSRF: checagem de `Origin` removida | 18 | QA Origin `null`/barra/sufixo/http |
| N04 | CSRF: `Sec-Fetch-Site` ignorado | 4 | `csrf` AC2, `logout` |
| N05 | CSRF: `Content-Type` não exigido | 8 | `csrf` AC3 (415) |
| N06 | versão do ajuste conferida **fora** da transação (TOCTOU) | 4 | `ajuste-confirmar` AC1/AC4 (10 confirmações simultâneas) |
| N07 | log do caixa gravado fora da transação | 12 | `caixa-operacoes` AC1/AC5 |
| N08 | auditoria do zerar gravada fora da transação | 10 | `bau-zerar` AC1, e2e AC6 |
| N09 | remover do baú permite ficar −1 (off-by-one) | 2 | `bau-remover`, `rotas-bau` AC3 |
| N10 | `escaparMarkdown` vira identidade | 11 | `webhook-embeds`, `webhook-inventario` AC6, QA menções |
| N11 | nome do item com `dangerouslySetInnerHTML` no `Bau.tsx` | 0 dos devs (*) | **só** `qa/escape-html.test.ts` → QA-W12 |
| N12 | limite de 25 itens vira 26 | 4 | `catalogo-adicionar` AC4/AC5, e2e AC4 |
| N13 | `volta` aceita qualquer texto (`@evil.com` → `https://app@evil.com`) | 13 | QA open redirect |
| N14 | cookie do state OAuth sem `HttpOnly` | 2 | `oauth-login` AC3 |
| N15 | cookie de sessão sem `Secure` em produção | 2 | `sessao` AC1 |
| N16 | rate limit desligado | 5 | `limite` AC1–AC5 |
| N17 | revalidação de cargos desligada | 5 | `revalidacao` AC1, `pagina`, e2e AC8 |
| N18 | `quantidadeNoBau` sem `hasOwn` no item (regressão W1) | 2 | `chave-prototipo` (devs) |
| N19 | `ehIdReservado` sempre falso (regressão W1) | 12 | `qa/ciclo2` ids reservados |
| N20 | anotação volta a remover só `\p{Cc}` (regressão W5) | 18 | `qa/ciclo2` LRM/RLM/RLO… |
| N21 | `publicarEventos` dentro da tx do baú (W4), **só testes dos devs** | 3 | `efeitos-pos-transacao` WEB-051 AC4 ×2 |
| N22 | webhook sem `allowed_mentions` | 12 | `efeitos-pos-transacao` AC1, e2e AC2 |
| N23 | saída do caixa permite −1 | 3 | `caixa-operacoes`, `rotas-caixa` AC3 |
| N24 | zerar não incrementa a versão | 9 | `ajuste-confirmar` AC7, `bau-zerar` |
| N25 | sessão expirada aceita (tolerância de 1 ano) | 3 | `sessao` AC2 expirado, QA expirado |

(*) Na rodada geral, N11 apareceu com "1 nova", mas era o teste intermitente `sessao.test.ts` "um byte alterado" (QA-W11), sem relação com a mutação. Refeita com `qa/escape-html.test.ts`: morta.

## 5. Rodada adversarial nova (resultado)

| Ataque | Resultado |
|---|---|
| NFC × NFD (`Munição Pesada`), `MUNICAO-PESADA` | segundo e terceiro → 409 ✔ |
| Quase iguais: `colt`, ` COLT `, `Colt!`, `Colt.`, `🔫 Colt`, `Colt 🔫`, `Ćolt`, `Ｃolt` (NFKC) | 409 ✔ |
| Sem letra/número: `🔫`, `!!!`, só acentos combinantes, 50 emojis | 400 ✔ |
| 50 caracteres com emoji aceito; 51 recusado (contagem por código, não UTF-16) | ✔ |
| Nome de 9 KB → 400; corpo de 11 KB → 413; nada gravado | ✔ |
| Chave extra, `__proto__` próprio, `constructor` no corpo; `usuario` extra no movimento; `saldo` extra no caixa | 400, protótipo intacto ✔ |
| 201 linhas no ajuste → 400; 200 linhas repetidas → 400 com 199 detalhes | ✔ |
| Zerar × adicionar (5 rodadas) | sempre `{}` ou só `+3`, versão 2 ✔ |
| Ajuste × ajuste mesma versão | `[200, 409 VERSAO_DESATUALIZADA]`, versão +1 ✔ |
| Ajuste × adicionar (5 rodadas) | ou ajuste 200 e final 53, ou 409 e final 13 ✔ |
| Remover tudo × zerar | `{}`, nunca negativo/`NaN` ✔ |
| Sem sessão e sessão adulterada nas 7 mutações | 401, `dump` idêntico ✔ |
| Replay de CSRF com token de outra sessão | 403 ✔; mesmo token na mesma sessão continua válido (ADR-06, por sessão) |
| Nível 1 ajusta / cria item; nível 2 zera / remove do catálogo | 403, nada gravado ✔ |
| **Invisíveis no nome do item** | **Aceitos e gravados** → QA-W10 |
| **Mn/Lo invisíveis na anotação** | **Aceitos** → QA-W5 (parcial) |

## 6. Varredura de segredos

- HEAD (`git grep` de PEM, `private_key_id`, `AIza…`, token do Discord, webhook com token, `sk_live_`, `ghp_`, `github_pat_`, `AKIA…`, `iam.gserviceaccount.com`): só documentação, valores falsos (`troque-aqui@exemplo…`, marcador do `verificar-bundle`) e amostras dos testes de varredura. **Limpo.**
- Commits do site (`679b8ef^..web/planejamento`, 17 commits), diff completo: **nenhum segredo**; atribuições de `SESSION_SECRET`/`FIREBASE_PRIVATE_KEY`/etc. só com valores falsos.
- Histórico completo da branch (inclui a história do bot herdada de `main`): **chave privada real do Firebase e `client_email` do projeto `stocky-bot-5a9f8` em `utils/firebase.js` do commit `74513cc`** (primeiro commit do repositório), removidos em `a433f04`. É pré-existente, fora do código do site e já registrado no backlog do bot (`docs/backlog.md:79`, "a chave … deve ser rotacionada pelo usuário"). Não é defeito dos cards WEB, mas continua publicada no histórico: **o usuário precisa confirmar que essa chave foi revogada no Google Cloud**.
- `git ls-files`: nenhum `node_modules/`, `.next/`, `.env`, `.env.local`, `config.json`, `.pem`.

## 7. Defeitos

| # | Severidade | Dono | Card(s) | Situação |
|---|---|---|---|---|
| QA-W10 | **Média** | backend-dev | WEB-009 (AC4), WEB-035 (AC3); efeito em 047/048/057/060 | **Novo**, 38 testes falhando |
| QA-W11 | **Média** | backend-dev | WEB-015 (AC2) | **Novo**, teste intermitente (3/30) |
| QA-W5 | Baixa | backend-dev | WEB-033 (AC4) | Reaberto (parcial), 7 testes falhando |
| QA-W12 | Baixa | frontend-dev | WEB-057, WEB-060 | Novo; coberto pelo teste do QA |
| QA-W13 | Baixa (observação) | architect | WEB-021 | Novo |
| QA-W14 | Baixa (observação) | backend-dev | WEB-054 / WEB-069 | Novo |
| QA-W1, W2, W3, W4, W7 | — | — | — | Corrigidos e revalidados |
| QA-W6, W8 | — | — | — | Riscos aceitos, documentados no README e conferidos |

### QA-W10 (Média): nome do item aceita e grava caracteres invisíveis, de controle e de direção; o detector de duplicado é contornado
- **Onde:** `web/src/server/validacao/item.ts:20` (`validarNomeItem` só faz `trim` e colapsa `\s`; não remove `\p{Cc}`, `\p{Cf}`, seletores de variação nem "fillers"). O id é gerado do nome com invisíveis (`gerarIdItem`, `item.ts:4-13`), então `Co​lt` gera `co_lt`, diferente de `colt`.
- **Efeito:** (a) um gerente cria um **segundo "Colt" visualmente idêntico** ao existente com ZWSP, ZWNJ, ZWJ, WJ, LRM, RLM, RLO, soft hyphen, VS16/VS1, tags, MVS, invisible times, hangul filler ou braille blank no meio: 18 dos 20 casos são aceitos com 201 (só BOM, que vira espaço, e CGJ, que é removido junto com os acentos, não passam). Isso derruba o objetivo de WEB-035 AC3 / WEB-009 AC4 (nomes equivalentes → mesmo id → duplicado recusado): membros passam a depositar e retirar em itens diferentes que parecem o mesmo, e os logs e o inventário ficam ambíguos; (b) o nome é gravado com o caractere (19 casos) e vai cru para a UI e para os embeds do Discord (`webhooks/movimentacao.ts:11,25`, `inventario-embeds.ts:90`; `escaparMarkdown` não remove direção). Com RLO (U+202E) o restante da linha do embed (`nome: **quantidade**`) é exibido invertido, então a quantidade mostrada no inventário pode ser falsificada visualmente; (c) BEL/ESC/DEL também são gravados no nome.
- **Reproduzir:** `cd web && npx vitest run test/qa/ciclo2-adversarial.test.ts -t "nome do item"` (38 falhas). À mão: gerente `POST /api/catalogo/itens {"categoriaId":"armas","nome":"Co​lt"}` → 201 `{"id":"co_lt","nome":"Co​lt"}`.
- **Correção sugerida:** no `validarNomeItem`, remover (ou recusar) `\p{Cc}`, `\p{Cf}`, U+034F, U+FE00–FE0F, U+E0100–E01EF, U+115F/U+1160/U+3164/U+FFA0 e U+2800 **antes** de gerar o id, e reaproveitar a mesma limpeza em `normalizarAnotacao`. Os testes do QA aceitam tanto "limpar e gravar sem o caractere" quanto "recusar com 400".

### QA-W11 (Média): teste de assinatura adulterada é intermitente
- **Onde:** `web/test/server/sessao.test.ts:71` troca só o **último** caractere base64url da assinatura/payload (`'A'↔'B'`). Os 2 bits finais do último caractere são de preenchimento: `…A` e `…B` decodificam para os mesmos bytes (`Buffer.from(x+'A','base64url').equals(Buffer.from(x+'B','base64url')) === true`), então a assinatura "adulterada" continua válida e o teste falha.
- **Efeito:** `npm test` (e o CI) falha aleatoriamente em cerca de 1 a cada 10 execuções (3/30 medido); DoD item 2 ("todos os testes passando") não se cumpre de forma confiável. O código de produção está correto (a mutação N25 e os testes do QA provam a rejeição).
- **Reproduzir:** `for i in $(seq 30); do npx vitest run test/server/sessao.test.ts -t "byte alterado" >/dev/null || echo falhou; done`.
- **Correção:** trocar um caractere do **meio** (ou vários caracteres, como `test/helpers/pedidos.ts` faz com os 3 últimos), ou decodificar, alterar um byte e recodificar.

### QA-W5 (Baixa, reaberto parcial): anotação só com invisíveis que não são `Cf`
- **Onde:** `web/src/server/validacao/texto.ts:7`. Variation selectors e CGJ são `Mn`; hangul filler é `Lo`; braille blank é `So`.
- **Reproduzir:** `npx vitest run test/qa/ciclo2-adversarial.test.ts -t "anotação só com"` (7 falhas); `POST /api/caixa/movimentar` com `"anotacao":"️"` → 200.
- **Correção:** a mesma lista de QA-W10.

### QA-W12 (Baixa): nenhum teste dos devs pega nome renderizado como HTML
- A mutação N11 (`dangerouslySetInnerHTML={{ __html: i.nome }}` em `web/src/components/Bau.tsx:188`) passou em toda a suíte dos devs (nenhum teste de UI nem de higiene a detecta). Hoje o código está correto e o teste do QA (`test/qa/escape-html.test.ts`) cobre Baú e Catálogo. Sugestão: o frontend-dev incorporar um caso equivalente em `test/ui/bau.test.tsx`/`painel-catalogo.test.tsx`.

### QA-W13 (Baixa, observação): logout não revoga a sessão no servidor
- `POST /api/auth/logout` (`web/src/app/api/auth/logout/route.ts:9`) só apaga o cookie; o JWT é sem estado (ADR), então um cookie copiado antes do logout continua válido até `exp` (até 7 dias), limitado pela revalidação de cargos a cada 15 min. Coerente com o contrato (WEB-021 AC1/AC2 falam do navegador), mas não está na seção "Riscos aceitos" do README. Decisão do architect: documentar como risco aceito ou guardar `sid` revogados.

### QA-W14 (Baixa, observação): o 307 das páginas protegidas não tem teste com servidor real
- `test/ui/redirect-servidor.test.ts` só confere a posição do `loading.tsx`. `verificar-build.mjs` confere `/login` e `/api/caixa`, mas não `GET /caixa` sem sessão → 307 `/login`. Hoje está correto (§3). Sugestão: acrescentar essa checagem em `verificarServidor`.

## 8. Status por card

Critério "PASS" = todo critério de aceite com teste que o prova (dos devs ou do QA), execução revalidada e nenhum defeito médio ou maior aberto, nem teste falhando, no card.

| Card | Status | Evidência principal |
|---|---|---|
| WEB-001 | PASS | `smoke.test.ts`; build exit 0 |
| WEB-002 | PASS | `higiene.test.ts`; lint/typecheck exit 0 |
| WEB-003 | PASS | `smoke.test.ts`, `ui/smoke.test.tsx` |
| WEB-004 | PASS | `segredos.test.ts`; varredura §6 (site limpo) |
| WEB-005 | PASS | `env.test.ts` |
| WEB-006 | PASS | `erros.test.ts` |
| WEB-007 | PASS | `ci.test.ts`; `web.yml` com `verificar:build` |
| WEB-008 | PASS | `validacao-numero.test.ts`; N09/N23 mortas |
| WEB-009 | **FAIL** | QA-W10 (AC4: nomes visualmente equivalentes geram ids diferentes); AC3 (ids reservados) agora PASS |
| WEB-010 | PASS | `firebase.test.ts` |
| WEB-011 | PASS | `fake-firestore.test.ts`; QA-W4 corrigido (`commit-falho.ts`) |
| WEB-012 | PASS | `regras.test.ts` |
| WEB-013 | PASS | `dominio.test.ts`; `refs.ts` com `hasOwn` |
| WEB-014 | PASS | `semente.test.ts` |
| WEB-015 | **FAIL** | QA-W11 (teste de AC2 intermitente); comportamento correto (N15/N25 mortas) |
| WEB-016 | PASS | `oauth-login.test.ts`; N14 morta |
| WEB-017 | PASS | `discord-api.test.ts` |
| WEB-018 | PASS | `niveis.test.ts` |
| WEB-019 | PASS | `oauth-callback.test.ts`; N13 morta; QA-W8 aceito e documentado |
| WEB-020 | PASS | `revalidacao.test.ts`, `pagina.test.ts`; N17 morta |
| WEB-021 | PASS (obs. QA-W13) | `logout.test.ts` |
| WEB-022 | PASS | `autorizacao.test.ts`; N02 morta |
| WEB-023 | PASS | `csrf.test.ts`; N03/N04/N05 mortas; replay recusado (QA e servidor real) |
| WEB-024 | PASS | `limite.test.ts`; N16 morta |
| WEB-025 | PASS | `cabecalhos.test.ts`; servidor real §3 |
| WEB-026 | PASS | `cobertura-rotas.test.ts` + QA; N01 morta |
| WEB-027 | PASS | `bundle-sem-segredos.test.ts`; `verificar:bundle` |
| WEB-028 | PASS | `bau-leitura.test.ts`; QA leitura com dados legados |
| WEB-029 | PASS | `bau-adicionar.test.ts`; QA-W1 e QA-W3 corrigidos |
| WEB-030 | PASS | `bau-remover.test.ts`; QA-W1 corrigido; N09 morta |
| WEB-031 | PASS | `rotas-bau.test.ts` |
| WEB-032 | PASS | `caixa-leitura.test.ts` |
| WEB-033 | **FAIL** | QA-W5 parcial (AC4, 7 testes falhando) |
| WEB-034 | PASS | `rotas-caixa.test.ts` |
| WEB-035 | **FAIL** | QA-W10 (AC3: duplicado contornado com invisíveis); N12 morta |
| WEB-036 | PASS | `catalogo-remover.test.ts`; QA legado `constructor` removível |
| WEB-037 | PASS | `rotas-catalogo.test.ts` |
| WEB-038 | PASS | `bau-zerar.test.ts`; N08/N24 mortas |
| WEB-039 | PASS | `rotas-zerar.test.ts` |
| WEB-040 | PASS | `ajuste-previa`; QA-W1 corrigido |
| WEB-041 | PASS | `ajuste-confirmar.test.ts`; N06 morta; QA ajuste × ajuste |
| WEB-042 | PASS | `rotas-ajuste.test.ts` |
| WEB-043 | PASS | `logs-leitura.test.ts` |
| WEB-044 | PASS | `auditoria-leitura.test.ts` |
| WEB-045 | PASS | `rotas-logs.test.ts` |
| WEB-046 | PASS | `webhook-cliente.test.ts`; N22 morta |
| WEB-047 | PASS (afetado por QA-W10) | `webhook-movimentacao.test.ts`; N10 morta |
| WEB-048 | PASS (afetado por QA-W10) | `webhook-embeds.test.ts` |
| WEB-049 | PASS | `webhook-inventario.test.ts` |
| WEB-050 | PASS | `webhook-saldo.test.ts` |
| WEB-051 | PASS | `efeitos-pos-transacao.test.ts` agora pega N21 sozinho |
| WEB-052 | PASS | `ui/api-cliente.test.ts` |
| WEB-053 | PASS | `ui/navegacao.test.tsx`, `ui/layout.test.tsx` |
| WEB-054 | PASS (obs. QA-W14) | `ui/guardas.test.tsx`, `ui/redirect-servidor.test.ts`; 307 real §3 |
| WEB-055 | PASS | `ui/login.test.tsx`; `/login` logado → 307 real |
| WEB-056 | PASS | `ui/estados.test.tsx` |
| WEB-057 | PASS (obs. QA-W12) | `ui/bau.test.tsx` + `qa/escape-html.test.ts` |
| WEB-058 | PASS | `ui/paginas-bau.test.tsx` |
| WEB-059 | PASS | `ui/caixa.test.tsx` |
| WEB-060 | PASS (obs. QA-W12) | `ui/painel-catalogo.test.tsx` + `qa/escape-html.test.ts` |
| WEB-061 | PASS | `ui/zerar-bau.test.tsx` |
| WEB-062 | PASS | `ui/ajuste.test.tsx` |
| WEB-063 | PASS | `ui/logs.test.tsx` |
| WEB-064 | PASS | `ui/auditoria.test.tsx` |
| WEB-065 | PASS | `ui/a11y.test.tsx` |
| WEB-066 | PASS | `qa/e2e-fluxos.test.ts` (10 passando) |
| WEB-067 | Cancelado | Q12 |
| WEB-068 | PASS | `env-documentada.test.ts` |
| WEB-069 | PASS | `build.test.ts` (build e servidor reais), `verificar:build` exit 0 |
| WEB-070 | PASS | `env-documentada.test.ts` "README"; riscos aceitos documentados |
| WEB-071 | PASS | audit sem alta/crítica; QA-W6 aceito e conferido |

## 9. O que precisa acontecer para o PASS (ciclo 3, o último antes de levar ao usuário)

1. **backend-dev:** QA-W10 e QA-W5 com uma limpeza única de invisíveis/controle/direção usada por `validarNomeItem` (antes do id) e por `normalizarAnotacao`, até `test/qa/ciclo2-adversarial.test.ts` passar inteiro; QA-W11 (teste de byte alterado determinístico); opcional QA-W14.
2. **frontend-dev:** opcional QA-W12 (teste de escape nos próprios testes de UI).
3. **architect:** decidir QA-W13 (documentar ou revogar `sid`).
4. **Usuário:** confirmar a revogação da chave do Firebase que está no commit `74513cc` (pré-existente, fora do site).
5. Na reentrega o QA revalida tudo de novo.

VEREDITO: FAIL
