# Backlog do Stocky

Origem: `docs/review-findings.md` (31/10/2026). Jira não configurado (`JIRA_PROJECT_KEY` vazio), então este arquivo é a fonte dos cards. Status possíveis: A fazer, Em andamento, Em revisão QA, Concluído.

Convenções:
- Os helpers de teste são criados na onda 0, antes de qualquer card: `test/helpers/fake-firestore.js` e `test/helpers/config-teste.js` pelo backend-dev, `test/helpers/fake-interaction.js` pelo frontend-dev (contratos em `docs/architecture.md` §4.11). Cada card carrega seus próprios testes.
- Cards que tocam o mesmo arquivo têm dependência entre si para não haver edição concorrente (regra do WORKFLOW).
- Todo card só fecha com a Definition of Done do `docs/WORKFLOW.md` (lint zero, testes verdes, `node --check`, PASS do QA).

## Resumo

| ID | Título | Camada | Prioridade | Dependências | Onda |
|---|---|---|---|---|---|
| STK-001 | Remover credenciais Firebase do código e exigir variáveis de ambiente | back | Highest | - | 0 |
| STK-002 | Garantir `node_modules` fora do git | back | High | - | 0 |
| STK-003 | Centralizar verificação de permissão e tratar DM em `permissoes.js` | back | High | STK-022a | 1 |
| STK-004 | Declarar permissão nos handlers do baú (membro / gerente por tipo) | front | High | STK-003, STK-021 | 2 |
| STK-005 | Declarar permissão de gerente nos handlers de gerência | front | High | STK-003, STK-021 | 2 |
| STK-006 | Declarar permissão de gerente no caixa e nos comandos `/setup*` | front | High | STK-003, STK-021 | 2 |
| STK-007 | Tornar atômicas as operações de estoque do baú | back | High | STK-011, fake-firestore | 1 |
| STK-008 | Tornar atômicas as operações de saldo do caixa | back | High | STK-011, fake-firestore | 1 |
| STK-009 | Corrigir `getSaldo()` sem `await` em `setup-caixa` | front | High | STK-018a, STK-022a | 1 |
| STK-010 | Corrigir `embedInventario` sem `await` em Ver Estoque | front | High | STK-018a, STK-022a | 1 |
| STK-011 | Criar parser numérico estrito com limites | back | Medium | - | 0 |
| STK-012 | Aplicar validação numérica estrita nos handlers | front | Medium | STK-007, STK-008, STK-011 | 2 |
| STK-013 | Criar log de auditoria e tornar atômicas a remoção de item, o zerar baú e o ajuste em massa | back | Medium | STK-007 | 2 |
| STK-014 | Auditar remoção de item e zerar baú em `gerencia-selects` | front | Medium | STK-005, STK-013 | 3 |
| STK-015 | Reforçar o ajuste em massa de inventário | front | Medium | STK-005, STK-011, STK-013 | 3 |
| STK-016 | Gerar id de item seguro e limitar nome (back: `adicionarItemAoCatalogo`; front: `gerencia-modals`) | ambos | Medium | b: STK-007, STK-011 · f: STK-005, STK-016b | b: 2 · f: 3 |
| STK-017 | Tratar item inexistente em `bau-item` | front | Medium | STK-018a | 1 |
| STK-018 | Centralizar componentes de UI duplicados e tirar `config.json` do topo dos módulos | front | Medium | a: - · b: STK-018a, STK-022a | a: 0 · b: 1 |
| STK-019 | Persistir o id da mensagem dos painéis fixos | back | Low | STK-007 | 2 |
| STK-020 | Centralizar a atualização dos painéis fixos (inventário e saldo) | front | Low | STK-018, STK-019 | 3 |
| STK-021 | Unificar roteamento, aplicar permissão no roteador e reduzir ruído de log | back | High | STK-003, STK-022a | 1 |
| STK-022 | Configuração validada (`utils/config.js`) e `start.js` sem gravar `config.json` | back | Medium | - | a: 0 · b: 1 |
| STK-023 | Zerar erros e avisos do ESLint | ambos | Medium | todos os cards de código | 4 |
| STK-024 | Corrigir `package.json` (repositório) | back | Low | - | 0 |
| STK-025 | Completar o README | back | Low | STK-001, STK-022 | 3 |

Contrato, donos de arquivo e ondas: `docs/architecture.md`.

## Ajustes do architect (31/10/2026)

