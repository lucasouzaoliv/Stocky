# Stocky Web: relatório de QA

Autor: `qa-engineer` · 06/11/2026 · Branch `web/planejamento` (HEAD `474bade`, onda 7) · Escopo: WEB-001 a WEB-071 (WEB-067 cancelado).

Fontes: `docs/web/backlog.md`, `docs/web/architecture.md` (contrato, §6 matriz, §9 prova), `docs/web/requisitos.md`, `docs/qa-report.md` do bot (D1 a D6), código em `web/`. Os relatórios e as contagens dos devs **não** foram usados como evidência: tudo foi reexecutado.

Arquivos do QA criados nesta rodada (território `web/test/qa/**`, nenhum código de produção alterado, nada commitado):

| Arquivo | O que prova |
|---|---|
| `web/test/qa/e2e-fluxos.test.ts` | WEB-066 AC1 a AC8 (10 testes, handlers reais, OAuth e webhooks falsos, banco vazio com semente real) |
| `web/test/qa/rotas-adversariais.test.ts` | WEB-026 (parte do QA) e revisão adversarial (71 testes): sessão forjada, CSRF, open redirect, corpo hostil, `__proto__`, unicode, tamanho, concorrência, segredos em log, atributos do cookie |
| `web/test/qa/pos-commit.test.ts` | WEB-051 AC4 e "tudo ou nada": falha de commit na transação **do domínio** (7 testes) |
| `web/test/qa/chave-prototipo.test.ts` | Defeito QA-W1 (falha de propósito até a correção) |
| `web/test/qa/texto-invisivel.test.ts` | Defeito QA-W5 (falha de propósito até a correção) |

---

## 1. Execução limpa (`web/`)

| Comando | Resultado |
|---|---|
| `rm -rf node_modules .next && npm ci` | exit 0; 581 pacotes; 3 avisos `deprecated` (node-domexception, glob@10, eslint@9) |
| `npm run lint` (`eslint . --max-warnings=0`) | exit 0, zero erros, zero avisos (inclui `test/qa`) |
| `npm run typecheck` (`tsc --noEmit`) | exit 0 |
| `npm test` (antes dos testes do QA) | **70 arquivos, 1336 testes, todos passando** |
| `npm test` (com `test/qa`) | **75 arquivos, 1433 testes: 1425 passam, 8 falham** (os 8 são os testes de defeito QA-W1 e QA-W5, de propósito) |
| `npm run build` (sem nenhuma variável de ambiente) | exit 0; todas as rotas e páginas `ƒ (Dynamic)`; nenhuma linha `warn`/`Failed`/`error` na saída |
| `npm run verificar:bundle` | exit 0: `Bundle limpo: 22 arquivos em .next/static sem nenhum segredo.` |
| `npm audit --omit=dev --audit-level=high` | exit 0; **6 moderadas** (glob/minimatch via `@google-cloud/firestore-api` → gaxios/rimraf/google-gax), nenhuma alta/crítica |
| `npm audit` (com dev) | exit 0 no nível high; 13 moderadas (as 6 acima + cadeia `@typescript-eslint` → `eslint-config-next`) |
| `.only/.skip/.todo/xit/xdescribe/fit` em `web/test` e `web/src` | nenhum (só as amostras do próprio detector em `higiene.test.ts`) |
| `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` | nenhum |
| `"use server"`, `dangerouslySetInnerHTML` em `web/src` | nenhum |

### Justificativa das moderadas (WEB-071 AC3)
- Produção: `glob` 9–14 / `minimatch` 7–11 (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249) só entram por `rimraf` dentro de `gaxios`/`google-gax` do `firebase-admin`; o site nunca chama glob com entrada do usuário. Risco real baixo. **Porém o `npm audit` informa "fix available via `npm audit fix`" (sem quebra) e não foi aplicado** → QA-W6 (baixa).
- Desenvolvimento: cadeia do `eslint-config-next` 16 (correção só rebaixando para 15, quebra); não vai para produção. Aceita.

## 2. Servidor de produção real (`npm run build && npm run start` com `envFalso()`)

