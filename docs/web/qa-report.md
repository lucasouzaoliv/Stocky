# Stocky Web: relatório de QA (ciclo 3, último antes de levar ao usuário)

Autor: `qa-engineer` · 06/11/2026 · Branch `web/planejamento` (HEAD `4e7fb3a`, correções do ciclo 2) · Escopo: WEB-001 a WEB-071 (WEB-067 cancelado).

Revalidação completa, do zero (`rm -rf node_modules .next`). As contagens e afirmações do commit dos devs **não** foram usadas como evidência. Esta execução retomou uma rodada interrompida por reinício do container: os arquivos parciais do QA foram relidos, conferidos e executados de novo; nenhum resultado da rodada interrompida foi reaproveitado.

Arquivos do QA neste ciclo (só `web/test/qa/**`, nenhum código de produção alterado, nada commitado):

| Arquivo | Testes | O que prova |
|---|---|---|
| `web/test/qa/ciclo3-unicode.test.ts` (novo) | 461 (58 falham) | 59 invisíveis/direção/VS/CGJ/fillers/braille/tags/uso privado e 17 espaços exóticos no nome do item e na anotação (funções puras e rotas reais), NFC/NFD/NFKC, decisão de remover invisíveis em emoji, 8 homóglifos, apelido do Discord e dados legados nos logs e nos embeds |
| `web/test/qa/ciclo3-adversarial.test.ts` (novo) | 352 (todos passam) | ordem de chaves, números como texto/decimal/exponencial em todas as rotas, corpo vazio/gigante/duplicado/malformado/Content-Length mentiroso, métodos trocados, `..`/`%2e`, ids gigantes, Host/Origin forjados, cookies duplicados, expiração e revalidação no limite exato e durante a transação, zerar × ajuste, 50 saídas paralelas de caixa, 50 mistas, 100 adicionar/remover paralelos |
| `web/test/qa/chave-prototipo.test.ts` (alterado) | 4 (passam) | os `return` antecipados do ciclo 1 viraram afirmações reais: criação de `Constructor` → 400 com catálogo intacto; adicionar/remover/prévia com `constructor` → 400 sem gravar; dado legado `constructor` removível pelo dono com números de verdade |
| Demais `web/test/qa/*` | 200 (passam) | ciclos 1 e 2, sem alteração |

---

## 1. Execução limpa (`web/`)

| Comando | Resultado |
|---|---|
| `rm -rf node_modules .next && npm ci` | exit 0 |
| `npm run lint` | exit 0, zero erros e zero avisos (inclui os testes novos do QA) |
| `npm run typecheck` | exit 0 |
| `npm test` × 5 seguidas | 83 arquivos, **2481 testes: 2423 passam, 58 falham, nas 5 execuções as mesmas 58**, todas em `qa/ciclo3-unicode.test.ts` (QA-W15, W16, W18, W19). Toda a suíte dos devs e os testes do QA dos ciclos 1 e 2 passam nas 5 |
| `sessao.test.ts` + `csrf.test.ts` × 220 | **2 falhas** em `sessao.test.ts:37` (Max-Age 604799 ≠ 604800) → teste intermitente novo (QA-W20). O teste "byte alterado" do QA-W11: 0 falhas em 220 |
| `npm run build` com `env -i` | exit 0; nenhuma linha `warn`/`error`/`Failed`/`⚠` |
| `npm run verificar:bundle` | exit 0, `Bundle limpo: 22 arquivos em .next/static sem nenhum segredo` |
| `npm run verificar:build` | exit 0: build limpo, `/login` 200, `/api/caixa` 401, **páginas protegidas 307** (QA-W14), cabeçalhos conferidos, servidor encerrado |
| `npm audit --omit=dev --audit-level=high` | exit 0; 6 moderadas (QA-W6, risco aceito), nenhuma alta/crítica |
| `.only/.skip/.todo/xit/xdescribe/fit`, `eslint-disable`, `@ts-ignore/@ts-nocheck/@ts-expect-error`, `dangerouslySetInnerHTML` em `src`, `test`, `scripts` | nenhum (só amostras dos próprios detectores em `higiene.test.ts` e `ui/escape-html.test.tsx`) |

## 2. Itens do ciclo 2, um a um

