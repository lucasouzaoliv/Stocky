# Arquitetura do Stocky — contrato técnico (STK-001 a STK-025)

Autor: `architect` · 31/10/2026 · Fonte: código lido em `index.js`, `start.js`, `deploy-commands.js`, `utils/*`, `commands/*`, `interactions/*`, `package.json`, `eslint.config.js`, `test/`.
Este documento é o contrato entre `backend-dev` (B), `frontend-dev` (F) e `qa-engineer` (QA). Mudou assinatura? Pare e volte ao architect.

---

## 1. Estado atual (o que o código faz hoje)

- **Firestore**: `bau/{membros|gerencia}` = **um documento por baú**; cada campo é `"<categoriaId>__<itemId>": { nome, categoria, categoriaId, quantidade }`. `getBau` devolve o mapa inteiro e `embedInventario` itera `Object.values(bau)` (logo **nenhum campo que não seja item pode morar nesse documento**). `catalogo/items` = um documento com `{ [categoriaId]: { nome, emoji, items: [{id, nome}] } }`, criado com `CATALOGO_PADRAO` na primeira leitura. `caixa/saldo` = `{ sujo, limpo }`. Logs: `logs/{tipo}/entradas` (movimentação do baú) e `caixa/logs/entradas` (caixa), ambos com `timestamp` ISO.
- Todas as escritas são ler-alterar-`set` sem transação (`adicionarAoBau`, `removerDoBau`, `adicionarCaixa`, `retirarCaixa`, `adicionarItemAoCatalogo`, `removerItemDoCatalogo`, ajuste em massa e remoção de item dos baús direto em `gerencia-*`).
- `config.json` é lido com `require` **no carregamento** de 10 módulos (`index`, `deploy-commands`, `utils/embeds`, `utils/permissoes`, `commands/*`, `interactions/{bau-quantidade,caixa-modal,gerencia-ajustar,gerencia-selects}`). Como `config.json` não existe no repo, **nenhum desses módulos pode ser carregado num teste hoje**. Isso bloqueia toda a suíte e entrou no escopo de STK-022/STK-018.
- Roteamento: `index.js` registra por `customIds` + `type` e casa `customId === id || startsWith(id + ':')`. Todos os ids usam `:` como separador de argumentos.
- Permissão: só `caixa-menu` checa (`podeUsarBauGerencia`), e quebra em DM (`member` nulo). O **Baú da Gerência** (`bau_*:gerencia`) é operável por qualquer pessoa: hoje nenhum handler `bau-*` olha o `tipo`.
- `GatewayIntentBits.GuildMessages` não é necessária: `channel.messages.fetch` é REST e não depende da intent. Pode remover.
- Lint: 12 erros, todos em `interactions/` (donos: F).

## 2. Arquitetura alvo

```
start.js ──▶ utils/config.getConfig() + utils/firebase.validarEnvFirebase()   (falha cedo, mensagem clara)
   └─▶ index.iniciar() ──▶ utils/roteador.carregarHandlers()  (falha se handler sem `permissao`)
                         └─▶ on InteractionCreate ─▶ roteador.rotearInteracao()
                                 1. resolve handler pelo id base (antes do primeiro ':')
                                 2. resolve nível exigido (handler.permissao)
                                 3. permissoes.exigirNivel()  ── negado ─▶ resposta efêmera, fim
                                 4. handler.execute(interaction, client)
                                 5. catch: log + resposta efêmera genérica
handlers (interactions/, commands/)  ── UI: utils/ui.js, utils/embeds.js, utils/painel.js
        │                                    utils/ajuste-texto.js, utils/ajustes-pendentes.js
        ▼
utils/db.js, utils/caixa.js  ── só transações (runTransaction) ── utils/firebase.getDb()  (injetável: setDb)
utils/validacao.js  (parser estrito, limites, ErroValidacao, gerarIdItem)   ← usado por back e front
```

## 3. Decisões (ADRs curtos)

### ADR-01 Atomicidade: `runTransaction` em todas as escritas de estoque, saldo e catálogo
- **Contexto**: o baú é **um documento com chaves `categoria__item`**; a regra "não deixar negativo" e "apagar a chave ao chegar em 0" exige ler antes de gravar. `FieldValue.increment` não sabe checar saldo mínimo nem apagar a chave, e `update()` com chave contendo `.` seria interpretado como caminho aninhado.
- **Decisão**: toda função que altera `bau/*`, `caixa/saldo` ou `catalogo/items` roda dentro de `db.runTransaction(async tx => { leituras...; escritas... })`. Dentro da transação é permitido `tx.set(ref, docInteiro)` (é atômico). **Não** usamos `FieldValue.increment` em produção (uma técnica só, fake mais simples, mesma regra para baú e caixa). Leituras sempre antes de escritas (regra do Firestore, o fake obriga).
- **Consequência**: a Firestore reexecuta a transação em conflito (até 5 vezes), então o callback deve ser **puro** (sem efeitos no Discord, sem `console.log` de negócio). Limite de 1 MB por documento: ~100 itens por baú usam < 20 KB; sem risco no horizonte. O critério "não usa `set` do documento inteiro" (STK-007/008) foi trocado por "nenhuma escrita fora de transação".

### ADR-02 Injeção do Firestore para testes
- **Decisão**: `utils/firebase.js` exporta `getDb()`, `setDb(db)`, `resetDb()`. Com `setDb`, `getDb` devolve o objeto injetado e **nunca** toca `firebase-admin`. Sem injeção, `getDb` valida as variáveis (ADR-08) e só então inicializa o admin. Todo módulo chama `getDb()` **dentro** de cada função (já é assim), nunca no topo do arquivo.
- **Consequência**: testes fazem `setDb(criarFakeFirestore())` no `beforeEach` e `resetDb()` no `afterEach`. Nenhum teste precisa de rede nem de variável `FIREBASE_*`.

### ADR-03 Configuração carregada sob demanda (`utils/config.js`)
- **Contexto**: `require('../config.json')` no topo impede carregar módulos em teste e esconde variável ausente (`undefined`).
- **Decisão**: novo `utils/config.js` (dono B) com `getConfig()` cacheado: `setConfig` (testes) > `config.json` se existir (dev local) > montado de `process.env` (Railway). `start.js` **deixa de gravar** `config.json`. Todo consumidor troca `require('../config.json')` por `getConfig()` chamado dentro da função (F em STK-018, B nos arquivos dele em STK-022).