Subido por `node_modules/next/dist/bin/next start -p 3999` com `envFalso()` de `scripts/verificar-bundle.mjs` e `NODE_ENV=production`; PID 30755 encerrado com `kill` ao fim (confirmado fora da lista de processos).

| Verificação (curl) | Resultado |
|---|---|
| `GET /login` | **200**; CSP `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://discord.com; frame-ancestors 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy strict-origin-when-cross-origin`; HSTS 2 anos; `Permissions-Policy`; COOP `same-origin`; sem `X-Powered-By` |
| `GET /api/caixa` sem sessão | **401** `{"ok":false,"erro":"Entre com o Discord para continuar.","codigo":"SEM_SESSAO"}`, `Cache-Control: no-store`, mesmos cabeçalhos de segurança |
| `GET /api/auth/logout` | 405 |
| `GET /api/auth/login?volta=https://evil.com` e `//evil.com` | 307 para `discord.com/oauth2/authorize` com `redirect_uri=https://stocky-verificacao.vercel.app/api/auth/callback`, `prompt=none`; cookie `stocky_oauth` `Path=/api/auth; Max-Age=600; HttpOnly; SameSite=Lax; Secure` com `volta:"/"` |
| `GET /api/auth/callback?code=x&state=y` sem cookie | 307 `…/login?erro=state`, cookie de state apagado |
| Sessão forjada com o segredo falso (nível 1) em `/api/caixa`, `/api/bau/gerencia` | 403 `SEM_PERMISSAO` |
| Nível 2 em `POST /api/bau/zerar` e `DELETE /api/catalogo/itens/armas/colt` (CSRF certo) | **403** nos dois (decisão do usuário respeitada) |
| Nível 1 mutação sem token / Origin `https://evil.com` / `text/plain` | 403 `CSRF` / 403 `CSRF` / 415 |
| Nível 2 `GET /api/caixa` com Firestore falso inalcançável | 500 genérico "Ocorreu um erro…", sem detalhe |
| Cookie sem o prefixo `__Host-` em produção | 401 (o nome de dev não é aceito) |
| Nome `<img src=x onerror=alert(1)>` na sessão em `/logs` | só aparece escapado no payload RSC (`<img…`), nunca como HTML |
| `/caixa` e `/` sem sessão; `/login` logado | **200** com `NEXT_REDIRECT` + `<meta http-equiv="refresh" content="1;url=/login">`, sem nenhum dado → QA-W7 (baixa) |

Observação: há um `next start -p 3112` de 05/11 (PID 27171) rodando no ambiente, que não foi iniciado por este QA; não foi encerrado.

## 3. Varredura de segredos e arquivos versionados

- `git grep -nE "BEGIN (RSA |EC )?PRIVATE KEY|private_key_id|AIza…|xox[bp]-|token do Discord|discord(app)?.com/api/webhooks/<id>/<token de 30+>|sk_live_|ghp_…" HEAD` e o mesmo em **cada commit** de `679b8ef^..web/planejamento`: só ocorrências benignas (documentação, regex dos próprios testes, `utils/firebase.js` do bot com `credencial.privateKeyId`, `id-falso-0000` em teste do bot).
- Busca extra por `iam.gserviceaccount.com`, webhook com token de 20+ e `SESSION_SECRET=`/`CLIENT_SECRET=` com valor: só valores falsos (`troque-aqui`, `exemplo`, `SEGREDO-FALSO-123`, `111111111111111111/troque-aqui-…`).
- `git ls-files | grep -c node_modules/` = **0**; nenhum `.next/`, `.env`, `.env.local`, `.env*.local`, `config.json`. `tsconfig.tsbuildinfo` está ignorado (`web/.gitignore:9`). Árvore limpa exceto `web/test/qa/` (não commitado, conforme instrução).
- `web/.env.example`: só valores falsos; `FIREBASE_PRIVATE_KEY_ID` ausente.
- **Resultado: nenhum segredo.**

## 4. Mutações (cópia fora do repositório)

Cópia em `/tmp/claude-0/…/scratchpad/mut/stocky` (sem `.git`, `node_modules` por link). Linha de base na cópia: 6 falhas conhecidas (4 de QA-W1 e 2 de `segredos.test.ts`, que precisa de `.git`). "Novas" = falhas além da linha de base. **30 mutações reais; 29 mortas, 1 inválida refeita e morta.**