Os cards foram validados contra o código. Mudanças feitas neste arquivo (escopo, critérios e dependências):
- **Bloqueio geral de testes**: 10 módulos fazem `require('../config.json')` no topo e o arquivo não existe no repo. Nenhum handler era testável. STK-022 ganhou `utils/config.js` (`getConfig`/`setConfig`) e STK-018 passou a remover esses `require`. Prioridade de STK-022 subiu para Medium e virou fundação (onda 0).
- **STK-003/004/005/006/021**: a permissão é declarada em cada handler (`permissao`) e aplicada no roteador antes do `execute`; o carregamento falha se algum handler não declarar. STK-021 subiu para High e passou a depender de STK-003. Os cards de front deixam de depender de editar `index.js`.
- **STK-004**: o Baú da Gerência (`bau_*:gerencia`) hoje é operável por qualquer um; agora exige gerente. Critérios ajustados.
- **STK-005**: inclui o novo handler `gerencia-ajuste-confirmar` (de STK-015).
- **STK-006**: inclui `caixa-menu` (migrar a checagem antiga, que quebra em DM) e um teste de cobertura que falha se algum handler ficar sem `permissao`.
- **STK-007/008**: critério "não usa `set` do documento inteiro" trocado por "nenhuma escrita fora de `runTransaction`" (o baú é um documento só com chaves `categoria__item`; `set` dentro da transação é atômico). Quantidade acima do limite também é rejeitada.
- **STK-008**: o histórico do caixa não é gravado por `utils/caixa.js` e sim pelo `caixa-modal`; o critério 4 foi movido para STK-012.
- **STK-010**: adicionado truncamento a 1024 caracteres por campo do embed de inventário.
- **STK-011**: limites fixados (100 000 por item, US$ 1 000 000 000 por operação de caixa, nome 50); inclui `gerarIdItem`/`validarNomeItem` usados por STK-016.
- **STK-012**: dependências trocadas (agora depende dos limites do back, não dos cards de permissão).
- **STK-013**: assinaturas fixadas e auditoria em coleção própria `auditoria` (não em `logs/*`, que a tela de logs renderizaria quebrada).
- **STK-015**: identificação por cabeçalho de categoria e último `:`; confirmação por botão com estado pendente em memória.
- **STK-016**: dividido em parte back (`adicionarItemAoCatalogo` valida, gera id e evita duplicado em transação) e parte front; teto de 25 itens por categoria (limite do select).
- **STK-018**: dividido em 18a (criar `utils/ui.js`) e 18b (migrar todos os handlers). Corrige junto o painel da gerência que perde a 2ª linha de botões após cadastrar/remover item ou zerar baú. Dependências invertidas: 18 vem antes dos outros cards de front, não depois.
- **STK-019/020**: chave do painel em coleção própria `paineis/*` (não no documento do baú) e inclui o painel de saldo do caixa (4ª cópia da lógica, em `caixa-modal`).
- **STK-021**: confirmado no código que `GuildMessages` não é usada (o `messages.fetch` é REST).
- **STK-022**: `start.js` deixa de gravar `config.json`; a config vem de env validada.
- **STK-024**: o `package.json` atual não tem mais `repository`/`bugs`/`homepage` (o bootstrap removeu); o card passa a adicioná-los.
- **STK-025**: dependência de STK-023 removida.
- Problemas novos encontrados (para o jira-manager virar card): N1 fluxo do baú edita a mensagem pública fixa; N2 auditoria sem tela de leitura; N3 log de movimentação fora da transação. Detalhes em `docs/architecture.md` §8.

---

## STK-001 - Remover credenciais Firebase do código e exigir variáveis de ambiente
- Tipo: Bug (segurança) | Prioridade: Highest | Camada: back | Status: A fazer
- Descrição: `utils/firebase.js` traz como fallback uma credencial de conta de serviço (chave privada, id da chave, e-mail, project id) e o repositório é público. Remover todos os fallbacks e exigir `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY_ID` por variável de ambiente, falhando na inicialização com mensagem clara. A rotação da chave no Firebase é ação do usuário, fora do código.
- Critérios de aceite:
  1. Com as 4 variáveis definidas, a inicialização do módulo monta a credencial exclusivamente a partir delas (teste com variáveis falsas e `firebase-admin` simulado).
  2. Para cada variável ausente ou vazia, a inicialização lança erro cuja mensagem cita o nome da variável faltante (um teste por variável).
  3. `\n` literais em `FIREBASE_PRIVATE_KEY` são convertidos em quebras de linha reais.
  4. Varredura automatizada de `utils/firebase.js` e de todo arquivo versionado não encontra `BEGIN PRIVATE KEY`, `private_key_id` com valor literal nem `iam.gserviceaccount.com` hardcoded.
  5. Nenhum teste nem módulo acessa o Firebase real quando as variáveis não existem (o erro ocorre antes de qualquer chamada de rede).
- Arquivos prováveis: `utils/firebase.js`, `test/firebase.test.js`
- Dependências: nenhuma
- Observação: a chave que está no histórico do git deve ser rotacionada pelo usuário; não é critério de código.

## STK-002 - Garantir `node_modules` fora do git
- Tipo: Tarefa (segurança) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: `node_modules/` chegou a ser versionado (3.036 arquivos) apesar do `.gitignore`. Já saiu do índice no bootstrap; falta uma checagem automática para impedir regressão.
- Critérios de aceite:
  1. `.gitignore` contém `node_modules/`, `.env` e `config.json` (teste lê o arquivo).
  2. Teste executa `git ls-files` e falha se algum caminho começar com `node_modules/`; se não houver repositório git, o teste é tratado de forma explícita (não passa em silêncio com falso positivo).
  3. Teste falha se `config.json` ou `.env` aparecerem em `git ls-files`.
- Arquivos prováveis: `.gitignore`, `test/repo-hygiene.test.js`
- Dependências: nenhuma