### ADR-04 Parser numérico estrito e limites finais
- Regra: após `trim()`, a string deve casar `/^\d+$/` (só dígitos ASCII; zeros à esquerda aceitos, `"007"` = 7). Rejeita sinal, ponto, vírgula, espaço interno, expoente, dígito unicode e qualquer não-string. Mais de 15 dígitos é inválido antes de converter.
- **Limites (decididos, exportados em `LIMITES`)**:

| Constante | Valor | Onde vale |
|---|---|---|
| `QUANTIDADE_ITEM_MAX` | **100 000** por operação | adicionar/remover no baú, cada linha do ajuste em massa |
| `VALOR_CAIXA_MAX` | **1 000 000 000** (US$ 1 bi) por operação | adicionar/retirar no caixa |
| `NOME_ITEM_MAX` | **50** caracteres (após `trim` e colapso de espaços) | cadastro no catálogo; também `ID_ITEM_MAX = 50` |
| `ITENS_POR_CATEGORIA_MAX` | **25** | limite de opções de um select do Discord |
| `ANOTACAO_MAX` | **100** | anotação do caixa (já é o `maxLength` do modal) |
| `AJUSTE_LINHAS_MAX` | **200** | linhas úteis do ajuste em massa |

- Mínimo: 1 em todas as operações, exceto ajuste em massa (0 = remove o item). Saldo/estoque acumulado não tem teto próprio; o back recusa se o resultado passar de `Number.MAX_SAFE_INTEGER`.
- `maxLength` dos modais: quantidade **6**, valor **10**, nome do item **50**.

### ADR-05 Permissão centralizada: declarada no handler, **aplicada no roteador**
- **Opções**: (a) tabela por prefixo de `customId` no `index.js`; (b) chamada no início de cada handler. (a) separa a regra do handler e quebra calada quando alguém cria id novo; (b) depende de ninguém esquecer.
- **Decisão**: cada módulo de `interactions/` e `commands/` **exporta `permissao`** (`'membro' | 'gerente' | 'dono'` ou função `(interaction) => nível`). `roteador.carregarHandlers` **lança erro na inicialização** se algum módulo não declarar `permissao` válida (fail-closed: o bot nem sobe). `roteador.rotearInteracao` chama `permissoes.exigirNivel` **antes** de `execute`, então a negação é sempre a primeira resposta (vale também para quem abre modal: o `showModal` só acontece se permitido). Não existe nível "público".
- Hierarquia: `dono (3) ⊃ gerente (2) ⊃ membro (1)`. DM → negado com mensagem própria. Cargo não configurado → negado.
- Baú: `permissao` é função; `tipo === 'gerencia'` exige `gerente`, `tipo === 'membros'` exige `membro`, tipo desconhecido devolve `null` → negado.
- `/setup` e `/setup-caixa`: `gerente` (mesmo público do painel). Ver pergunta P3.

### ADR-06 Módulo único de UI
- `utils/ui.js` (dono F): linhas de botões e embeds do caixa que hoje estão copiados. `utils/embeds.js` continua com os embeds atuais (sem `require` de config no topo). `utils/painel.js` (F): atualização dos painéis fixos (IO). `utils/ajuste-texto.js` (F): parser puro do texto do ajuste em massa. `utils/ajustes-pendentes.js` (F): memória das confirmações pendentes.
- Correção junto: `gerencia-modals` e `gerencia-selects` hoje reeditam o painel só com `rowMenuGerencia()` e **somem os botões "Ajustar"**. Passa a usar `rowsPainelGerencia()` (as duas linhas).
- Respostas efêmeras usam `flags: MessageFlags.Ephemeral` (discord.js 14.25 desaconselha `ephemeral: true`).

### ADR-07 Id da mensagem dos painéis fixos
- **Decisão**: coleção própria `paineis/{chave}` = `{ canalId, mensagemId, atualizadoEm }`, chaves `inventario_membros`, `inventario_gerencia`, `saldo_caixa`. **Nunca** dentro de `bau/*` (quebraria `getBau`/`embedInventario`). Inclui o painel de saldo do caixa (`caixa-modal`, 4ª cópia da mesma lógica).
- Migração: sem id guardado, faz **uma vez** a busca antiga (última mensagem do bot nas 10 últimas), adota e grava o id; nas próximas, só pelo id. Mensagem apagada (404) → envia nova e grava.

### ADR-08 Segredos e variáveis
- `utils/firebase.js` sem nenhum fallback (inclusive o `client_id` literal). Obrigatórias: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY_ID`. `\n` literal vira quebra de linha. Erro lista **todas** as ausentes.
- Bot: `TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ROLE_MEMBRO`, `ROLE_GERENTE`, `ROLE_DONO` e os 10 `CH_*` (todos obrigatórios; `COR` opcional). Ver pergunta P2.

### ADR-09 Roteamento unificado
- `utils/roteador.js` (B, novo) com mapa por tipo e **id base** (`customId.split(':')[0]`), lookup O(1), equivalente ao `startsWith(id + ':')` atual. `index.js` fica fino: `INTENTS = [Guilds]`, `criarCliente()`, `iniciar()`; só faz login via `iniciar()` (chamado por `start.js` ou quando `require.main === module`). Sem log por interação; logs de erro mantidos. `unhandledRejection` → log; `uncaughtException` → log e `exit(1)` (o Railway reinicia).

### ADR-10 Auditoria
- Coleção nova `auditoria` (doc id automático), **gravada na mesma transação** da operação. Não vai para `logs/{tipo}/entradas` porque a tela "Ver Logs" renderiza `l.item.nome` e quebraria.
- Formato:
```js
{
  acao: 'catalogo.remover_item' | 'bau.zerar' | 'bau.ajuste_massa',
  usuarioId: string, usuarioTag: string,
  timestamp: string,            // ISO 8601, new Date().toISOString()
  alvo: {...}, antes: {...}, depois: {...} | null
}
```
| acao | alvo | antes | depois |
|---|---|---|---|
| `catalogo.remover_item` | `{ categoriaId, itemId, nomeItem }` | `{ catalogo: {id, nome}, membros: qtd, gerencia: qtd }` (0 se não havia) | `null` |
| `bau.zerar` | `{ tipos: ['membros'] \| ['gerencia'] \| ['membros','gerencia'] }` | `{ membros?: { [chave]: qtd }, gerencia?: {...} }` | `{ membros?: {}, gerencia?: {} }` |
| `bau.ajuste_massa` | `{ tipo }` | `{ [chave]: qtdAnterior }` (0 se não existia), só chaves alteradas | `{ [chave]: qtdNova }` (0 = removido) |

- Leitura: `getAuditoria({ limite })` existe no back; tela para ler a auditoria é card novo (N2).

### ADR-11 Modelo de erro das funções de `utils/`
- Entrada inválida vinda de código (tipo desconhecido, quantidade fora do limite, `usuario` ausente) → **lança `ErroValidacao`** (front deveria ter validado antes; o roteador mostra erro genérico).
- Regra de negócio (estoque/saldo insuficiente, item inexistente, duplicado) → **retorna** `{ sucesso: false, motivo }` com `motivo` pronto para o usuário (pt-BR).
- Falha de infraestrutura (Firestore) → a Promise rejeita com o erro original.
- Para não quebrar os handlers no meio do caminho, os retornos de `adicionarAoBau` (número) e `adicionarCaixa` (`{sujo, limpo}`) **não mudam**.

---

## 4. CONTRATO

Convenções: `Tipo = 'membros' | 'gerencia'`, `TipoCaixa = 'sujo' | 'limpo'`, `Usuario = { id: string, tag: string }` (passar `interaction.user`), `Chave = \`${categoriaId}__${itemId}\``, `Nivel = 'membro' | 'gerente' | 'dono'`.