| # | Mutação | Falhas novas (exemplo de teste que pegou) |
|---|---|---|
| M01 | tirar `if (sessao.nivel < exigido)` de `comAutorizacao` | 36 (`autorizacao.test.ts` AC1/AC2, `e2e-fluxos` AC1/AC8) |
| M02 | `POST /api/bau/zerar` declarado nível 2 (serviço intacto) | 2 (`cobertura-rotas` AC3 "nível 3") |
| M03 | zerar nível 2 na rota **e** sem checagem no serviço | 8 (`e2e-fluxos` AC6, `bau-zerar` "exclusiva do dono") |
| M04 | remover item do catálogo nível 2 na rota e sem checagem no serviço | 7 |
| M05 | baú adicionar/remover sem transação | 45 |
| M06 | caixa sem transação | 20 (`caixa-operacoes` AC1 paralelas, QA 20 saídas paralelas) |
| M07 | ajuste sem conferir a versão dentro da tx (D3) | 18 (`ajuste-confirmar` AC1/D3, `e2e-fluxos` AC5) |
| M08 | `verificarMutacao` vazio (CSRF todo desligado) | 50 |
| M09 | só o token CSRF desligado (Origin mantido) | 31 |
| M10 | remover sem checar estoque insuficiente (negativo) | 7 (`bau-remover` AC1 6+6) |
| M11 | `QUANTIDADE_MIN: -100_000` | 14 |
| M12 | saída de caixa sem checar saldo | 8 |
| M13 | URL do webhook no log + logger sem máscara | 27 (`e2e-fluxos` AC7, `efeitos-pos-transacao` AC2) |
| M14 | logger sem máscara | 6 (`erros.test.ts` AC3) |
| M15 | log de movimentação fora da transação | 44 |
| M16 | semente do catálogo fora de transação (D6) | 18 |
| M17 | webhook antes do commit (log falso) | 0 — **mutação inválida**: o log falso fazia o montador de embed lançar dentro do `try` de `publicarEvento`, então nada era agendado. Refeita como M17b |
| M17b | `publicarEventos` dentro da transação do baú, com o log real | **só 1 teste dos devs pegou, e por tabela** (`efeitos-pos-transacao` "inventário falhando por Firestore indisponível"); o teste de WEB-051 AC4 "commit que falha → nada agendado" **não pegou** (ver QA-W4). Com `test/qa/pos-commit.test.ts`: 7 falhas novas |
| M18 | embeds de inventário sem o limite de 6000 (D2) | 6 (`webhook-embeds` AC1/AC2/AC4) |
| M19 | `caminhoVoltaSeguro` aceita qualquer caminho com `/` | 9 (QA open redirect `//evil.com`, `/\evil.com`, `/%2F%2Fevil.com`) |
| M20 | cookie sem `HttpOnly` | 5 |
| M21 | callback sem comparar o state | 1 (`oauth-callback` AC1) |
| M22 | ajuste aceita item fora do catálogo (D1/ids) | 5 |
| M23 | CSP com `unsafe-eval` em produção | 1 (`cabecalhos` AC2) |
| M24 | sessão lida com `decodeJwt` (sem assinatura nem `alg`) | 53 (QA `alg none`, outro segredo, HS512, expirado) |
| M25 | falha de webhook relançada pelo agendador | 1 (`erros.test.ts` "agendar isola erros") |
| U01 | botão "Remover" do catálogo para nível 2 | 2 (`painel-catalogo` AC0) |
| U02 | "Zerar baú" visível para nível 2 | 2 (`zerar-bau` AC0) |
| U03 | confirmar zerar aceita `zerar` minúsculo | 1 (`zerar-bau` AC1) |
| U04 | nível 1 vê as três abas de log | 2 (`logs` AC1) |

## 5. Revisão adversarial do código