## STK-003 - Centralizar verificação de permissão e tratar DM em `permissoes.js`
- Tipo: Melhoria (segurança) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: as funções de `utils/permissoes.js` quase não são usadas e assumem `interaction.member`, que é nulo em DM. Criar API única, por exemplo `exigirMembro(interaction)` e `exigirGerente(interaction)`, que devolve resultado utilizável pelos handlers e uma resposta efêmera padronizada de negação.
- Critérios de aceite:
  1. `temCargoMembro` e `temCargoGerente` retornam `false` (sem lançar) quando `interaction.member` é `null` ou `undefined`.
  2. `exigirGerente` retorna negado para usuário sem o cargo de gerente e permitido com o cargo; o mesmo vale para `exigirMembro` (gerente também é aceito como membro, se essa for a regra atual; o teste fixa a regra).
  3. Em DM (`interaction.guild` nulo), a API devolve negado com mensagem distinta ("use dentro de um servidor").
  4. Quando negado, a API responde com `ephemeral: true` uma única vez e não lança, tanto para interações ainda não respondidas quanto já deferidas (usa `editReply`/`followUp` conforme o estado).
  5. Configuração sem cargo definido (ids ausentes) nega por padrão em vez de liberar.
  6. (architect) Regra fixada: `dono ⊃ gerente ⊃ membro`. API conforme `docs/architecture.md` §4.4 (`verificarPermissao`, `negarAcesso`, `exigirNivel`); `roles` como array (membro não cacheado) também funciona.
- Arquivos prováveis: `utils/permissoes.js`, `test/permissoes.test.js` (o `fake-interaction.js` é do frontend-dev, onda 0)
- Dependências: STK-022a (`getConfig`)

## STK-004 - Declarar permissão nos handlers do baú (membro / gerente por tipo)
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: `bau-menu`, `bau-categoria`, `bau-item` e `bau-quantidade` não verificam permissão; qualquer usuário pode mexer no estoque, inclusive no Baú da Gerência. Cada handler declara `permissao` (função: `tipo` `membros` → membro, `gerencia` → gerente, outro → negado); o roteador (STK-021) aplica antes do `execute`.
- Critérios de aceite:
  1. Para cada um dos 4 handlers, usuário sem cargo de membro recebe resposta efêmera de negação e nenhuma função de `utils/db.js` é chamada (espião no db falso).
  2. Para cada handler, usuário com cargo de membro segue o fluxo atual (resposta/atualização normal).
  3. Em DM, cada handler responde com a mensagem de DM e não lança exceção.
  4. A checagem acontece antes de qualquer leitura de banco e antes de `showModal`/`deferUpdate`, sem estourar 3 s (teste: negação ocorre com uma única resposta).
  5. (architect) Membro sem cargo de gerente é negado em `bau_*:gerencia`; gerente e dono são aceitos; `tipo` forjado (ex.: `bau_adicionar:xyz`) é negado.
- Arquivos prováveis: `interactions/bau-menu.js`, `interactions/bau-categoria.js`, `interactions/bau-item.js`, `interactions/bau-quantidade.js`, `test/bau-permissoes.test.js`
- Dependências: STK-003, STK-021

## STK-005 - Exigir gerente nos handlers de gerência
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: `gerencia-menu`, `gerencia-selects`, `gerencia-modals`, `gerencia-abrir-modal` e `gerencia-ajustar` permitem zerar baú, remover item do catálogo e ajustar inventário em massa sem checar cargo de gerente. Aplicar `exigirGerente` em todos.
- Critérios de aceite:
  1. Para cada um dos 5 handlers, usuário sem cargo de gerente recebe negação efêmera e nenhum método de escrita do db é chamado.
  2. Usuário com cargo de gerente mantém o fluxo atual em cada handler.
  3. Membro comum (sem cargo de gerente) não consegue zerar baú, remover item do catálogo nem executar ajuste em massa (um teste por ação).
  4. Em DM, cada handler responde com a mensagem de DM sem lançar exceção.
  5. `gerencia-abrir-modal` verifica a permissão antes de `showModal` e continua chamando `showModal` como primeira resposta quando permitido.
  6. (architect) Vale também para o novo `interactions/gerencia-ajuste-confirmar.js` (criado em STK-015; o teste deste card cobre o handler quando ele existir, na onda 3).
- Arquivos prováveis: `interactions/gerencia-menu.js`, `interactions/gerencia-selects.js`, `interactions/gerencia-modals.js`, `interactions/gerencia-abrir-modal.js`, `interactions/gerencia-ajustar.js`, `test/gerencia-permissoes.test.js`
- Dependências: STK-003, STK-021

## STK-006 - Exigir gerente no `caixa-modal` e nos comandos `/setup*`
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: o modal `caixa-modal` pode ser enviado sem checagem (exige gerente) e `commands/setup*.js` não restringem quem usa. Aplicar `exigirGerente` no modal e restringir os comandos (verificação de cargo/permissão de administrador, ou `setDefaultMemberPermissions` mais checagem em runtime) tratando DM.
- Critérios de aceite:
  1. Submissão do `caixa-modal` por usuário sem cargo de gerente é negada e `adicionarCaixa`/`retirarCaixa` não são chamados.
  2. Submissão por gerente segue o fluxo atual.
  3. `/setup` e `/setup-caixa` executados por usuário sem a permissão exigida respondem negação efêmera e não enviam mensagens de painel nem gravam configuração.
  4. Os mesmos comandos executados por usuário autorizado mantêm o comportamento atual.
  5. Em DM, comandos e modal respondem sem lançar exceção (`interaction.member` nulo).
  6. (architect) `caixa-menu` troca a checagem própria (que quebra em DM) por `permissao: 'gerente'`.
  7. (architect) Teste de cobertura carrega todos os módulos reais de `interactions/` e `commands/` e falha se algum não declarar `permissao`.