### 4.1 `utils/validacao.js` (B, novo, STK-011/STK-016)
```js
LIMITES = Object.freeze({ QUANTIDADE_ITEM_MAX: 100000, VALOR_CAIXA_MAX: 1000000000, NOME_ITEM_MAX: 50,
  ID_ITEM_MAX: 50, ITENS_POR_CATEGORIA_MAX: 25, ANOTACAO_MAX: 100, AJUSTE_LINHAS_MAX: 200 })
TIPOS_BAU = Object.freeze(['membros', 'gerencia'])
TIPOS_CAIXA = Object.freeze(['sujo', 'limpo'])
class ErroValidacao extends Error   // name = 'ErroValidacao'; message = texto amigável pt-BR

parseInteiro(texto: unknown, { min = 1, max = Number.MAX_SAFE_INTEGER } = {})
  → { ok: true, valor: number } | { ok: false, erro: string }
  // erros (texto exato): "Digite apenas números inteiros, sem pontos, vírgulas ou sinais."
  //                      "O valor mínimo é {min}."
  //                      "Valor acima do limite (máx. {max em pt-BR})."
parseInteiroPositivo(texto, { max } = {}) → mesmo retorno; atalho de parseInteiro com min 1
exigirInteiro(valor: unknown, { min, max, campo }) → number   // lança ErroValidacao; uso interno do back
gerarIdItem(nome: string) → string
  // minúsculas, NFD sem acentos, tudo fora de [a-z0-9] vira '_', colapsa '_+', apara '_', corta em 50; pode devolver ''
validarNomeItem(nome: unknown) → { ok: true, nome: string, id: string } | { ok: false, erro: string }
  // nome = trim + espaços colapsados; 1..50 chars; id = gerarIdItem(nome) não vazio
```
Exemplo: `parseInteiroPositivo('100001', { max: LIMITES.QUANTIDADE_ITEM_MAX })` → `{ ok: false, erro: 'Valor acima do limite (máx. 100.000).' }`.

### 4.2 `utils/firebase.js` (B, STK-001)
```js
VARIAVEIS_FIREBASE = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_PRIVATE_KEY_ID']
validarEnvFirebase(env = process.env) → void   // lança Error: "Variáveis de ambiente ausentes: X, Y" (vazio/só espaço = ausente)
montarCredencialFirebase(env = process.env) → { projectId, clientEmail, privateKey, privateKeyId }  // chama validarEnvFirebase; troca '\\n' por '\n'
getDb() → Firestore            // injetado se houver; senão valida env, initializeApp uma vez, admin.firestore()
setDb(db: object) → void
resetDb() → void               // remove a injeção (não desfaz initializeApp)
```

### 4.3 `utils/config.js` (B, novo, STK-022)
```js
VARIAVEIS_OBRIGATORIAS = ['TOKEN','CLIENT_ID','GUILD_ID','ROLE_MEMBRO','ROLE_GERENTE','ROLE_DONO',
  'CH_BAU_MEMBROS','CH_BAU_GERENCIA','CH_LOG_MEMBROS','CH_LOG_GERENCIA','CH_INV_MEMBROS','CH_INV_GERENCIA',
  'CH_PAINEL_GERENCIA','CH_CAIXA','CH_LOG_CAIXA','CH_SALDO_CAIXA']
montarConfigDeEnv(env = process.env) → Config   // mesmo formato do config.example.json; lança ErroConfig listando TODAS as ausentes
validarConfig(config) → Config                  // lança ErroConfig se algum campo obrigatório vazio, undefined ou "undefined"
getConfig() → Config                            // cache: setConfig > config.json (validado) > montarConfigDeEnv(process.env)
setConfig(config) → void ; resetConfig() → void
class ErroConfig extends Error
```
`Config = { token, clientId, guildId, channels: { bauMembros, bauGerencia, logMembros, logGerencia, inventarioMembros, inventarioGerencia, painelGerencia, caixaGangue, logCaixa, saldoCaixa }, roles: { membro, gerente, dono }, cor: number }` (`cor` padrão `3447003`).