| Item | Situação | Evidência |
|---|---|---|
| **QA-W10** invisíveis no nome / gêmeo visual | **Parcial** → resto vira QA-W15 | `texto.ts` (`sanearTexto` único, NFC, espaços exóticos, `\p{Cc}\p{Cf}\p{Co}\p{Cs}`, VS, CGJ, fillers, braille) usado por `validarNomeItem`, `gerarIdItem` e `normalizarAnotacao`; duplicado por `chaveDeNome` (NFKC, sem diacrítico) em `catalogo/operacoes.ts:44`. Os 105 testes do ciclo 2 passam; 52 dos 59 invisíveis da bateria nova passam. Ficaram de fora 7 caracteres ignoráveis (QA-W15) |
| **QA-W11** teste intermitente | **Corrigido** | `sessao.test.ts:68-77` troca caractere do meio; `csrf.test.ts:96` idem. 0/220. Mas há outro teste intermitente no mesmo arquivo (QA-W20) |
| **QA-W5** anotação só com invisíveis | **Corrigido** | `temCaractereVisivel` recusa a lista do ciclo 2 (7 testes passam); a anotação ainda grava os 7 caracteres do QA-W15 no meio do texto |
| **QA-W12** teste dos devs para HTML | **Corrigido** | `test/ui/escape-html.test.tsx` (Baú, Catálogo, Caixa, Logs, Auditoria, varredura de `dangerouslySetInnerHTML`/`innerHTML`, `unicode-bidi: isolate`). Reintroduzido fora do repositório (§4, X01–X03): **os testes dos devs falham sozinhos** em todos os três |
| **QA-W13** logout sem revogação | **Risco aceito, documentado** | `web/README.md` "Riscos aceitos" (JWT sem estado, 7 dias, revalidação a cada 15 min). Conferido |
| **QA-W14** 307 sem servidor real | **Corrigido** | `verificar-build.mjs` `PAGINAS_PROTEGIDAS` com `!== 307` e `Location /login`; executado (§1) e conferido à mão (§6) |
| QA-W1, W2, W3, W4, W7 | Continuam corrigidos | suíte e mutações (N18/N19 do ciclo 2 reconferidas indiretamente por P03/P21b e `chave-prototipo` agora com afirmações) |
| QA-W6, W8 | Riscos aceitos | README, inalterado |

## 3. Bateria de Unicode (nome do item, anotação, logs e embeds)

| Ataque | Resultado |
|---|---|
| C0/C1 (NUL, BEL, ESC, DEL, CSI), soft hyphen, ALM, ZWSP/ZWNJ/ZWJ/WJ, LRM/RLM, LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, operadores invisíveis, BOM, tags (U+E0001, E0020–E007F), VS1–VS16, VS17–VS256, CGJ, hangul fillers (U+115F, 1160, 3164, FFA0), braille blank, MVS, anotações interlineares, formato de taquigrafia e de música, uso privado | removidos: `"Co·lt"` → 409, `"Ka·tana"` gravado `Katana`, anotação gravada limpa, só o caractere → 400 ✔ |
| **Khmer U+17B4/U+17B5, Mongolian FVS1–FVS4 (U+180B–180D, U+180F), Khitan filler U+16FE4** | **passam**: `"Co᠋lt"` cria um segundo "Colt" (201, id diferente de `colt`), nome e anotação gravados com o caractere → **QA-W15** |
| 17 espaços exóticos (TAB, LF, VT, FF, CR, NEL, NBSP, ogham, en quad, em space, thin, hair, U+2028/2029, NNBSP, math, ideográfico) | viram um espaço comum, sem quebra no embed ✔ |
| NFC × NFD × NFKC (`Munição`, decomposto, fullwidth, matemático negrito) | mesma chave e mesmo id; armazenado em NFC ✔ |
| Homóglifos NFKC (C romano U+216D, C matemático, fullwidth) | 409 ✔ |
| **Homóglifos de outro alfabeto** (С/о cirílicos, ο grego, palochka) | **aceitos** (201, segundo "Colt") → QA-W19 |
| **Apelido do Discord** com RLO, RLE, RLI sem PDI, ZWSP (`Che​fe`), BEL/ESC, quebra de linha | `obterMembro` devolve cru; vai para a sessão, para `usuario.nome` dos logs e para os embeds → **QA-W16** |
| Dado legado com RLO/ZWSP no nome do item/categoria | inventário fixo, embed de movimento e resumo de remoção saem com direção → QA-W18 |
| Logs do servidor (`log.ts`) | `JSON.stringify` escapa os controles; sem injeção de linha ✔ |
| UI | `<bdi>` no autor e `unicode-bidi: isolate` nos textos do usuário (mutação P25 morta) ✔ |