- Regra fixada: `/setup` e `/setup-caixa` exigem gerente (pergunta P3 ao usuário em aberto).
- Arquivos prováveis: `interactions/caixa-modal.js`, `interactions/caixa-menu.js`, `commands/setup.js`, `commands/setup-caixa.js`, `test/caixa-setup-permissoes.test.js`, `test/roteador-cobertura.test.js`
- Dependências: STK-003, STK-021

## STK-007 - Tornar atômicas as operações de estoque do baú
- Tipo: Bug (perda de dados) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: `adicionarAoBau` e `removerDoBau` leem o documento inteiro, alteram em memória e gravam com `set`; duas operações simultâneas perdem atualização. Usar transação do Firestore ou `FieldValue.increment`, mantendo as regras atuais (não deixar estoque negativo).
- Critérios de aceite:
  1. Duas chamadas concorrentes de `adicionarAoBau` no mesmo item (ex.: +5 e +7 em `Promise.all`) resultam em estoque somado (12), no Firestore falso com semântica de transação/increment.
  2. Duas chamadas concorrentes de `removerDoBau` cujo total excede o estoque nunca deixam o estoque negativo; a segunda falha com erro/retorno de "estoque insuficiente".
  3. Operações em itens diferentes do mesmo baú não sobrescrevem uma à outra.
  4. Nenhuma escrita em `bau/*` acontece fora de `runTransaction` (teste verifica `emTransacao: true` em todas as escritas registradas pelo fake). `set` dentro da transação é permitido: o baú é um documento com chaves `categoria__item`.
  5. Quantidade inválida (zero, negativa, não inteira, acima de `QUANTIDADE_ITEM_MAX`) ou tipo de baú inválido é rejeitada com `ErroValidacao` sem gravar nada.
  6. Remover até zerar apaga a chave do item (comportamento atual).
- Arquivos prováveis: `utils/db.js`, `test/db-bau.test.js` (o fake é entregue na onda 0)
- Dependências: STK-011, `test/helpers/fake-firestore.js`

## STK-008 - Tornar atômicas as operações de saldo do caixa
- Tipo: Bug (perda de dados) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: `adicionarCaixa` e `retirarCaixa` em `utils/caixa.js` seguem o mesmo padrão ler-alterar-gravar e perdem atualizações de dinheiro em concorrência. Tornar atômico por transação ou `increment`.
- Critérios de aceite:
  1. Dois `adicionarCaixa` concorrentes somam os dois valores no saldo final.
  2. Dois `retirarCaixa` concorrentes que juntos excedem o saldo nunca deixam saldo negativo; o excedente falha com retorno/erro de saldo insuficiente.
  3. Valor inválido (zero, negativo, não inteiro, `NaN`, acima de `VALOR_CAIXA_MAX`) ou tipo diferente de `sujo`/`limpo` é rejeitado com `ErroValidacao` sem gravar.
  4. (movido para STK-012: o histórico é gravado pelo `caixa-modal`, não por `utils/caixa.js`.)
  5. Nenhuma escrita em `caixa/saldo` acontece fora de `runTransaction`.
- Arquivos prováveis: `utils/caixa.js`, `test/caixa.test.js`
- Dependências: STK-011, `test/helpers/fake-firestore.js`

## STK-009 - Corrigir `getSaldo()` sem `await` em `setup-caixa`
- Tipo: Bug | Prioridade: High | Camada: front | Status: A fazer
- Descrição: em `commands/setup-caixa.js` `getSaldo()` é assíncrona e usada sem `await`; `saldo.sujo` fica `undefined` e o comando quebra.
- Critérios de aceite:
  1. Com saldo simulado no db falso, `/setup-caixa` constrói o embed com o saldo e o valor "sujo" corretos (assert no conteúdo do embed enviado).
  2. Com documento de saldo inexistente, o comando usa valores padrão (0) e não lança exceção.
  3. Teste falha se `getSaldo` for retornado como Promise não resolvida (embed sem `undefined` nem `[object Promise]` nos campos).
  4. A interação é respondida ou deferida em até 3 s mesmo com leitura lenta simulada (`deferReply` chamado antes da leitura).
- Arquivos prováveis: `commands/setup-caixa.js`, `test/setup-caixa.test.js`
- Dependências: STK-018a (`embedCaixa` em `utils/ui.js`), STK-022a (`getConfig`). Feito na onda 1 pelo frontend-dev junto com STK-018b; STK-006 vem depois no mesmo arquivo.

## STK-010 - Corrigir `embedInventario` sem `await` em Ver Estoque
- Tipo: Bug | Prioridade: High | Camada: front | Status: A fazer
- Descrição: no botão Ver Estoque de `interactions/bau-menu.js`, `embedInventario` é assíncrona e é usada sem `await`; `embeds` recebe uma Promise.
- Critérios de aceite:
  1. Ao clicar em Ver Estoque, `reply`/`editReply` recebe `embeds` contendo objetos de embed resolvidos (nenhum elemento é Promise) com o conteúdo do estoque do db falso.
  2. Com baú vazio, o embed indica estoque vazio sem lançar exceção.
  3. Se a leitura do db falhar, o handler responde com mensagem de erro efêmera em vez de ficar sem resposta.
  4. A interação recebe `deferReply`/`deferUpdate` antes da leitura (limite de 3 s).
  5. (architect) Nenhum campo do embed de inventário passa de 1024 caracteres (truncar em `embedInventario`).