### 4.4 `utils/permissoes.js` (B, STK-003)
```js
NIVEIS = Object.freeze({ membro: 1, gerente: 2, dono: 3 })
MENSAGENS = { dm: '❌ Use este comando dentro do servidor.', sem_cargo: '❌ Você não tem permissão para isso.', config_ausente: '❌ Cargos do bot não configurados. Avise a administração.' }
getNivel(member) → 0..3          // member nulo → 0; aceita roles.cache.has (GuildMember) e roles: string[] (APIInteractionGuildMember); cargo com id vazio nunca casa
verificarPermissao(interaction, nivel: Nivel)
  → { permitido: true } | { permitido: false, motivo: 'dm' | 'sem_cargo' | 'config_ausente', mensagem: string }
  // ordem: nivel inválido → sem_cargo; !interaction.inGuild() → dm; roles da config ausentes → config_ausente; getNivel < NIVEIS[nivel] → sem_cargo
negarAcesso(interaction, resultado) → Promise<void>
  // { content: mensagem, flags: MessageFlags.Ephemeral }; reply se !replied && !deferred, senão followUp; nunca lança (loga erro do Discord)
exigirNivel(interaction, nivel) → Promise<boolean>   // verificar + negar; true = pode seguir
// legado mantido null-safe até STK-023: podeUsarBau, podeUsarBauGerencia, podeVerLogs, podeGerenciarCatalogo, podeZerarBau, getNomeNivel
```

### 4.5 `utils/roteador.js` (B, novo, STK-021) e `index.js`
```js
carregarHandlers({ commandsDir, interactionsDir }) → Registro
  // Registro = { comandos: Map<nome, mod>, button: Map<idBase, mod>, select: Map, modal: Map }
  // lança Error (bot não sobe) se: módulo sem `permissao` válida; type fora de button|select|modal;
  //   customId duplicado no mesmo type; customId contendo ':'; comando sem data/execute
resolverHandler(registro, interaction) → { handler, tipo: 'comando'|'button'|'select'|'modal' } | null
resolverNivel(handler, interaction) → Nivel | null   // string ou função; exceção na função → null
rotearInteracao(interaction, registro, client) → Promise<'executado'|'negado'|'sem_handler'|'erro'>  // nunca lança
  // sem handler: ignora (sem resposta, sem log ruidoso); nível null → nega com sem_cargo
  // erro no handler: console.error + { content: '❌ Ocorreu um erro ao processar essa interação.', flags: Ephemeral } por reply ou followUp
registrarHandlersDeProcesso(proc = process, sair = code => process.exit(code)) → void
```
`index.js` exporta `{ INTENTS, criarCliente, iniciar }`; `INTENTS = [GatewayIntentBits.Guilds]`; `iniciar()` lê `getConfig().token`, carrega handlers, registra eventos e faz login. `start.js` exporta `main(env = process.env)`: valida config e Firebase (erro → `console.error` + `process.exitCode = 1`, sem login) e chama `iniciar()`. `deploy-commands.js` usa `getConfig()`.

**Contrato de handler (F cumpre em todos os arquivos):**
```js
module.exports = { type: 'button'|'select'|'modal', customIds: ['id_base', ...], permissao: Nivel | (interaction) => Nivel|null, async execute(interaction, client) {} }
module.exports = { data: SlashCommandBuilder, permissao: Nivel, async execute(interaction, client) {} }   // commands/
```

### 4.6 `utils/db.js` (B)
```js
getBau(tipo) → Promise<{ [Chave]: { nome, categoria, categoriaId, quantidade } }>               // sem mudança (valida tipo)
adicionarAoBau(tipo, categoriaId, itemId, quantidade, nomeItem, nomeCategoria) → Promise<number>  // STK-007; nova qtd; transação
removerDoBau(tipo, categoriaId, itemId, quantidade)
  → Promise<{ sucesso: true, novaQtd } | { sucesso: false, motivo }>    // STK-007; chave apagada ao chegar em 0
  // quantidade inválida (não inteiro, < 1, > QUANTIDADE_ITEM_MAX) e tipo inválido → ErroValidacao, nada gravado
zerarBau(tipo: Tipo | 'ambos', usuario) → Promise<{ sucesso: true, tipos: Tipo[] }>               // STK-013; 1 transação + 1 auditoria
removerItemDoCatalogo(categoriaId, itemId, usuario)
  → Promise<{ sucesso: true, removidoDe: { membros: number, gerencia: number } } | { sucesso: false, motivo }>  // STK-013
ajustarBauEmMassa(tipo, mudancas: Array<{ categoriaId, itemId, quantidade }>, usuario)
  → Promise<{ sucesso: true, alterados: number } | { sucesso: false, motivo, invalidos: Array<{ categoriaId, itemId, motivo }> }>
  // STK-013; quantidade 0..QUANTIDADE_ITEM_MAX (0 remove); item precisa existir no catálogo (lido na transação);
  // chave repetida ou lista vazia ou > AJUSTE_LINHAS_MAX → { sucesso:false }; tudo ou nada; alterados = itens cujo valor mudou;
  // itens fora de `mudancas` ficam como estão; auditoria só se alterados > 0
adicionarItemAoCatalogo(categoriaId, nomeItem)
  → Promise<{ sucesso: true, item: { id, nome } } | { sucesso: false, motivo }>    // STK-016 (B): assinatura NOVA
  // valida com validarNomeItem; recusa: categoria inexistente, id já existe, nome igual (sem caixa/acentos) já existe, categoria com 25 itens
getCatalogo(), getCategorias(), getItensDaCategoria(categoriaId)   // sem mudança
getAuditoria({ limite = 10 } = {}) → Promise<Array<Auditoria>>    // STK-013; orderBy timestamp desc
CHAVES_PAINEL = Object.freeze({ INVENTARIO_MEMBROS: 'inventario_membros', INVENTARIO_GERENCIA: 'inventario_gerencia', SALDO_CAIXA: 'saldo_caixa' })
salvarMensagemPainel(chave, canalId, mensagemId) → Promise<void>                    // STK-019; chave fora de CHAVES_PAINEL → ErroValidacao
obterMensagemPainel(chave) → Promise<{ canalId, mensagemId } | null>                // STK-019
addLog(tipo, entrada), getLogs(tipo)                                                 // sem mudança
```
`usuario` ausente ou sem `id` → `ErroValidacao` em `zerarBau`, `removerItemDoCatalogo`, `ajustarBauEmMassa`.

### 4.7 `utils/caixa.js` (B, STK-008)
```js
getSaldo() → Promise<{ sujo: number, limpo: number }>   // campo ausente vira 0
adicionarCaixa(tipo: TipoCaixa, valor) → Promise<{ sujo, limpo }>                       // retorno inalterado; transação
retirarCaixa(tipo, valor) → Promise<{ sucesso: true, saldo } | { sucesso: false, motivo }>  // nunca negativo
  // tipo inválido ou valor fora de 1..VALOR_CAIXA_MAX → ErroValidacao, nada gravado
addLogCaixa(entrada), getLogsCaixa()   // sem mudança; o log continua sendo gravado pelo caixa-modal (F)
```