**Remover invisíveis é aceitável?** Sim, para este site. Testado em `ciclo3-unicode.test.ts` "decisão de remover invisíveis": 👨‍👩‍👧 vira 👨👩👧, ❤️ vira ❤, 🏳️‍🌈 vira 🏳🌈, a bandeira da Inglaterra (tags) vira 🏴, keycap perde o VS16 e mantém U+20E3, tom de pele é mantido. Nada visível some além do joiner/seletor, o resultado é previsível, e a alternativa (aceitar ZWJ só entre emojis) reabriria o gêmeo visual. Os nomes são de itens de jogo em pt-BR (onde ZWNJ/ZWJ não têm função linguística). A decisão está documentada no README. Ressalva: a remoção é silenciosa; a UI poderia mostrar o nome como foi gravado (já mostra, no retorno 201).

## 4. Mutações do ciclo 3 (todas diferentes das 30 do ciclo 1 e das 25 do ciclo 2)

Clone local da branch fora do repositório (`scratchpad/mut3/stocky`, com `node_modules` próprio), `src` e `test` sincronizados com o repositório (diff vazio), `build.test.ts` excluído (coberto em §1). Linha de base no clone: as mesmas 58 falhas do §1. "Novas" = falhas além da linha de base. Lotes de 6, saída em arquivo. Clone restaurado no fim (diff de `src` vazio).

**QA-W12 (dangerouslySetInnerHTML reintroduzido):**

| # | Mutação | Novas | Testes dos devs que pegaram |
|---|---|---|---|
| X01 | nome do item com `dangerouslySetInnerHTML` no `Bau.tsx` | 5 | `ui/escape-html.test.tsx` (3 textos hostis + varredura) e `qa/escape-html` |
| X02 | idem no `Catalogo.tsx` | 5 | `ui/escape-html.test.tsx` ×4 e `qa/escape-html` |
| X03 | anotação do caixa com `dangerouslySetInnerHTML` | 4 | `ui/escape-html.test.tsx` ×4 (só dos devs) |

**Mutações novas: 28 aplicadas, 27 mortas, 1 sobrevivente equivalente.**

| # | Mutação | Novas | Exemplo de teste que pegou |
|---|---|---|---|
| P01 | `\p{Cf}` fora da lista de invisíveis | 222 | `qa/ciclo2` "Co<BOM>lt" |
| P02 | duplicado sem `chaveDeNome` | 2 | `qa/ciclo3-unicode` C matemático, C romano |
| P03 | `gerarIdItem` sem `sanearTexto` | 83 | `qa/ciclo3-unicode` ALM "mesmo id" |
| P04 | `temCaractereVisivel` sempre verdadeiro | 122 | `qa/ciclo2` anotação só com BOM |
| P05 | espaços `Zs/Zl/Zp` não normalizados | 13 | `qa/ciclo3-unicode` NBSP, NEL |
| P06 | saneamento sem NFC | 2 | `validacao-item` "normaliza para NFC" (devs) |
| P07 | logout com Max-Age de 7 dias | 5 | `logout.test` AC1/AC2, `sessao.test` |
| P08 | CSP sem `frame-ancestors` e sem `X-Frame-Options` | 2 | `cabecalhos.test` AC1 |
| P09 | saída do caixa com `>=` (não saca o saldo exato) | 3 | `caixa-operacoes` AC2 |
| P10 | sem `isSafeInteger` no saldo | 1 | `caixa-operacoes` AC6 |
| P11 | paginação até 1000 | 9 | `paginacao.test`, `logs-leitura` |
| P12 | `auditoria/[id]` sem validar formato | 6 | `rotas-logs` AC2, `auditoria-leitura` |
| P13 | gerente vira dono | 4 | `niveis.test` AC1 |
| P15 | revalidação com `>=` no limite exato | 3 | `revalidacao` AC1, `qa/ciclo3` limite exato |
| P16 | revalidação a cada 15 h | 7 | `revalidacao` AC1, `qa/ciclo3` |
| P17 | lê o **último** cookie de mesmo nome | 2 | `qa/ciclo3` cookies duplicados |
| P18 | nome do cookie sem diferenciar maiúsculas | 1 | `qa/ciclo3` cookie com maiúscula (só QA) |
| P19 | limite do corpo ×1000 | 27 | `qa/ciclo2` nome de 9 KB, `qa/ciclo3` 413 |
| P20 | corpo vazio vira `{}` | 3 | `erros.test` WEB-006 lerJson |
| P21b | tipo de baú aceita maiúsculas (`GERENCIA`) | 11 | `qa/ciclo3` tipo "GERENCIA" → 400 |
| P22 | Origin comparada por prefixo | 7 | `qa/ciclo3` Origin com vírgula/sufixo |
| P23 | resumo da auditoria sem corte | 1 | `auditoria-registrar` "resumo ≤ 200" |
| P24 | `allowed_mentions` com everyone/users/roles | 12 | `efeitos-pos-transacao`, e2e AC2 |
| P25 | `unicode-bidi: isolate` removido | 8 | `ui/escape-html` isolamento de direção |
| P27 | anotação aceita 101 caracteres | 4 | `qa/rotas-adversariais` anotação 101 |
| P28 | nome contado em UTF-16 | 2 | `qa/ciclo2` 50 com emoji aceito |
| P26 | ajuste aceita 201 linhas | **0** | **equivalente**: o catálogo tem no máximo 6 × 25 = 150 itens e linhas repetidas são recusadas, então 201 linhas sempre caem em outra validação. Sem efeito observável |
| P21 | (versão original, 3 ocorrências do trecho) | — | não aplicada; substituída por P21b |
| P14 | cargo vazio sem `id !== ''` | — | equivalente (`meus` nunca contém `''`); fora da contagem |