| Item | Achado |
|---|---|
| Toda rota passa por `comAutorizacao`/`rotaPublica` | Sim: 20 `route.ts`, todos os métodos marcados; manifesto confere com §5; públicas só login/callback (`cobertura-rotas.test.ts` + leitura manual) |
| Nível por rota × matriz §6 | Confere em todas. Zerar e `DELETE` do catálogo: nível 3 na rota **e** no serviço (`zerar.ts:32`, `catalogo/operacoes.ts:179`, defesa em profundidade). Ajuste nível 2 nos dois baús; logs de membros nível 1 |
| CSRF | Origin exata (sem barra, sem subdomínio, `null` recusado), `Sec-Fetch-Site` só `same-origin`, `application/json` (415), token HMAC por `sid` com `timingSafeEqual`; o logout sem sessão exige Origin. Espaço em volta do token é removido pelo próprio `Headers` (normal do HTTP) |
| Limites | 10 KB / 100 KB por bytes lidos (Content-Length mentiroso também dá 413); 200 linhas; 25 por categoria (30 paralelos testados pelos devs); anotação 100 por grafema; `MAX_SAFE_INTEGER` recusado |
| Estoque/saldo atômicos, log e auditoria na mesma tx | Sim (M05, M06, M15 mortas). Uma tx por operação; zerar/remover do catálogo numa tx só |
| Versão otimista do ajuste (D3) | Conferida **dentro** da transação (`ajuste.ts:266`); `versao` sobe em toda escrita (adicionar, remover, zerar, ajuste, remover do catálogo) |
| Ajuste por ids (D1) | Sim, entrada `{categoriaId,itemId,quantidade}`; `#1 Especial: .50` funciona ponta a ponta |
| Embeds (D2) | `inventario-embeds.ts` respeita 6000/1024/4096/10; mutação M18 morta; `allowed_mentions: { parse: [] }` sempre |
| Semente transacional (D6) | `semente.ts:263`, cria só os ausentes; M16 morta |
| Webhook que falha não desfaz | Agendado com `after()` só depois do commit; erros isolados; e2e AC7 com Discord fora do ar mantém dados e auditorias |
| Segredos em log/resposta/bundle | Logger mascara valores da env, URLs de webhook, tokens, `Bearer`, `code=`; respostas 500 genéricas; bundle limpo |
| Cookie | `__Host-stocky_sessao`, `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`, `Max-Age` ≤ 7 dias, sem `Domain`; payload só `sub,nome,nivel,sid,ini,cv,exp` |
| Open redirect `volta` | Lista fixa de 9 caminhos; 11 variações hostis testadas viram `/`; `Location` sempre `APP_URL` + caminho; `Host`/`X-Forwarded-Host` ignorados |
| State do OAuth | 256 bits, cookie JWT de 10 min em `/api/auth`, comparação em tempo constante, Discord não é chamado sem state válido. Ver QA-W8 (uso único) |
| Sessão adulterada | `alg none`, outro segredo, HS512, nível 4, nível `"3"`, sem `sid`, payload trocado, cookie de state no lugar da sessão, expirado → 401 sem tocar o banco |
| XSS | React escapa; sem `dangerouslySetInnerHTML`; nome com `<img onerror>` guardado como texto e escapado no HTML real |
| Usuário sem cargo / fora do servidor | Sem sessão (`sem_acesso`) e sessão antiga apagada; revalidação depois de 15 min rebaixa ou encerra |
| `__proto__` / ids hostis | `__proto__`, `..`, `/`, `.`, `%2F`, maiúsculas, 51 caracteres → 400; zod `strictObject` recusa chaves extras; sem poluição de protótipo. **Mas `constructor` passa como id seguro → QA-W1** |

## 6. Regressão contra as regras do bot e D1 a D6