- Arquivos prováveis: `interactions/bau-menu.js`, `utils/embeds.js`, `test/bau-menu.test.js`
- Dependências: STK-018a, STK-022a (onda 1; STK-004 vem depois no mesmo arquivo)

## STK-011 - Criar parser numérico estrito com limites
- Tipo: Melhoria | Prioridade: Medium | Camada: back | Status: A fazer
- Descrição: `parseInt("10abc")` vira 10 e o `caixa-modal` remove tudo que não é dígito (`"-50"` vira 50, `"1.000,50"` vira 100050). Criar `utils/validacao.js` com `parseInteiroPositivo(texto, { max })` estrito.
- Critérios de aceite:
  1. `"10"` e `" 10 "` retornam 10.
  2. Retornam inválido: `"10abc"`, `"-50"`, `"0"`, `"1.5"`, `"1,5"`, `"1.000,50"`, `""`, `"abc"`, `"1e3"`, `"+5"` e valores não string (`null`, `undefined`).
  3. Valor acima do máximo informado retorna inválido com motivo "acima do limite"; no limite exato é aceito.
  4. Valor acima de `Number.MAX_SAFE_INTEGER` é inválido.
  5. Limites exportados em `LIMITES` (congelado) com os valores decididos: `QUANTIDADE_ITEM_MAX = 100000`, `VALOR_CAIXA_MAX = 1000000000`, `NOME_ITEM_MAX = 50`, `ITENS_POR_CATEGORIA_MAX = 25`, `ANOTACAO_MAX = 100`, `AJUSTE_LINHAS_MAX = 200`.
  6. O retorno distingue ok/erro com mensagem pronta para exibir ao usuário (`{ ok, valor } | { ok: false, erro }`).
  7. (architect) Dígitos não ASCII (ex.: `"١٢"`) e espaço interno (`"10 0"`) são inválidos; `"007"` vale 7; `parseInteiro` aceita `min: 0` (usado no ajuste em massa).
  8. (architect) `gerarIdItem` e `validarNomeItem` (para STK-016) conforme `docs/architecture.md` §4.1.
- Arquivos prováveis: `utils/validacao.js`, `test/validacao.test.js`
- Dependências: nenhuma

## STK-012 - Aplicar validação numérica estrita nos handlers
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: usar o parser de STK-011 em `bau-quantidade`, `caixa-modal` e na parte numérica de `gerencia-ajustar`, respondendo erro efêmero claro.
- Critérios de aceite:
  1. `bau-quantidade` com `"10abc"` responde erro efêmero e não chama escrita no db; com `"10"` grava 10.
  2. `caixa-modal` com `"-50"` e `"1.000,50"` responde erro e não grava; com `"500"` grava 500.
  3. `gerencia-ajustar` com valor não numérico estrito responde erro e não grava nada.
  4. Valor acima do limite máximo é rejeitado nos três handlers.
  5. Mensagens de erro são efêmeras e não revelam stack.
  6. (architect, vindo de STK-008) `caixa-modal` grava `addLogCaixa` uma vez por operação bem-sucedida e nenhuma em operação rejeitada.
  7. (architect) `maxLength` dos modais: quantidade 6, valor 10.
- Escopo: a parte de `gerencia-ajustar` (critério 3) é entregue dentro de STK-015, que reescreve o parse.
- Arquivos prováveis: `interactions/bau-quantidade.js`, `interactions/caixa-modal.js`, `interactions/bau-item.js`, `interactions/caixa-menu.js`, `test/validacao-handlers.test.js`
- Dependências: STK-007, STK-008, STK-011

## STK-013 - Criar log de auditoria e tornar atômicas a remoção de item, o zerar baú e o ajuste em massa
- Tipo: Melhoria (perda de dados) | Prioridade: Medium | Camada: back | Status: A fazer
- Descrição: remover item do catálogo apaga o item dos baús sem log e fora de transação; zerar baú e ajuste em massa também não geram log. Em `utils/db.js`: `zerarBau(tipo|'ambos', usuario)`, `removerItemDoCatalogo(categoriaId, itemId, usuario)`, `ajustarBauEmMassa(tipo, mudancas, usuario)` e `getAuditoria({ limite })`, cada escrita numa transação que também grava o documento em `auditoria` (formato em `docs/architecture.md` ADR-10).
- Critérios de aceite:
  1. `removerItemDoCatalogo(id)` remove o item do catálogo e de todos os baús numa única transação; se qualquer etapa falhar, nada é alterado (teste com falha injetada no fake).
  2. `zerarBau(bauId)` zera apenas o baú indicado e registra log com quantidades anteriores.
  3. `ajustarBauEmMassa` aplica todas as mudanças ou nenhuma, e registra um log com o antes e o depois.
  4. Cada log contém ação, id do usuário, timestamp e alvo; teste verifica o documento gravado.
  5. Operação sobre item/baú inexistente retorna erro tratável sem gravar log.
  6. (architect) `zerarBau('ambos')` zera os dois baús numa única transação com um único log; `usuario` ausente lança `ErroValidacao`.
- Arquivos prováveis: `utils/db.js`, `test/db-auditoria.test.js`
- Dependências: STK-007 (mesmo arquivo)