## 5. Rodada adversarial nova (`ciclo3-adversarial.test.ts`, 352 testes, todos passam)

| Ataque | Resultado |
|---|---|
| Ordem de chaves JSON (adicionar, confirmar com `versao` depois das linhas, caixa) | indiferente ✔ |
| 30 números ruins (`"1e3"`, `1.5`, `"0x10"`, `"+5"`, `-0`, `1e21`, `9007199254740993`, `1e308`, `"NaN"`, `null`, `true`, `[5]`, fullwidth, árabe, `"1_000"`, `"5n"`…) + acima do máximo, em adicionar, remover, movimentar, prévia e confirmar | 400, banco idêntico ✔ (`0` no ajuste = zerar o item, válido) |
| Aceitos: `5`, `"5"`, `" 5 "`, `"5 "`, `"00005"`, `5.0`, `5e0`, `1e3` (JSON) | viram inteiro, coerente com ADR-14 (`5.0`/`1e3` são o mesmo número depois do `JSON.parse`) ✔ |
| `versao` inválida no confirmar; `limite` hostil (`1e2`, `101`, `%2B5`, `1%00`, fullwidth) nos 4 GETs paginados | 400/409 ✔ |
| 14 corpos ruins (vazio, espaços, `null`, lista, quebrado, vírgula sobrando, aspas simples, `NaN`, comentário, 4000 níveis, `__proto__`, UTF-8 inválido) × 7 rotas | 400 `VALIDACAO`, nada gravado, protótipo intacto ✔ |
| 1 byte acima do limite (10 240 / 102 400) e Content-Length mentiroso (diz 10, manda 200 KB) × 7 rotas | 413 ✔ |
| Chaves duplicadas (`quantidade` 1 e −5; `itemId` colt e constructor; `confirmacao` ZERAR e zerar; `versao` 0 e 99) | a última vale e é validada; 400/409, nada gravado ✔ |
| GET/HEAD em rota de mutação; PUT/PATCH/DELETE sem CSRF; POST no login | nada gravado / 403 / 405; no servidor real GET em `/api/bau/zerar` → 405 do Next ✔ (QA-W17, observação) |
| 17 tipos de baú hostis (`..`, `%2e%2e`, `GERENCIA`, `membros​`, 5000 chars, `__proto__`, vazio) | 400 em GET, logs e adicionar, nunca vaza a gerência ✔ |
| 13 ids hostis no DELETE do catálogo (`..`, `col%74`, 100 KB, `COLT`, `_colt`, `co__lt`…); `auditoria/[id]` e `cursor` com `..`, `%2F`, 100 KB | 400/404, nada removido ✔ |
| 10 Origins forjadas (sufixo `.evil.com`, `:443`, barra, maiúsculas, http, `null`, vazia, lista) com token certo | 403 ✔ |
| Host / X-Forwarded-Host / X-Forwarded-Proto forjados no adicionar e no login | nada muda; `redirect_uri` continua da `APP_URL` ✔ |
| Cookies duplicados (nível 1 antes do 3; 3 antes do 1 com CSRF do outro; adulterado antes do válido; nome em maiúsculas, aspas, prefixo, vazio) | vale o primeiro, 403/401 ✔ |
| Sessão no segundo exato do `exp` | 1 s antes 200; no `exp` 401 `SEM_SESSAO`, nada gravado ✔ |
| Revalidação no limite exato (15 min vale, +1 ms → 401 `REVALIDAR` em mutações e leitura) e vencendo **dentro** da transação | operação iniciada válida termina uma vez só; a próxima é 401 ✔ |
| Zerar × ajuste simultâneos (10 rodadas, ordem alternada) | ajuste 409 e versão 4, ou ajuste antes e zerar depois (versão 5); auditoria = operações 200; gerência intacta ✔ |
| 50 saídas paralelas de 3 com saldo 100 | exatamente 33 passam, saldo 1, 33 logs com saldos únicos 97…1 ✔ |
| 50 operações mistas paralelas (dois tipos) | saldo = soma das 200, nunca negativo, um log por 200 ✔ |
| 50 adicionar + 50 remover paralelos | estoque = soma das 200, um log por 200 ✔ |