| Regra / defeito do bot | Situação no site |
|---|---|
| Quantidade 1 a 100.000, caixa 1 a 1.000.000.000, inteiro estrito | OK (lista inteira do WEB-008 e QA corpo hostil: `"1e3"`, `"１２"`, `"-0"`, 2^53+1, 21 dígitos) |
| Nome ≤ 50, id sem acento, sem colisão (equivalentes NFC/NFD, hífen, caixa) | OK, exceto o id reservado `constructor` (QA-W1) |
| Estoque nunca negativo; zero apaga a chave | OK (6+6 com estoque 10 → 200/409, final 4; chave removida). Exceção: QA-W1 grava `NaN` |
| Operações atômicas, auditoria/log na mesma tx | OK |
| Permissão no servidor em toda rota | OK |
| Erros em português, sem detalhe interno | OK |
| D1 (`#` no nome) | Resolvido pelo desenho (ids) |
| D2 (limite dos embeds) | Resolvido |
| D3 (resumo velho sobrescreve) | Resolvido (409 `VERSAO_DESATUALIZADA`, estoque preservado) |
| D4 (resposta antes de 3 s) | Não se aplica ao site; webhooks fora do caminho da resposta |
| D5 (dependências) | Sem alta/crítica; moderadas com correção disponível não aplicada (QA-W6) |
| D6 (semente fora de tx) | Resolvido |

## 7. Defeitos

| # | Severidade | Dono | Card(s) | Situação |
|---|---|---|---|---|
| QA-W1 | **Média** | backend-dev | WEB-009 (AC3), afeta 029, 030, 036, 040, 041 | Aberto, teste falhando |
| QA-W2 | **Média** | backend-dev | WEB-069 (AC1, AC3, AC4) | Aberto, critério sem teste |
| QA-W3 | Baixa | jira-manager | WEB-029 (AC3) | Texto do critério |
| QA-W4 | Baixa | backend-dev | WEB-051 (AC4) e testes com `falharProximoCommit` | Coberto pelo teste do QA; teste dos devs inócuo |
| QA-W5 | Baixa | backend-dev | WEB-033 (AC4) | Aberto, teste falhando |
| QA-W6 | Baixa | backend-dev | WEB-071 | Aberto |
| QA-W7 | Baixa | frontend-dev | WEB-054 (AC1), WEB-055 (AC3) | Aberto |
| QA-W8 | Baixa (observação) | backend-dev | WEB-019 (AC4) | Aberto |

### QA-W1 (Média): `constructor` é aceito como id de item e colide com `Object.prototype`
- **Onde:** `web/src/server/validacao/item.ts:165-170` (`ehIdSeguro` aceita `constructor`; `gerarIdItem('Constructor')` gera `constructor`). Leituras `bau.itens[categoriaId]?.[itemId]` em objetos comuns devolvem a função `Object` quando a categoria já tem outro item no baú: `web/src/server/bau/operacoes.ts:46`, `web/src/server/bau/ajuste.ts:213`, `:271`, `:277`, `web/src/server/catalogo/operacoes.ts:197-198`.
- **Efeito:** (a) **remover** `constructor` que não está no baú responde **200**, grava `NaN` no baú, sobe a versão e cria log com `saldoResultante: NaN` (no Firestore real `NaN` é um número válido e fica gravado); (b) **adicionar** responde 400 "passaria do limite" e o item nunca entra se a categoria já tem itens; (c) a **prévia** do ajuste devolve `antes` indefinido; (d) **remover do catálogo** dá **500** (Firestore recusa função na auditoria), então o dono não consegue apagar o item. Qualquer gerente cria o item; qualquer membro grava o `NaN` depois.
- **Reproduzir:** `cd web && npx vitest run test/qa/chave-prototipo.test.ts` (4 falhas). À mão: gerente `POST /api/catalogo/itens {"categoriaId":"armas","nome":"Constructor"}`; com `armas/colt` no baú, membro `POST /api/bau/membros/remover {"categoriaId":"armas","itemId":"constructor","quantidade":1}` → 200 com `quantidade: null`.
- **Correção sugerida (decisão do dono):** ler com `Object.hasOwn` (ou mapas `Object.create(null)`/`Map`) em todos os pontos acima, e/ou recusar ids reservados de `Object.prototype` em `ehIdSeguro`/`validarNomeItem`. Os testes do QA aceitam qualquer uma das duas.