## STK-014 - Auditar remoção de item e zerar baú em `gerencia-selects`
- Tipo: Melhoria | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: `interactions/gerencia-selects.js` deve usar as funções de STK-013 e informar o resultado ao gerente.
- Critérios de aceite:
  1. Remover item do catálogo chama `removerItemDoCatalogo` com o id do usuário e responde confirmação efêmera.
  2. Zerar baú chama `zerarBau` com o id do usuário e responde confirmação efêmera.
  3. Erro retornado pelo back vira mensagem efêmera amigável, sem lançar exceção.
  4. Nenhum acesso direto de escrita ao db sobra no handler (teste verifica que só as funções novas foram chamadas).
  5. `deferUpdate`/`deferReply` ocorre antes das operações de banco.
- Arquivos prováveis: `interactions/gerencia-selects.js`, `test/gerencia-selects.test.js`
- Dependências: STK-005, STK-013

## STK-015 - Reforçar o ajuste em massa de inventário
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: `gerencia-ajustar.js` grava o baú inteiro sem log, sem confirmação e sem `defer`; nomes com `:` quebram o parse e nomes repetidos entre categorias casam o primeiro. Passar a identificar itens por id (e categoria), pedir confirmação antes de aplicar e usar `ajustarBauEmMassa`.
- Critérios de aceite:
  1. O handler chama `deferReply`/`deferUpdate` antes de qualquer leitura de banco.
  2. Antes de gravar, o handler mostra um resumo das mudanças com botão de confirmar e de cancelar; sem confirmação nada é gravado.
  3. Ao confirmar, chama `ajustarBauEmMassa` uma única vez, com o id do usuário (gera log).
  4. Ao cancelar, nada é gravado e o handler responde cancelamento.
  5. Item cujo nome contém `:` é interpretado corretamente (teste com `"Pistola: .50"`).
  6. Dois itens com o mesmo nome em categorias diferentes são ajustados cada um no seu devido lugar.
  7. Linha malformada gera erro efêmero listando a linha e nada é gravado.
  8. (architect, vindo de STK-012) Quantidade não numérica estrita ou acima de `QUANTIDADE_ITEM_MAX` é erro de linha; 0 remove o item.
  9. (architect) Só o gerente que gerou o resumo pode confirmar; confirmação expirada (10 min) pede para refazer.
  10. (architect) `gerencia-menu` (Ajustar Baú) gera o texto com cabeçalhos `# Categoria` e nunca passa de 2000 caracteres na mensagem.
- Arquivos prováveis: `interactions/gerencia-ajustar.js`, `interactions/gerencia-menu.js`, `interactions/gerencia-ajuste-confirmar.js` (novo), `utils/ajuste-texto.js` (novo), `utils/ajustes-pendentes.js` (novo), `utils/ui.js`, `test/ajuste-texto.test.js`, `test/gerencia-ajustar.test.js`
- Dependências: STK-005, STK-011, STK-013

## STK-016 - Gerar id de item seguro e limitar nome (back + front)
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: o `id` do item é derivado do nome; nome só com símbolos gera id vazio, nomes parecidos colidem, e não há limite máximo para o nome.
- Critérios de aceite:
  1. Nome só com símbolos (ex.: `"!!!"`) é rejeitado com erro efêmero e nada é gravado.
  2. Dois nomes distintos que gerariam o mesmo id (ex.: `"Pistola 9mm"` e `"pistola-9mm"`) não sobrescrevem: o segundo é rejeitado como duplicado ou recebe id único (regra fixada no teste).
  3. Nome acima do limite (definir, ex.: 50 caracteres) é rejeitado.
  4. O id gerado nunca é string vazia e é seguro como id de documento (sem `/`).
  5. Nome válido continua cadastrando o item como hoje.
  6. (architect) Regra fixada: duplicado é recusado (sem id único com sufixo); nomes iguais ignorando caixa e acento também. Categoria com 25 itens recusa novo item.
  7. (architect) Dois cadastros simultâneos do mesmo nome gravam só um (transação).
- Divisão: **STK-016b** (backend, onda 2) `adicionarItemAoCatalogo(categoriaId, nomeItem)` em `utils/db.js` valida, gera id e grava em transação; **STK-016f** (frontend, onda 3) `gerencia-modals` usa o novo retorno e `gerencia-selects` põe `maxLength 50` no campo.
- Arquivos prováveis: `utils/db.js`, `test/db-catalogo.test.js` (b); `interactions/gerencia-modals.js`, `interactions/gerencia-selects.js`, `test/gerencia-modals.test.js` (f)
- Dependências: b: STK-007, STK-011 · f: STK-005, STK-016b

## STK-017 - Tratar item inexistente em `bau-item`
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: se o item selecionado foi removido do catálogo, `item.nome` lança exceção sem tratamento.
- Critérios de aceite:
  1. Com id de item inexistente no db falso, o handler responde mensagem efêmera "item não encontrado" e não lança exceção.
  2. Nenhum modal é aberto nesse caso.
  3. Com item existente, o modal de quantidade abre normalmente.
  4. Erro inesperado de leitura vira mensagem efêmera genérica.
- Arquivos prováveis: `interactions/bau-item.js`, `test/bau-item.test.js`
- Dependências: STK-018a (onda 1; STK-004 vem depois no mesmo arquivo)