## 6. Servidor de produção real (`next start -p 3999`, `envFalso()`, `NODE_ENV=production`)

| Verificação (curl) | Resultado |
|---|---|
| `GET /login` | 200; CSP com nonce e `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy`; HSTS 2 anos; `Permissions-Policy`; COOP; sem `X-Powered-By`; `Cache-Control: private, no-store` |
| `/caixa`, `/painel`, `/bau/membros`, `/bau/gerencia`, `/logs`, `/auditoria`, `/ajuste/membros`, `/ajuste/gerencia` sem sessão | **307 → `/login`** (todas) |
| `/` sem sessão | 200, página de entrada sem dados |
| 10 GETs de `/api/*` sem sessão (`caixa`, `bau/membros`, `bau/gerencia`, `auditoria`, `auditoria/abc`, `catalogo`, `csrf`, `caixa/historico`, `logs/caixa`, `logs/bau/membros`) | **401** `SEM_SESSAO`, `Cache-Control: no-store` |
| 7 POSTs de mutação e o `DELETE` do catálogo sem sessão | 401 |
| GET em rota só POST (`/api/bau/zerar`) / `/api/bau/%2e%2e/adicionar` | 405 / 404 |
| Sessão forjada nível 1: `/api/caixa`; nível 2: `zerar`; nível 1 sem CSRF; cookies duplicados n1;n2 | 403 / 403 / 403 / 403 |
| Nível 1 em `/api/bau/membros` (Firebase falso inalcançável) | 500 `INTERNO` com mensagem genérica, sem detalhe |
| `/caixa` nível 1 / `/login` logado | 200 (tela "sem permissão") / 307 → `/` |
| Encerramento | `kill -TERM` no grupo do PID 5409; porta fechada; **nenhum `next-server`** na lista de processos |

## 7. Varredura de segredos

- HEAD (`git grep` de PEM, `private_key_id` com valor, `AIza…`, `xox[bp]-`, token do Discord, webhook com token, `sk_live_`, `ghp_`, `github_pat_`, `AKIA…`, `…iam.gserviceaccount.com`): só documentação, valores falsos (`troque-aqui@exemplo…`, `teste@exemplo…`, marcador do `verificar-bundle`) e amostras de testes de varredura. **Limpo.**
- Commits do site (`679b8ef^..HEAD`, 18 commits), linhas adicionadas: **nenhum segredo**.
- Arquivos novos do QA: nenhum padrão.
- `git ls-files`: nenhum `node_modules/`, `.next/`, `.env` real, `.pem`, `config.json` (só `web/.env.example` com valores falsos).
- Pré-existente, fora do site (já no ciclo 2): chave privada real do Firebase do projeto do bot no commit `74513cc` (`utils/firebase.js`), removida em `a433f04`, ainda no histórico. **O usuário precisa confirmar a revogação no Google Cloud.**

## 8. Defeitos

| # | Severidade | Dono | Card(s) | Situação |
|---|---|---|---|---|
| QA-W15 | **Média** | backend-dev | WEB-009 AC4, WEB-035 AC3, WEB-033 AC4 | Novo (resto do QA-W10), 35 testes falhando |
| QA-W16 | **Média** | backend-dev | WEB-017, WEB-019, WEB-047, WEB-048 | Novo, 15 testes falhando |
| QA-W20 | **Média** | backend-dev | WEB-015 AC1 | Novo, teste intermitente (2/220) |
| QA-W18 | Baixa | backend-dev | WEB-047, WEB-048, WEB-049 | Novo, 3 testes falhando |
| QA-W19 | Baixa | backend-dev (decisão do architect) | WEB-009, WEB-035 | Novo, 5 testes falhando |
| QA-W17 | Baixa (observação) | backend-dev | WEB-022 | Novo, sem efeito hoje |
| QA-W5, W11, W12, W14 | — | — | — | Corrigidos e revalidados |
| QA-W10 | — | — | — | Parcial; o que resta é QA-W15 |
| QA-W6, W8, W13 | — | — | — | Riscos aceitos, documentados no README |