### 4.8 `utils/ui.js` (F, novo, STK-018)
```js
respostaEfemera(payload: object) → object                // { ...payload, flags: MessageFlags.Ephemeral }
formatarDinheiro(n: number) → string                     // '$1.000' (pt-BR)
rowMenuBau(tipo) → ActionRowBuilder                       // bau_adicionar:tipo (Success), bau_remover:tipo (Danger), bau_estoque:tipo (Primary)
rowCancelarBau(tipo) → ActionRowBuilder                   // bau_cancelar:tipo
rowMenuGerencia() → ActionRowBuilder                      // ger_adicionar_item, ger_remover_item, ger_zerar_bau, ger_ver_logs
rowMenuGerencia2() → ActionRowBuilder                     // ger_ajustar_membros, ger_ajustar_gerencia
rowsPainelGerencia() → [ActionRowBuilder, ActionRowBuilder]
rowCancelarGerencia() → ActionRowBuilder                  // ger_cancelar
rowCaixa() → ActionRowBuilder                             // caixa_adicionar, caixa_retirar, caixa_logs
rowConfirmarAjuste(pendenteId) → ActionRowBuilder         // ger_ajuste_confirmar:<id> (Success), ger_ajuste_cancelar:<id> (Secondary)
embedCaixa(saldo) → EmbedBuilder                          // aceita campos ausentes (0)
embedLogCaixa(acao, usuario, tipo, valor, anotacao, saldo) → EmbedBuilder
embedHistoricoCaixa(logs) → EmbedBuilder
embedLogsBau(tipo, logs) → EmbedBuilder
embedResumoAjuste(tipo, linhas: Array<{ nome, categoria, antes, depois }>) → EmbedBuilder   // trunca em 4096 com "… e mais N"
```
Rótulos, estilos e ids iguais aos atuais. `utils/embeds.js` mantém suas exportações; `embedInventario(bau, tipo)` continua `async` e passa a truncar cada campo em 1024 caracteres (STK-010).

### 4.9 `utils/painel.js` (F, novo, STK-020)
```js
atualizarPainelInventario(client, tipo) → Promise<{ ok: boolean, acao: 'editado'|'enviado'|'ignorado'|'erro' }>   // nunca lança
atualizarPainelSaldo(client, saldo?) → Promise<mesmo retorno>   // saldo ausente → getSaldo()
```
Usa `obterMensagemPainel`/`salvarMensagemPainel` (B), canal do `getConfig().channels`, `getBau` + `embedInventario`. `ignorado` = canal não encontrado.

### 4.10 `utils/ajuste-texto.js` e `utils/ajustes-pendentes.js` (F, novos, STK-015)
```js
gerarTextoAjuste(bau, categorias) → string      // "# <nome da categoria>\n<Item>:<qtd>\n..." ; baú vazio → ''
interpretarAjuste(texto, catalogo)
  → { mudancas: Array<{ categoriaId, itemId, nome, quantidade }>, erros: Array<{ numero, linha, motivo }> }
  // linha '# X' define a categoria corrente (casa nome ou id, sem caixa/acentos); '# X' desconhecida → erro
  // separa nome/quantidade no ÚLTIMO ':' ("Pistola: .50:3" → nome "Pistola: .50", qtd 3)
  // dentro de categoria: procura só nela; sem categoria corrente: procura em todas, ambíguo → erro pedindo o cabeçalho
  // quantidade via parseInteiro(min 0, max QUANTIDADE_ITEM_MAX); linha sem ':' → erro; > AJUSTE_LINHAS_MAX → erro
criarPendente({ tipo, mudancas, usuarioId }, agora = Date.now()) → string id (8 hex)
obterPendente(id, agora = Date.now()) → { tipo, mudancas, usuarioId } | null   // expira em 10 min
removerPendente(id) → void
TTL_PENDENTE_MS = 600000 ; MAX_PENDENTES = 50 (descarta o mais antigo)
```
Novo handler `interactions/gerencia-ajuste-confirmar.js` (F): `type: 'button'`, `customIds: ['ger_ajuste_confirmar', 'ger_ajuste_cancelar']`, `permissao: 'gerente'`; só o `usuarioId` que criou pode confirmar.

### 4.11 Helpers de teste

**`test/helpers/fake-firestore.js` — dono B, onda 0**
```js
criarFakeFirestore({ seed = {}, registro = [] } = {}) → fake
  // seed: { 'bau/membros': {...}, 'caixa/saldo': {...}, 'catalogo/items': {...} } (caminhos de documento)
fake.collection(nome) → CollectionRef { id, doc(id?) → DocRef (id automático se omitido), add(data) → Promise<DocRef>,
                                       orderBy(campo, 'asc'|'desc') → Query, limit(n) → Query, get() → Promise<QuerySnapshot> }
DocRef { id, path, get() → Promise<DocSnapshot>, set(data, { merge }?) , update(data) (rejeita se não existe), delete(), collection(nome) }
Query { orderBy, limit, get }      QuerySnapshot { docs: DocSnapshot[], size, empty }      DocSnapshot { id, exists, data() }
fake.runTransaction(fn) → Promise<retorno de fn>
  // tx.get(DocRef|Query), tx.set(ref, data, opts?), tx.update(ref, data), tx.delete(ref), tx.create(ref, data)
  // transações executadas em FILA (uma por vez) → atomicidade real; escritas em buffer aplicadas no commit;
  // fn lança → nada aplicado e a Promise rejeita com o mesmo erro; tx.get depois de escrita → lança Error (regra do Firestore)
fake.FieldValue = { increment(n), delete(), serverTimestamp() }   // entendidos por set(merge)/update/tx.*
fake.falharProximoCommit(erro) → void            // próxima transação rejeita no commit sem aplicar nada
fake.falharEm(op, regexCaminho, erro) → void     // op: 'get'|'set'|'update'|'delete'|'add'
fake.dump() → { [caminhoDoc]: data }             // cópia profunda do estado
fake.chamadas → Array<{ seq, origem: 'db', op, caminho, emTransacao: boolean }>   // também empurra em `registro`
```
Regras: toda operação fora de transação cede um ciclo (`await new Promise(setImmediate)`) **entre ler e devolver**, para que um ler-alterar-gravar ingênuo perca atualização em `Promise.all` (os testes de concorrência precisam falhar no código atual). `data()` devolve cópia profunda. `orderBy` + `limit` funcionam em subcoleções (`logs/membros/entradas`).