## STK-018 - Centralizar componentes de UI duplicados e tirar `config.json` do topo dos módulos
- Tipo: Melhoria | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: `rowMenuBau` (4 arquivos, contando `commands/setup.js`), `rowCancelar` (2), `rowMenuGerencia` (5), `rowMenuGerencia2` (3), `rowCaixa` (3) e `embedCaixa` (3) estão duplicados. Criar `utils/ui.js` (assinaturas em `docs/architecture.md` §4.8) e importar nos handlers. Junto, trocar todo `require('../config.json')` de `interactions/`, `commands/` e `utils/embeds.js` por `getConfig()` dentro das funções (sem isso nenhum handler é testável).
- Critérios de aceite:
  1. O módulo exporta `rowMenuBau`, `rowMenuGerencia`, `rowMenuGerencia2` e `embedCaixa`, com testes que verificam custom ids, rótulos e estilos dos botões.
  2. Varredura de teste não encontra definição local dessas funções fora do módulo central.
  3. Os custom ids gerados continuam idênticos aos atuais (teste de snapshot dos ids contra o roteamento do `index.js`).
  4. Os handlers afetados continuam passando seus testes sem alteração de comportamento.
  5. (architect) Após cadastrar/remover item ou zerar baú, o painel da gerência volta com as duas linhas de botões (hoje some a linha "Ajustar").
  6. (architect) Nenhum arquivo de `interactions/`, `commands/` ou `utils/embeds.js` faz `require` de `config.json`.
- Divisão: **STK-018a** (onda 0) cria `utils/ui.js` + `test/ui.test.js`; **STK-018b** (onda 1) migra todos os handlers e comandos.
- Arquivos prováveis: `utils/ui.js`, `utils/embeds.js`, `interactions/*.js`, `commands/setup*.js`, `test/ui.test.js`, `test/ui-duplicacao.test.js`
- Dependências: a: nenhuma · b: STK-018a, STK-022a

## STK-019 - Persistir o id da mensagem dos painéis fixos
- Tipo: Melhoria | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: hoje a atualização procura "a primeira mensagem do bot nas últimas 10", o que é frágil. Guardar no Firestore, na coleção `paineis/{chave}` (nunca dentro de `bau/*`, que `getBau`/`embedInventario` tratam como lista de itens), o id da mensagem dos painéis `inventario_membros`, `inventario_gerencia` e `saldo_caixa`.
- Critérios de aceite:
  1. `salvarMensagemPainel(chave, canalId, mensagemId)` grava e `obterMensagemPainel(chave)` devolve `{ canalId, mensagemId }` (db falso); chave fora de `CHAVES_PAINEL` lança `ErroValidacao`.
  2. Consulta de baú sem mensagem registrada devolve `null`, sem lançar exceção.
  3. Salvar de novo substitui o id anterior.
  4. Gravar o id não altera nenhum documento de `bau/*` (teste com `dump()`).
- Arquivos prováveis: `utils/db.js`, `test/db-paineis.test.js`
- Dependências: STK-007 (mesmo arquivo)

## STK-020 - Centralizar a atualização dos painéis fixos (inventário e saldo)
- Tipo: Melhoria | Prioridade: Low | Camada: front | Status: A fazer
- Descrição: a lógica de atualizar a mensagem do painel está copiada em 4 lugares (`bau-quantidade`, `gerencia-ajustar`, `gerencia-selects` para inventário; `caixa-modal` para saldo). Criar `utils/painel.js` com `atualizarPainelInventario(client, tipo)` e `atualizarPainelSaldo(client, saldo?)` que usam o id guardado em STK-019.
- Critérios de aceite:
  1. Com id guardado, a função busca essa mensagem e a edita (canal falso), sem varrer as últimas 10 mensagens.
  2. Sem id guardado: procura uma única vez a mensagem antiga do bot (migração), adota-a e grava o id; se não houver, envia nova e grava. Mensagem apagada (erro 10008): envia nova e grava o novo id.
  3. Falha ao editar/enviar é registrada e não propaga exceção para o handler chamador.
  4. Os 4 lugares antes duplicados passam a chamar a função única (varredura: `messages.fetch({ limit` só existe em `utils/painel.js`).
- Arquivos prováveis: `utils/painel.js`, `interactions/bau-quantidade.js`, `interactions/gerencia-ajustar.js`, `interactions/gerencia-selects.js`, `interactions/caixa-modal.js`, `test/painel.test.js`
- Dependências: STK-018, STK-019

## STK-021 - Unificar roteamento, aplicar permissão no roteador e reduzir ruído de log
- Tipo: Melhoria (segurança) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: (architect) o roteador passa a ser o ponto único de permissão: cada handler exporta `permissao` e `rotearInteracao` chama `exigirNivel` antes do `execute`; módulo sem `permissao` impede o bot de subir. Roteamento vai para `utils/roteador.js` (testável) e `index.js` só cria o cliente. Original: `index.js` loga toda interação (`BUTTON RECEBIDO` etc.), não tem handlers de `unhandledRejection`/`uncaughtException`, mantém a intent `GuildMessages` sem necessidade e repete o roteamento três vezes (botão, select, modal).
- Critérios de aceite:
  1. Existe função de roteamento única (exportada para teste) que resolve o handler por tipo e custom id para botão, select e modal; ids desconhecidos não lançam exceção.
  2. Os custom ids atualmente roteados continuam roteando para os mesmos handlers (teste de tabela).
  3. Exceção em um handler é capturada, registrada e a interação recebe resposta de erro efêmera sem derrubar o processo.
  4. Handlers de `unhandledRejection` e `uncaughtException` estão registrados e registram o erro.
  5. A lista de intents não inclui `GuildMessages` (asserção sobre a configuração exportada), exceto se a revisão do código mostrar uso real, caso em que o card volta ao jira-manager.
  6. Nenhum `console.log` por interação recebida permanece; logs de erro continuam.
  7. (architect) Permissão negada pelo roteador: o `execute` do handler não é chamado e a negação é a primeira resposta.
  8. (architect) `carregarHandlers` lança erro se um módulo não declarar `permissao` válida, se houver id duplicado no mesmo tipo ou id com `:`.
  9. (architect) Carregar `index.js` não faz login (só `iniciar()` faz).