### QA-W15 (Média): sete caracteres invisíveis ainda passam no nome do item e na anotação; o gêmeo visual de "Colt" volta
- **Onde:** `web/src/server/validacao/texto.ts:13` (`INVISIVEIS` é uma lista fechada). Ficaram de fora U+17B4, U+17B5 (Khmer inherent vowels), U+180B, U+180C, U+180D, U+180F (Mongolian free variation selectors) e U+16FE4 (Khitan filler). Todos são *Default_Ignorable_Code_Point* (não aparecem na tela) e de categoria `Mn`, então passam por `\p{Cf}` e não contam em `temCaractereVisivel` só quando estão sozinhos.
- **Efeito:** o mesmo do QA-W10: gerente cria `"Co᠋lt"` com "Colt" existente → **201**, com id diferente de `colt`: um segundo "Colt" visualmente idêntico no catálogo, no baú, nos logs e no inventário do Discord; o caractere fica gravado no nome e na anotação (`"vend᠋a"`).
- **Reproduzir:** `cd web && npx vitest run test/qa/ciclo3-unicode.test.ts -t "khmer|mongolian|khitan"` (35 falhas).
- **Correção sugerida:** trocar a lista por propriedade: `/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Default_Ignorable_Code_Point}⠀\u{16FE4}]/gu` (o Node 22 suporta `\p{Default_Ignorable_Code_Point}`; ele cobre VS, CGJ, fillers e os sete; o U+16FE4 e o braille precisam ficar explícitos).

### QA-W16 (Média): o nome do membro vindo do Discord não é saneado e chega cru aos logs e aos embeds
- **Onde:** `web/src/server/discord/api.ts:81-87` (`obterMembro` só faz `trim` e corta em 32); o nome entra na sessão (`oauth.ts:137`), em `usuario.nome` de todo log/auditoria e nos embeds `webhooks/movimentacao.ts:22,42,68` (`escaparMarkdown` não trata direção nem invisíveis). Na tela está isolado (`<bdi>`), no Discord não.
- **Efeito:** um membro com apelido `Fulano‮` (RLO; o site não deve confiar que o Discord filtre isso) faz o resto da linha do embed `**Fulano** adicionou **15x Colt**.` aparecer invertido no canal de log; com RLE/RLI sem PDI, idem. Com `Che​fe` um membro aparece como "Chefe" nos logs e nos avisos. BEL/ESC e quebra de linha também são gravados. É o mesmo vetor do QA-W10 (inverter a quantidade exibida no Discord), por outro campo.
- **Reproduzir:** `npx vitest run test/qa/ciclo3-unicode.test.ts -t "apelido|RLI sem PDI|ZWSP imitando|BEL/ESC|quebra de linha"` (15 falhas).
- **Correção sugerida:** aplicar `sanearTexto` ao nome em `obterMembro` (com fallback para `username`/id se ficar vazio) e, por defesa em profundidade, dentro do `limpo()` dos embeds (QA-W18).

### QA-W20 (Média): teste de Max-Age da sessão é intermitente
- **Onde:** `web/test/server/sessao.test.ts:37` (`expect(c.maxAge).toBe(SESSAO_DURACAO_MS / 1000)` com relógio real). `cookieSessao` calcula `exp − floor(Date.now()/1000)` (`sessao.ts:79`); se o segundo vira entre criar o token e montar o cookie, dá 604799.
- **Efeito:** `npm test`/CI falha de vez em quando (2 em 220 execuções do arquivo; saída: `expected 604799 to be 604800`). O código de produção está correto. Regra de bloqueio: teste intermitente.
- **Reproduzir:** `for i in $(seq 150); do npx vitest run test/server/sessao.test.ts >/dev/null || echo falhou; done`.
- **Correção:** `vi.useFakeTimers({ now: … })` no teste, ou aceitar `604799..604800`.

### QA-W18 (Baixa): saída para o Discord não neutraliza direção nem invisíveis já gravados
- **Onde:** `webhooks/movimentacao.ts:13` (`limpo`), `inventario-embeds.ts:89-90`, resumo em `catalogo/operacoes.ts:124`. Nomes de item/categoria gravados antes do saneamento (ou por outro caminho) com RLO/ZWSP saem crus no inventário fixo, no embed de movimento e no resumo da remoção.
- **Por que baixa:** o banco antigo foi apagado e todo nome novo já passa por `sanearTexto`; é defesa em profundidade. Corrigir junto com QA-W16 (sanear dentro de `limpo`/`escaparMarkdown`).
- **Reproduzir:** `npx vitest run test/qa/ciclo3-unicode.test.ts -t "dados legados"` (3 falhas).