### QA-W2 (Média): WEB-069 sem prova automatizada; entregáveis do contrato ausentes
- **Onde:** `web/scripts/verificar-build.mjs` e `web/test/server/build.test.ts` (contrato §2, §8 onda 7 e §9 linha 069) **não existem**. O único teste com "WEB-069" é a parte de front em `web/test/ui/a11y.test.tsx:486`.
- **Efeito:** AC1 (build sem `warn`/`Failed`, varrido por script), AC3 (`npm run start` → `/login` 200 e `/api/caixa` 401) e AC4 (cabeçalhos na resposta real) não têm teste; hoje só a verificação manual deste QA (§2) prova. Regra de bloqueio: critério sem teste.
- **Reproduzir:** `ls web/scripts` (só `verificar-bundle.*`); `grep -rn "WEB-069" web/test`.
- **Correção:** criar o script que roda `next build`, falha com linha `warn`/`Failed`, sobe `next start` com `envFalso()`, confere 200/401 e os cabeçalhos e encerra o processo; teste que exercite o varredor da saída; passo no CI.

### QA-W3 (Baixa, texto): WEB-029 AC3 lista `"5"` como inválido
- O contrato (`architecture.md` §4.2, ADR-14) manda aceitar texto só de dígitos, e o código aceita (`bau-adicionar.test.ts` "texto só de dígitos também"). O código segue o contrato; o `jira-manager` deve corrigir o critério. Não bloqueia sozinho.

### QA-W4 (Baixa): testes de "commit que falha" podem atingir a transação da semente, não a do domínio
- **Onde:** `web/test/server/efeitos-pos-transacao.test.ts:307-316` (WEB-051 AC4) e, potencialmente, outros dos 19 usos de `falharProximoCommit` em `web/test/server/`. Com `resetSemente()` no `beforeEach`, a primeira transação da rota é a de `garantirCatalogo()`, que consome a falha; a transação do domínio nunca roda.
- **Prova:** mutação M17b (publicar o webhook **dentro** da transação do baú) passou no teste de WEB-051 AC4 dos devs. O código de produção está correto; o critério agora é provado por `web/test/qa/pos-commit.test.ts`, que roda a semente antes e exige que a operação tenha preparado escritas.
- **Correção:** nos testes de `falharProximoCommit`, chamar `garantirCatalogo()` antes (ou o fake ignorar transações sem escrita) e afirmar que a operação chegou a escrever.

### QA-W5 (Baixa): anotação só com caracteres invisíveis é aceita
- **Onde:** `web/src/server/validacao/texto.ts:5` remove só `\p{Cc}`; `​`, `⁠`, `‏`, `‮` (`\p{Cf}`) passam e a "anotação obrigatória" fica vazia na prática.
- **Reproduzir:** `npx vitest run test/qa/texto-invisivel.test.ts` (4 falhas); ou `POST /api/caixa/movimentar` com `"anotacao":"​"` → 200.
- **Correção:** remover também `\p{Cf}` (ou recusar se só sobrar `\p{Cf}`/espaço).

### QA-W6 (Baixa): moderadas de produção com correção sem quebra disponível
- `npm audit --omit=dev`: 6 moderadas, "fix available via `npm audit fix`" (glob/minimatch transitivos do `firebase-admin`). Não bloqueia WEB-071 AC1 (sem alta/crítica); aplicar `npm audit fix` e reexecutar a suíte.

### QA-W7 (Baixa): páginas protegidas sem sessão respondem 200 com redirecionamento no cliente
- **Onde:** guarda `exigirPagina` (`web/src/server/auth/pagina.ts:231`) é chamada dentro de páginas que ficam sob `loading.tsx` (Suspense), então o `redirect()` sai depois do início do streaming: status 200, `<meta http-equiv="refresh" content="1;url=/login">` e `NEXT_REDIRECT` no payload. Também `/login` com sessão. Nenhum dado é renderizado (conferido no HTML real), por isso baixa.
- **Reproduzir:** `curl -i http://localhost:3999/caixa` no servidor de produção → `HTTP/1.1 200`.
- **Correção:** fazer a guarda no `(protegido)/layout.tsx` antes de qualquer fronteira de Suspense (ou tirar o `loading.tsx` desse segmento) para obter 307 real.