**`test/helpers/fake-interaction.js` — dono F, onda 0**
```js
criarInteracao({ tipo: 'button'|'select'|'modal'|'comando', customId, values = [], campos = {}, commandName, opcoes = {},
                 cargos = [], emDM = false, semMembro = false, rolesComoArray = false,
                 usuario = { id: 'u1', tag: 'user#0001' }, client, message, registro = [] }) → interaction
  // isButton/isStringSelectMenu/isModalSubmit/isChatInputCommand, inGuild(), guild/guildId (null em DM), member (null em DM/semMembro)
  // fields.getTextInputValue(id) (lança se ausente), options.getString(nome)
  // reply, deferReply, deferUpdate, editReply, followUp, update, showModal: espiões que atualizam replied/deferred
  // ESTRITO como o Discord: reply/deferX/showModal depois de já respondido → lança; showModal depois de defer → lança; editReply sem resposta → lança
  // message.edit espião; interaction.chamadas = [{ seq, origem: 'interaction', metodo, payload }] (também em `registro`)
criarCanalFalso({ id, mensagens = [] }) → canal   // send() → mensagem { id, edit() }, messages.fetch(id) (rejeita { code: 10008 } se não existe), messages.fetch({ limit })
criarClientFalso({ canais = [], userId = 'bot' }) → client   // channels.cache.get(id), channels.fetch(id), user.id
```
`registro` compartilhado entre os dois fakes dá a ordem global (`seq`) para provar "defer antes de ler o banco".

**`test/helpers/config-teste.js` — dono B, onda 0**: exporta `CONFIG_TESTE` (ids fixos: `roles.membro = 'r-membro'`, `roles.gerente = 'r-gerente'`, `roles.dono = 'r-dono'`, canais `c-*`) e `usarConfigTeste()` que chama `setConfig(CONFIG_TESTE)`.

---

## 5. Donos de arquivo e ondas

Regra: dentro de uma onda, B e F nunca tocam o mesmo arquivo. Um agente pode encadear cards no mesmo arquivo dentro da própria onda.

| Onda | backend-dev (B) | frontend-dev (F) | Depende de |
|---|---|---|---|
| **0 Fundação** | `test/helpers/fake-firestore.js` (+ `test/fake-firestore.test.js`), `test/helpers/config-teste.js`, **STK-001** (`utils/firebase.js`), **STK-022a** (`utils/config.js`), **STK-011** (`utils/validacao.js`), **STK-002** (`.gitignore`), **STK-024** (`package.json`) | `test/helpers/fake-interaction.js` (+ autoteste), **STK-018a** (`utils/ui.js` + `test/ui.test.js`) | nada |
| **1** | **STK-003** (`permissoes.js`), **STK-021** (`utils/roteador.js`, `index.js`), **STK-022b** (`start.js`, `deploy-commands.js`), **STK-007** (`db.js`), **STK-008** (`caixa.js`) | **STK-018b** (varredura: todos `interactions/*`, `commands/*`, `utils/embeds.js` passam a usar `ui.js` e `getConfig()`), **STK-009**, **STK-010**, **STK-017** | onda 0 (`config.js`, `ui.js`, fakes) |
| **2** | **STK-013**, **STK-016b**, **STK-019** (todos em `db.js`) | **STK-004**, **STK-005**, **STK-006** (declarar `permissao` em todos os handlers/comandos, migrar `caixa-menu`; testes via `rotearInteracao`), **STK-012** (`bau-quantidade`, `caixa-modal`) | roteador e permissões da onda 1 |
| **3** | **STK-025** (`README.md`) | **STK-014**, **STK-015**, **STK-016f**, **STK-020** (`gerencia-*`, `bau-quantidade`, `caixa-modal`, novos `utils/painel.js`, `utils/ajuste-texto.js`, `utils/ajustes-pendentes.js`, `interactions/gerencia-ajuste-confirmar.js`) | db.js da onda 2 |
| **4** | **STK-023** nos arquivos de B | **STK-023** nos arquivos de F | tudo |
| **QA** | portão único depois da onda 4 (recomendo uma checagem rápida do QA ao fim de cada onda, sem veredito) | | |

Observações:
- Na onda 0 o B entrega primeiro `utils/config.js` e `fake-firestore.js`: o F só consegue rodar testes de handler quando eles existem (o contrato já permite codar antes).
- Entre o fim da onda 1 e o fim da onda 2 o bot real não sobe (o roteador exige `permissao` e os handlers só a declaram na onda 2). Os testes do roteador na onda 1 usam pastas de fixture em `test/fixtures/`; o teste de cobertura com as pastas reais é de STK-006 (onda 2).
- Entre ondas 2 e 3 o `gerencia-modals` (F) ainda chama a assinatura antiga de `adicionarItemAoCatalogo`, e `gerencia-selects` a antiga de `zerarBau`. É estado intermediário aceito: nada é commitado antes do PASS.
- Nenhum agente edita `docs/backlog.md` além do `jira-manager`; nenhum edita este arquivo além do architect.

## 6. Como o QA prova cada card

Todos: DoD do WORKFLOW (lint 0/0, `npm test` verde sem skip/`.only`, `node --check`, varredura de segredos, `git ls-files | grep -c ^node_modules/` = 0). Testes de handler sempre com `setDb(fake)`, `usarConfigTeste()` e `criarInteracao`.