### QA-W19 (Baixa): homóglifos de outro alfabeto criam um segundo "Colt"
- **Onde:** `validacao/texto.ts` `chaveDeNome` (NFKC não junta alfabetos). `"Сolt"` (С cirílico), `"Cоlt"`, `"Cοlt"` (ómicron), `"Coӏt"` → 201.
- **Por que baixa:** exige gerente (nível 2) agindo de má-fé, deixa rastro na auditoria e o id gerado é diferente; NFKC já pega fullwidth, matemático e numerais romanos.
- **Sugestão:** recusar nome que misture latino com cirílico/grego na mesma palavra (`\p{Script=Cyrillic}`/`\p{Script=Greek}` junto de `\p{Script=Latin}`), ou mapear os confundíveis óbvios na chave. Decisão do architect se preferir aceitar o risco (aí o teste do QA sai).
- **Reproduzir:** `npx vitest run test/qa/ciclo3-unicode.test.ts -t "homóglifos"` (5 falhas).

### QA-W17 (Baixa, observação): `comAutorizacao` não confere o método HTTP
- `web/src/server/auth/autorizacao.ts:66-104`: o wrapper decide "mutação" por `req.method`; se um handler de POST fosse chamado com GET, pularia CSRF e corpo. Hoje o Next só roteia os métodos exportados (GET em `/api/bau/zerar` → 405 no servidor real) e o corpo ausente dá 400, então não há efeito. Sugestão: o wrapper recusar método diferente do exportado. Coberto por `ciclo3-adversarial` "métodos HTTP trocados".

## 9. Status por card

Critério "PASS" = todo critério de aceite com teste que o prova (dos devs ou do QA), execução revalidada e nenhum defeito médio ou maior aberto, nem teste falhando ou intermitente, no card.