### QA-W8 (Baixa, observação): state do OAuth não é de uso único no servidor
- O state é um JWT sem estado no servidor; reapresentar o mesmo cookie com o mesmo `state` em até 10 min passa a checagem e chama o Discord (que recusa o código já usado). O teste de AC4 (`oauth-callback.test.ts:132`) só cobre o caso do cookie já apagado. Risco baixo (cookie `HttpOnly` em `/api/auth`). Decisão do architect: aceitar e documentar, ou guardar um `jti` usado.

## 8. Status por card

Critério "PASS" = todo critério de aceite com teste que o prova (dos devs ou do QA), execução revalidada e nenhum defeito médio ou maior aberto no card.

| Card | Status | Evidência principal |
|---|---|---|
| WEB-001 | PASS | `server/smoke.test.ts`; build exit 0 |
| WEB-002 | PASS | `server/higiene.test.ts`; lint/typecheck exit 0 |
| WEB-003 | PASS | `smoke.test.ts`, `ui/smoke.test.tsx`, `higiene.test.ts` AC2 |
| WEB-004 | PASS | `segredos.test.ts`, `higiene.test.ts` AC1; varredura do QA §3 |
| WEB-005 | PASS | `env.test.ts` AC1–AC6 |
| WEB-006 | PASS | `erros.test.ts`; M13/M14 mortas |
| WEB-007 | PASS | `ci.test.ts`; `.github/workflows/web.yml` |
| WEB-008 | PASS | `validacao-numero.test.ts`; M11 morta |
| WEB-009 | **FAIL** | QA-W1 (AC3: `constructor` vira chave perigosa) |
| WEB-010 | PASS | `firebase.test.ts`, `smoke.test.ts` |
| WEB-011 | PASS | `fake-firestore.test.ts` (ver QA-W4 sobre o uso nos testes) |
| WEB-012 | PASS | `regras.test.ts` AC1–AC2 (AC3 opcional, sem emulador) |
| WEB-013 | PASS | `dominio.test.ts`; typecheck |
| WEB-014 | PASS | `semente.test.ts` AC1–AC6; M16 morta; e2e com banco vazio |
| WEB-015 | PASS | `sessao.test.ts`; QA sessão forjada; M20/M24 mortas |
| WEB-016 | PASS | `oauth-login.test.ts`; curl §2 |
| WEB-017 | PASS | `discord-api.test.ts` |
| WEB-018 | PASS | `niveis.test.ts` AC1, AC1a, AC2, AC3 |
| WEB-019 | PASS (obs. QA-W8) | `oauth-callback.test.ts`; QA open redirect; M19/M21 mortas |
| WEB-020 | PASS | `revalidacao.test.ts`, `pagina.test.ts`, `e2e-fluxos` AC8 |
| WEB-021 | PASS | `logout.test.ts`; e2e AC1; curl 405 |
| WEB-022 | PASS | `autorizacao.test.ts`; M01 morta |
| WEB-023 | PASS | `csrf.test.ts`, `cobertura-rotas.test.ts`; QA 14 variações; M08/M09 mortas |
| WEB-024 | PASS | `limite.test.ts` |
| WEB-025 | PASS | `cabecalhos.test.ts`; M23 morta; cabeçalhos no servidor real |
| WEB-026 | PASS | `cobertura-rotas.test.ts` + `qa/rotas-adversariais.test.ts`; M02 morta |
| WEB-027 | PASS | `bundle-sem-segredos.test.ts`; `verificar:bundle` limpo |
| WEB-028 | PASS | `bau-leitura.test.ts` |
| WEB-029 | **FAIL** | QA-W1 (adicionar `constructor` recusado sem motivo); QA-W3 só texto |
| WEB-030 | **FAIL** | QA-W1 (remover `constructor` grava `NaN` com 200, contra AC3) |
| WEB-031 | PASS | `rotas-bau.test.ts`; QA corpo hostil e 413 |
| WEB-032 | PASS | `caixa-leitura.test.ts` |
| WEB-033 | **FAIL** | QA-W5 (AC4, baixa, teste falhando) |
| WEB-034 | PASS | `rotas-caixa.test.ts` |
| WEB-035 | PASS | `catalogo-adicionar.test.ts`; e2e AC4 |
| WEB-036 | **FAIL** | QA-W1 (remover `constructor` do catálogo → 500) |
| WEB-037 | PASS | `rotas-catalogo.test.ts` AC1a; M04 morta |
| WEB-038 | PASS | `bau-zerar.test.ts`; M03 morta |
| WEB-039 | PASS | `rotas-zerar.test.ts`; e2e AC6 |
| WEB-040 | **FAIL** | QA-W1 (prévia com `antes` indefinido) |
| WEB-041 | PASS | `ajuste-confirmar.test.ts` AC1–AC8; M07 morta; QA confirmações paralelas |
| WEB-042 | PASS | `rotas-ajuste.test.ts` |
| WEB-043 | PASS | `logs-leitura.test.ts` |
| WEB-044 | PASS | `auditoria-leitura.test.ts` |
| WEB-045 | PASS | `rotas-logs.test.ts`, `cobertura-rotas.test.ts` |
| WEB-046 | PASS | `webhook-cliente.test.ts` |
| WEB-047 | PASS | `webhook-movimentacao.test.ts`; QA menções neutralizadas |
| WEB-048 | PASS | `webhook-embeds.test.ts`; M18 morta |
| WEB-049 | PASS | `webhook-inventario.test.ts` |
| WEB-050 | PASS | `webhook-saldo.test.ts`; e2e AC3 (`$600`) |
| WEB-051 | PASS (obs. QA-W4) | `efeitos-pos-transacao.test.ts` + `qa/pos-commit.test.ts` (AC4); M17b morta só com o teste do QA |
| WEB-052 | PASS | `ui/api-cliente.test.ts` |
| WEB-053 | PASS | `ui/navegacao.test.tsx`, `ui/layout.test.tsx` |
| WEB-054 | PASS (obs. QA-W7) | `ui/guardas.test.tsx`; U04 morta |
| WEB-055 | PASS (obs. QA-W7) | `ui/login.test.tsx` |
| WEB-056 | PASS | `ui/estados.test.tsx` |
| WEB-057 | PASS | `ui/bau.test.tsx` |
| WEB-058 | PASS | `ui/paginas-bau.test.tsx` |
| WEB-059 | PASS | `ui/caixa.test.tsx` |
| WEB-060 | PASS | `ui/painel-catalogo.test.tsx` AC0–AC4; U01 morta |
| WEB-061 | PASS | `ui/zerar-bau.test.tsx` AC0–AC4; U02/U03 mortas |
| WEB-062 | PASS | `ui/ajuste.test.tsx` |
| WEB-063 | PASS | `ui/logs.test.tsx`; U04 morta |
| WEB-064 | PASS | `ui/auditoria.test.tsx` |
| WEB-065 | PASS | `ui/a11y.test.tsx` AC1–AC5 |
| WEB-066 | PASS | `qa/e2e-fluxos.test.ts` AC1–AC8 (10 testes passando) |
| WEB-067 | Cancelado | Q12 |
| WEB-068 | PASS | `env-documentada.test.ts` (README, `.env.example`, `env.ts`, `vercel.json`, `DEPLOY.md`) |
| WEB-069 | **FAIL** | QA-W2 (AC1, AC3, AC4 sem teste; verificação manual do QA passou) |
| WEB-070 | PASS | `env-documentada.test.ts` "WEB-070 README" |
| WEB-071 | PASS (obs. QA-W6) | audit sem alta/crítica; `npm ci` limpo; moderadas justificadas em §1 |

## 9. O que precisa acontecer para o PASS

1. **backend-dev:** QA-W1 (ids reservados / `Object.hasOwn`) até `test/qa/chave-prototipo.test.ts` passar; QA-W2 (`scripts/verificar-build.mjs` + teste + passo no CI); QA-W5; QA-W6 (`npm audit fix`); QA-W4 (corrigir os testes de commit falho).
2. **frontend-dev:** QA-W7 (guarda antes do Suspense).
3. **jira-manager:** QA-W3 (texto do WEB-029 AC3); registrar QA-W8 para decisão do architect.
4. Na reentrega o QA revalida tudo (execução limpa, mutações, servidor real), não só o corrigido.

VEREDITO: FAIL