- Nota: verificado no código que `GuildMessages` não é usada (`channel.messages.fetch` é REST); critério 5 vale sem ressalva.
- Arquivos prováveis: `index.js`, `utils/roteador.js` (novo), `test/roteador.test.js`
- Dependências: STK-003, STK-022a

## STK-022 - Configuração validada (`utils/config.js`) e `start.js` sem gravar `config.json`
- Tipo: Melhoria | Prioridade: Medium | Camada: back | Status: A fazer
- Descrição: `start.js` cria `config.json` a partir de variáveis sem validar; ausentes viram `undefined` silenciosamente. (architect) Escopo ampliado: novo `utils/config.js` com `getConfig()/setConfig()/montarConfigDeEnv()`; `start.js` passa a validar e **não grava mais** `config.json` (lê `config.json` só se existir, para dev local). `deploy-commands.js` e `index.js` usam `getConfig()`. Obrigatórias: `TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ROLE_MEMBRO`, `ROLE_GERENTE`, `ROLE_DONO` e os 10 `CH_*` (pergunta P2 em aberto).
- Critérios de aceite:
  1. Com todas as variáveis obrigatórias definidas, `montarConfigDeEnv` devolve a config no formato de `config.example.json` com os valores corretos.
  2. Para cada variável obrigatória ausente ou vazia, `main()` falha com mensagem que cita o nome dela, define `exitCode = 1`, não faz login e não cria `config.json` (um teste por variável).
  3. Nenhum valor `undefined` ou string `"undefined"` aparece na config (também quando vinda de `config.json`).
  4. A lista de variáveis obrigatórias fica em `VARIAVEIS_OBRIGATORIAS` exportada para uso do README.
- Divisão: **STK-022a** (onda 0) `utils/config.js` + `test/helpers/config-teste.js`; **STK-022b** (onda 1) `start.js` e `deploy-commands.js`.
- Arquivos prováveis: `utils/config.js` (novo), `start.js`, `deploy-commands.js`, `test/config.test.js`, `test/start.test.js`
- Dependências: nenhuma

## STK-023 - Zerar erros e avisos do ESLint
- Tipo: Tarefa | Prioridade: Medium | Camada: ambos | Status: A fazer
- Descrição: o ESLint reporta 12 erros (variáveis e funções não usadas, parâmetro `client` sem uso, `async` sem `await`). Executar por último, depois dos demais cards de código, para tratar só o que sobrar.
- Critérios de aceite:
  1. `npm run lint` termina com código 0, zero erros e zero avisos.
  2. Nenhuma regra foi desligada nem `eslint-disable` adicionado para esconder os achados (varredura de teste).
  3. `npm test` continua com todos os testes passando, sem pulados nem `.only`.
  4. `node --check` passa em todos os arquivos `.js`.
- Arquivos prováveis: `index.js`, `interactions/*.js`, `commands/*.js`, `utils/*.js`
- Dependências: todos os cards de código (onda 4)
- Observação: (architect) os 12 erros atuais estão todos em `interactions/` (frontend-dev). Na onda 4 cada dev limpa só os próprios arquivos.

## STK-024 - Corrigir `package.json` (repositório)
- Tipo: Tarefa | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: o `package.json` original apontava para outro repositório (`Luuqee/Stocky`). (architect) No estado atual o bootstrap já removeu `repository`, `bugs` e `homepage`; o card passa a **adicioná-los** apontando para `https://github.com/lucasouzaoliv/stocky`. A licença (`ISC` aqui, `MIT` no README) fica como está até a resposta P5.
- Critérios de aceite:
  1. Os campos `repository`, `bugs` e `homepage` existem e apontam para `lucasouzaoliv/stocky`; teste falha se contiver `Luuqee`.
  2. `scripts.test`, `scripts.lint` e `engines.node` continuam presentes (teste de regressão).
  3. `package.json` continua JSON válido e `npm install` não é afetado (checado por `node -e "require('./package.json')"` no teste).
- Arquivos prováveis: `package.json`, `test/package.test.js`
- Dependências: nenhuma

## STK-025 - Completar o README
- Tipo: Tarefa | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: o README descreve o setup de forma incompleta. Documentar variáveis de ambiente do Firebase, as variáveis do bot, como rodar testes e lint, e aviso de rotação de chaves.
- Critérios de aceite:
  1. O README cita cada variável obrigatória exportada por `start.js` (STK-022) e as 4 variáveis `FIREBASE_*` (teste lê o README e confere os nomes).
  2. O README contém os comandos `npm install`, `npm test`, `npm run lint`, `npm start` e `npm run deploy`.
  3. O README não contém valores de credencial reais (varredura de segredos vazia).
  4. (architect) O README avisa que a chave antiga do Firebase precisa ser rotacionada e que `config.json` não é mais gerado pelo `start.js`.
- Arquivos prováveis: `README.md`, `test/readme.test.js`
- Dependências: STK-001, STK-022 (STK-023 removida: não há relação)