| Card | Status | Evidência principal |
|---|---|---|
| WEB-001 | PASS | `smoke.test.ts`; build exit 0 |
| WEB-002 | PASS | `higiene.test.ts`; lint/typecheck exit 0 |
| WEB-003 | PASS | `smoke.test.ts`, `ui/smoke.test.tsx` |
| WEB-004 | PASS | `segredos.test.ts`; varredura §7 |
| WEB-005 | PASS | `env.test.ts` |
| WEB-006 | PASS | `erros.test.ts`; P20 morta |
| WEB-007 | PASS | `ci.test.ts`; `web.yml` com `verificar:build` |
| WEB-008 | PASS | `validacao-numero.test.ts`; 30 números ruins × 5 rotas (§5); P09/P10 mortas |
| WEB-009 | **FAIL** | QA-W15 (AC4: invisíveis residuais geram id e item diferentes); obs. QA-W19 |
| WEB-010 | PASS | `firebase.test.ts` |
| WEB-011 | PASS | `fake-firestore.test.ts` |
| WEB-012 | PASS | `regras.test.ts` |
| WEB-013 | PASS | `dominio.test.ts`; P21b morta |
| WEB-014 | PASS | `semente.test.ts` |
| WEB-015 | **FAIL** | QA-W20 (teste de AC1 intermitente); QA-W11 corrigido; comportamento correto (P07, limite exato do `exp` no QA) |
| WEB-016 | PASS | `oauth-login.test.ts`; Host forjado no login (§5) |
| WEB-017 | **FAIL** | QA-W16 (`obterMembro` devolve nome com direção/invisíveis) |
| WEB-018 | PASS | `niveis.test.ts`; P13 morta |
| WEB-019 | **FAIL** | QA-W16 (nome cru entra na sessão) |
| WEB-020 | PASS | `revalidacao.test.ts`; P15/P16 mortas; limite exato e durante a transação (QA) |
| WEB-021 | PASS | `logout.test.ts`; P07 morta; QA-W13 aceito e documentado |
| WEB-022 | PASS (obs. QA-W17) | `autorizacao.test.ts`; cookies duplicados (QA); P17/P18 mortas |
| WEB-023 | PASS | `csrf.test.ts`; P22 morta; 10 Origins forjadas |
| WEB-024 | PASS | `limite.test.ts` |
| WEB-025 | PASS | `cabecalhos.test.ts`; P08 morta; servidor real §6 |
| WEB-026 | PASS | `cobertura-rotas.test.ts`; todas as rotas 401 sem sessão no servidor real |
| WEB-027 | PASS | `bundle-sem-segredos.test.ts`; `verificar:bundle` |
| WEB-028 | PASS | `bau-leitura.test.ts`; tipos hostis (QA) |
| WEB-029 | PASS | `bau-adicionar.test.ts`; 100 operações paralelas (QA) |
| WEB-030 | PASS | `bau-remover.test.ts` |
| WEB-031 | PASS | `rotas-bau.test.ts`; P19 morta |
| WEB-032 | PASS | `caixa-leitura.test.ts`; P11 morta |
| WEB-033 | **FAIL** | QA-W15 (AC4: anotação grava os 7 invisíveis residuais); QA-W5 corrigido; 50 paralelas (QA) |
| WEB-034 | PASS | `rotas-caixa.test.ts`; P27 morta |
| WEB-035 | **FAIL** | QA-W15 (AC3: duplicado contornado); P02/P03/P28 mortas |
| WEB-036 | PASS | `catalogo-remover.test.ts`; `qa/chave-prototipo` (legado) |
| WEB-037 | PASS | `rotas-catalogo.test.ts`; ids hostis (QA) |
| WEB-038 | PASS | `bau-zerar.test.ts`; zerar × ajuste (QA) |
| WEB-039 | PASS | `rotas-zerar.test.ts`; chave duplicada `confirmacao` (QA) |
| WEB-040 | PASS | `ajuste-previa.test.ts` |
| WEB-041 | PASS | `ajuste-confirmar.test.ts`; `versao` duplicada/inválida (QA) |
| WEB-042 | PASS | `rotas-ajuste.test.ts` |
| WEB-043 | PASS | `logs-leitura.test.ts`; P11 morta |
| WEB-044 | PASS | `auditoria-leitura.test.ts`; P12/P23 mortas |
| WEB-045 | PASS | `rotas-logs.test.ts` |
| WEB-046 | PASS | `webhook-cliente.test.ts`; P24 morta |
| WEB-047 | **FAIL** | QA-W16 (embed de movimento com apelido invertendo a linha); QA-W18 |
| WEB-048 | **FAIL** | QA-W16 (embeds de aviso/caixa, campo "Responsável"); QA-W18 |
| WEB-049 | PASS (obs. QA-W18) | `webhook-inventario.test.ts` |
| WEB-050 | PASS | `webhook-saldo.test.ts` |
| WEB-051 | PASS | `efeitos-pos-transacao.test.ts` |
| WEB-052 | PASS | `ui/api-cliente.test.ts` |
| WEB-053 | PASS | `ui/navegacao.test.tsx`, `ui/layout.test.tsx` |
| WEB-054 | PASS | `ui/guardas.test.tsx`; QA-W14 corrigido (`verificar:build` 307) |
| WEB-055 | PASS | `ui/login.test.tsx`; `/login` logado → 307 real |
| WEB-056 | PASS | `ui/estados.test.tsx` |
| WEB-057 | PASS | `ui/bau.test.tsx`, `ui/escape-html.test.tsx` (X01 morta pelos devs); P25 morta |
| WEB-058 | PASS | `ui/paginas-bau.test.tsx` |
| WEB-059 | PASS | `ui/caixa.test.tsx`, `ui/escape-html.test.tsx` (X03) |
| WEB-060 | PASS | `ui/painel-catalogo.test.tsx`, `ui/escape-html.test.tsx` (X02) |
| WEB-061 | PASS | `ui/zerar-bau.test.tsx` |
| WEB-062 | PASS | `ui/ajuste.test.tsx` |
| WEB-063 | PASS | `ui/logs.test.tsx` |
| WEB-064 | PASS | `ui/auditoria.test.tsx` |
| WEB-065 | PASS | `ui/a11y.test.tsx` |
| WEB-066 | PASS | `qa/e2e-fluxos.test.ts` (10 passando) |
| WEB-067 | Cancelado | Q12 |
| WEB-068 | PASS | `env-documentada.test.ts` |
| WEB-069 | PASS | `build.test.ts`, `verificar:build` exit 0 com 307 |
| WEB-070 | PASS | README com saneamento, decisão de emoji e riscos aceitos (W6, W8, W13) |
| WEB-071 | PASS | audit sem alta/crítica |

## 10. Para o usuário (o ciclo 3 era o último; o orquestrador leva isto a você)

1. **backend-dev:** QA-W15 (trocar a lista de invisíveis por `\p{Default_Ignorable_Code_Point}` + U+2800 + U+16FE4), QA-W16 (sanear o nome do membro em `obterMembro` e dentro do `limpo` dos embeds, o que também fecha QA-W18), QA-W20 (relógio simulado em `sessao.test.ts:37`). São mudanças pequenas e localizadas; os testes do QA já estão prontos e só passam quando a correção estiver certa.
2. **architect/usuário:** decidir QA-W19 (recusar mistura de alfabetos ou aceitar o risco) e QA-W17 (opcional).
3. **Usuário:** confirmar a revogação da chave do Firebase do bot que está no commit `74513cc`.

VEREDITO: FAIL