| Card | Provas (arquivo → cenários) |
|---|---|
| STK-001 | `test/firebase.test.js`: `montarCredencialFirebase` com 4 vars falsas; 1 teste por var ausente e por var só com espaços (mensagem cita o nome); `\\n`→`\n`; `getDb()` após `setDb(fake)` devolve o fake sem chamar admin; `getDb()` sem env lança antes de `initializeApp` (espião). `test/segredos.test.js`: `git grep` sem `BEGIN PRIVATE KEY`, `private_key_id"\s*:`, `iam.gserviceaccount.com`, `client_id` literal. |
| STK-002 | `test/repo-hygiene.test.js`: `.gitignore` tem `node_modules/`, `.env`, `config.json`; `git ls-files` sem `node_modules/`, `config.json`, `.env`; sem `.git` → `assert.fail` explícito com mensagem. |
| STK-003 | `test/permissoes.test.js`: tabela nível × cargo (nenhum, membro, gerente, dono) × exigido; `member` nulo/indefinido → 0; `roles` como array; DM → `motivo: 'dm'`; roles da config vazias → `config_ausente`; `negarAcesso` em interação nova (reply) e deferida (followUp), uma chamada só, `flags` efêmera; Discord rejeitando a resposta → não lança. |
| STK-004 | `test/bau-permissoes.test.js` via `rotearInteracao` para os 4 handlers × tipo `membros`/`gerencia`: sem cargo → `'negado'`, 0 chamadas no fake; membro em `membros` → executa; membro em `gerencia` → negado; gerente em `gerencia` → executa; tipo forjado (`bau_adicionar:xyz`) → negado; DM → mensagem de DM. Negação é a 1ª e única resposta, antes de `showModal`/`deferUpdate`. |
| STK-005 | `test/gerencia-permissoes.test.js`: os 5 handlers + `gerencia-ajuste-confirmar` × (sem cargo, membro, gerente, dono, DM); membro tentando `ger_zerar_confirmar`, `ger_item_remover:x`, `ger_modal_ajustar:membros` → nenhuma escrita (`fake.chamadas` sem set/update/tx). `ger_abrir_modal_ajustar` permitido → `showModal` é a 1ª chamada. |
| STK-006 | `test/caixa-setup-permissoes.test.js`: `caixa-modal`, `caixa-menu`, `/setup`, `/setup-caixa` × (sem cargo, membro, gerente, DM); negado → nenhum `canal.send`, nenhuma escrita. `test/roteador-cobertura.test.js`: carrega `interactions/` e `commands/` reais e falha se algum módulo não tiver `permissao`; módulo de teste sem `permissao` faz `carregarHandlers` lançar. |
| STK-007 | `test/db-bau.test.js`: `Promise.all` +5/+7 → 12; remoções 6+6 com estoque 10 → uma `sucesso:false`, estoque 4; itens diferentes em paralelo preservados; remover até 0 apaga a chave; quantidade 0, -1, 1.5, '5', 100001 → `ErroValidacao` e `dump()` igual; tipo inválido → `ErroValidacao`; toda escrita com `emTransacao: true`. O teste de concorrência deve **falhar** com o código antigo (QA confirma revertendo localmente). |
| STK-008 | `test/caixa.test.js`: análogo ao 007 para `sujo` e `limpo`; documento inexistente; `NaN`, 0, -1, 1.5, 1e9+1 → erro sem gravar; `retirarCaixa` exato no saldo → 0. |
| STK-009 | `test/setup-caixa.test.js`: embed com `$1.500` e `$300` do fake; sem documento → `$0`; nenhum campo com `undefined`/`[object Promise]`; `deferReply` antes da 1ª leitura (`registro`); canal ausente → resposta efêmera. |
| STK-010 | `test/bau-menu.test.js`: `editReply.embeds` sem Promise e com itens do fake; baú vazio → "Nenhum item"; `getBau` rejeitando → `followUp` efêmero + painel restaurado; `deferUpdate` antes da leitura; categoria com 25 itens de nome longo → nenhum campo > 1024. |
| STK-011 | `test/validacao.test.js`: todos os valores do critério 2, `"007"`, `"١٢"` (dígito árabe), `"10 0"`, `"9999999999999999"`; máximo exato aceito, máximo+1 com "acima do limite"; `LIMITES` com os valores deste documento e congelado; `gerarIdItem`/`validarNomeItem` (acentos, só símbolos, `/`, 51 chars). |
| STK-012 | `test/validacao-handlers.test.js`: `bau-quantidade` com `"10abc"`, `"100001"` → erro efêmero, 0 escritas; `"10"` grava 10. `caixa-modal` com `"-50"`, `"1.000,50"`, `"1000000001"` → erro; `"500"` grava 500 e `addLogCaixa` chamado 1 vez; retirada recusada → 0 logs; mensagens sem stack. |
| STK-013 | `test/db-auditoria.test.js`: `removerItemDoCatalogo` remove do catálogo e dos 2 baús e grava 1 auditoria; `falharProximoCommit` → `dump()` idêntico, 0 auditorias; `zerarBau('membros')` não toca `gerencia`; `'ambos'` 1 transação; ajuste com 1 item inexistente → `sucesso:false`, nada alterado; formato do documento de auditoria exatamente o da ADR-10; `usuario` ausente → `ErroValidacao`; `getAuditoria` ordena desc. |
| STK-014 | `test/gerencia-selects.test.js`: chama `removerItemDoCatalogo(cat, item, interaction.user)` e `zerarBau(tipo, interaction.user)`; `sucesso:false` → efêmero amigável; Firestore rejeitando → erro amigável sem lançar; arquivo não importa `getDb` (varredura) e não faz escrita direta; `deferUpdate` antes do banco; painel reeditado com `rowsPainelGerencia()` (2 linhas). |
| STK-015 | `test/ajuste-texto.test.js` (puro): `"Pistola: .50:3"`; mesmo nome em 2 categorias com cabeçalhos; sem cabeçalho e ambíguo → erro; `"Gaze:10abc"`, `"Gaze"`, cabeçalho desconhecido → erro com número da linha; 201 linhas → erro; `gerarTextoAjuste` ↔ `interpretarAjuste` ida e volta. `test/gerencia-ajustar.test.js`: `deferReply` antes do banco; resumo + `rowConfirmarAjuste`, 0 escritas; confirmar → `ajustarBauEmMassa` 1 vez com `interaction.user`; cancelar → 0 escritas; outro usuário clicando → negado; pendente expirado → mensagem "refaça"; linha malformada → nada pendente. `gerencia-menu` com baú grande → nenhuma mensagem > 2000 chars nem descrição > 4096. |
| STK-016 | `test/db-catalogo.test.js` (B): `"!!!"`, `""`, 51 chars → recusado; `"Pistola 9mm"` então `"pistola-9mm"` → 2º recusado como duplicado; `"Gaze"` e `"gaze"` → duplicado; 26º item → recusado; 2 cadastros paralelos do mesmo nome → só 1 grava; id nunca vazio nem com `/`. `test/gerencia-modals.test.js` (F): recusa vira efêmero e catálogo intacto; nome válido cadastra; `TextInput` com `maxLength 50`; painel com 2 linhas depois. |
| STK-017 | `test/bau-item.test.js`: item inexistente → efêmero "Item não encontrado", nenhum `showModal`; existente → `showModal` como 1ª resposta e `maxLength 6`; `getItensDaCategoria` rejeitando → efêmero genérico. |
| STK-018 | `test/ui.test.js`: ids, rótulos e estilos de cada row (snapshot dos ids); `embedCaixa({})` sem `undefined`. `test/ui-duplicacao.test.js`: varredura de `interactions/` e `commands/` sem `function rowMenuBau|rowMenuGerencia|rowMenuGerencia2|rowCaixa|embedCaixa|rowCancelar` e sem `require('../config.json')`; todos os ids base usados pelas rows existem no registro do roteador. |
| STK-019 | `test/db-paineis.test.js`: salvar/obter; inexistente → `null`; regravar substitui; `bau/*` intocado (`dump`); chave inválida → `ErroValidacao`. |
| STK-020 | `test/painel.test.js`: id salvo → `messages.fetch(id)` + `edit`, sem `fetch({ limit })`; sem id → busca legada uma vez, adota e salva; mensagem apagada (10008) → `send` + salva novo id; `send` rejeitando → `{ ok:false, acao:'erro' }` sem lançar; canal ausente → `ignorado`; varredura: `messages.fetch({ limit` só existe em `utils/painel.js`. |
| STK-021 | `test/roteador.test.js`: tabela de todos os ids base atuais → handler certo; `bau_item:adicionar:membros:armas` resolve `bau-item`; id desconhecido → `'sem_handler'` sem resposta; handler lançando → `'erro'` + resposta efêmera (reply e followUp); `INTENTS` = `[Guilds]`; `registrarHandlersDeProcesso` com emissor falso (log e `sair(1)` em `uncaughtException`); varredura sem `console.log('... RECEBIDO`. |
| STK-022 | `test/config.test.js` e `test/start.test.js`: env completa → config com os valores; 1 teste por variável obrigatória ausente/vazia (mensagem cita o nome); nenhum `undefined`/`"undefined"`; `main()` com env faltando → `exitCode = 1`, `iniciar` não chamado, `config.json` não criado; `VARIAVEIS_OBRIGATORIAS` exportada. |
| STK-023 | `npm run lint` código 0; varredura sem `eslint-disable` e sem regra nova `off` em `eslint.config.js` (diff contra o commit `86c089e`). |
| STK-024 | `test/package.test.js`: `repository.url`, `bugs.url`, `homepage` com `lucasouzaoliv/stocky`; sem `Luuqee`; `scripts.test`, `scripts.lint`, `engines.node` presentes. |
| STK-025 | `test/readme.test.js`: cada nome de `VARIAVEIS_OBRIGATORIAS` e `VARIAVEIS_FIREBASE` aparece; os 5 comandos `npm`; varredura de segredos vazia; aviso de rotação da chave presente. |

## 7. Riscos

1. **Chave privada do Firebase no histórico de um repositório público.** Remover do código não basta: a chave precisa ser revogada e trocada no Console do Firebase e as 4 variáveis novas cadastradas no Railway **antes** do deploy (sem elas o bot, de propósito, não sobe). Ação do usuário.
2. **Deploy fail-fast**: com todas as variáveis obrigatórias, qualquer `CH_*` ou `ROLE_*` faltando no Railway derruba o bot no boot. Hoje passa calado. Conferir o painel do Railway antes do deploy.
3. **Mudança de comportamento visível**: o Baú da Gerência passa a exigir gerente; `/setup*` passa a exigir gerente; valores com ponto (`50.000`) passam a ser recusados; ajuste em massa passa a exigir confirmação.
4. Confirmações pendentes do ajuste ficam em memória: um restart no Railway entre o resumo e o clique faz o usuário refazer (mensagem clara). Aceito.
5. Painel público compartilhado (N1): enquanto não houver card, dois membros usando o mesmo painel ao mesmo tempo continuam se atrapalhando.

## 8. Problemas novos para o `jira-manager` (não resolvidos aqui)

- **N1** `bau-menu`/`bau-categoria` fazem `deferUpdate` + `editReply` na **mensagem fixa pública** do canal: o fluxo de um membro aparece para todos e dois membros simultâneos sobrescrevem a tela um do outro. Sugestão: fluxo em resposta efêmera (`deferReply` efêmero) e o painel fixo nunca muda. Camada F.
- **N2** A auditoria (ADR-10) não tem tela de leitura. Sugestão: opção "Auditoria" no "Ver Logs" da gerência usando `getAuditoria`. Camada F.
- **N3** Movimentação comum do baú (`addLog` em `bau-quantidade`) é gravada depois da resposta e fora da transação; se falhar, o estoque muda sem log. Sugestão: log na mesma transação de `adicionarAoBau`/`removerDoBau`. Camada B+F.

## 9. Perguntas para o usuário

- **P1** Limites: 100 000 por operação de item, US$ 1 bilhão por operação de caixa, nome com 50 caracteres. Servem para a economia do servidor? (Decidido assim até haver resposta.)
- **P2** Todas as 16 variáveis do bot devem ser obrigatórias (o bot não sobe se faltar uma), ou os canais de log/inventário/saldo podem ser opcionais? (Decidido: obrigatórias.)
- **P3** `/setup` e `/setup-caixa`: liberar para gerente (decidido) ou só para o cargo dono?
- **P4** Recusar `50.000` (decidido: só dígitos) ou aceitar ponto como separador de milhar?
- **P5** `package.json` diz `ISC` e o README diz `MIT`. Qual licença vale? (STK-024 não muda a licença até a resposta.)
- **P6** A chave antiga já foi rotacionada e as variáveis `FIREBASE_*` estão cadastradas no Railway?
