# Backlog do Stocky

Origem: `docs/review-findings.md` (31/10/2026). Jira não configurado (`JIRA_PROJECT_KEY` vazio), então este arquivo é a fonte dos cards. Status possíveis: A fazer, Em andamento, Em revisão QA, Concluído.

Convenções:
- Os helpers de teste (`test/helpers/fake-firestore.js`, `test/helpers/fake-interaction.js`) são criados pelo primeiro card que precisar deles e reutilizados pelos demais. Cada card carrega seus próprios testes.
- Cards que tocam o mesmo arquivo têm dependência entre si para não haver edição concorrente (regra do WORKFLOW).
- Todo card só fecha com a Definition of Done do `docs/WORKFLOW.md` (lint zero, testes verdes, `node --check`, PASS do QA).

## Resumo

| ID | Título | Camada | Prioridade | Dependências |
|---|---|---|---|---|
| STK-001 | Remover credenciais Firebase do código e exigir variáveis de ambiente | back | Highest | - |
| STK-002 | Garantir `node_modules` fora do git | back | High | - |
| STK-003 | Centralizar verificação de permissão e tratar DM em `permissoes.js` | back | High | - |
| STK-004 | Exigir cargo de membro nos handlers do baú | front | High | STK-003 |
| STK-005 | Exigir gerente nos handlers de gerência | front | High | STK-003 |
| STK-006 | Exigir gerente no `caixa-modal` e nos comandos `/setup*` | front | High | STK-003 |
| STK-007 | Tornar atômicas as operações de estoque do baú | back | High | - |
| STK-008 | Tornar atômicas as operações de saldo do caixa | back | High | - |
| STK-009 | Corrigir `getSaldo()` sem `await` em `setup-caixa` | front | High | STK-006 |
| STK-010 | Corrigir `embedInventario` sem `await` em Ver Estoque | front | High | STK-004 |
| STK-011 | Criar parser numérico estrito com limites | back | Medium | - |
| STK-012 | Aplicar validação numérica estrita nos handlers | front | Medium | STK-011, STK-004, STK-005, STK-006 |
| STK-013 | Criar log de auditoria e tornar atômicas a remoção de item e o zerar baú | back | Medium | STK-007 |
| STK-014 | Auditar remoção de item e zerar baú em `gerencia-selects` | front | Medium | STK-005, STK-013 |
| STK-015 | Reforçar o ajuste em massa de inventário | front | Medium | STK-005, STK-012, STK-013 |
| STK-016 | Gerar id de item seguro e limitar nome em `gerencia-modals` | front | Medium | STK-005 |
| STK-017 | Tratar item inexistente em `bau-item` | front | Medium | STK-004 |
| STK-018 | Centralizar componentes de UI duplicados | front | Medium | STK-004, STK-005, STK-006, STK-009, STK-010, STK-014, STK-015, STK-016, STK-017 |
| STK-019 | Persistir o id da mensagem do inventário por canal | back | Low | STK-007 |
| STK-020 | Centralizar a atualização do inventário nos canais | front | Low | STK-018, STK-019 |
| STK-021 | Unificar roteamento e reduzir ruído de log em `index.js` | back | Low | - |
| STK-022 | Validar variáveis obrigatórias em `start.js` | back | Low | - |
| STK-023 | Zerar erros e avisos do ESLint | ambos | Medium | STK-001 a STK-022 (exceto STK-024, STK-025) |
| STK-024 | Corrigir `package.json` (repositório) | back | Low | - |
| STK-025 | Completar o README | back | Low | STK-001, STK-022, STK-023 |

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
- Arquivos prováveis: `utils/permissoes.js`, `test/permissoes.test.js`, `test/helpers/fake-interaction.js`
- Dependências: nenhuma

## STK-004 - Exigir cargo de membro nos handlers do baú
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: `bau-menu`, `bau-categoria`, `bau-item` e `bau-quantidade` não verificam permissão; qualquer usuário pode mexer no estoque. Aplicar a verificação de membro (STK-003) no início de cada handler.
- Critérios de aceite:
  1. Para cada um dos 4 handlers, usuário sem cargo de membro recebe resposta efêmera de negação e nenhuma função de `utils/db.js` é chamada (espião no db falso).
  2. Para cada handler, usuário com cargo de membro segue o fluxo atual (resposta/atualização normal).
  3. Em DM, cada handler responde com a mensagem de DM e não lança exceção.
  4. A checagem acontece antes de qualquer leitura de banco e antes de `showModal`/`deferUpdate`, sem estourar 3 s (teste: negação ocorre com uma única resposta).
- Arquivos prováveis: `interactions/bau-menu.js`, `interactions/bau-categoria.js`, `interactions/bau-item.js`, `interactions/bau-quantidade.js`, `test/bau-permissoes.test.js`
- Dependências: STK-003

## STK-005 - Exigir gerente nos handlers de gerência
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: `gerencia-menu`, `gerencia-selects`, `gerencia-modals`, `gerencia-abrir-modal` e `gerencia-ajustar` permitem zerar baú, remover item do catálogo e ajustar inventário em massa sem checar cargo de gerente. Aplicar `exigirGerente` em todos.
- Critérios de aceite:
  1. Para cada um dos 5 handlers, usuário sem cargo de gerente recebe negação efêmera e nenhum método de escrita do db é chamado.
  2. Usuário com cargo de gerente mantém o fluxo atual em cada handler.
  3. Membro comum (sem cargo de gerente) não consegue zerar baú, remover item do catálogo nem executar ajuste em massa (um teste por ação).
  4. Em DM, cada handler responde com a mensagem de DM sem lançar exceção.
  5. `gerencia-abrir-modal` verifica a permissão antes de `showModal` e continua chamando `showModal` como primeira resposta quando permitido.
- Arquivos prováveis: `interactions/gerencia-menu.js`, `interactions/gerencia-selects.js`, `interactions/gerencia-modals.js`, `interactions/gerencia-abrir-modal.js`, `interactions/gerencia-ajustar.js`, `test/gerencia-permissoes.test.js`
- Dependências: STK-003

## STK-006 - Exigir gerente no `caixa-modal` e nos comandos `/setup*`
- Tipo: Bug (segurança) | Prioridade: High | Camada: front | Status: A fazer
- Descrição: o modal `caixa-modal` pode ser enviado sem checagem (exige gerente) e `commands/setup*.js` não restringem quem usa. Aplicar `exigirGerente` no modal e restringir os comandos (verificação de cargo/permissão de administrador, ou `setDefaultMemberPermissions` mais checagem em runtime) tratando DM.
- Critérios de aceite:
  1. Submissão do `caixa-modal` por usuário sem cargo de gerente é negada e `adicionarCaixa`/`retirarCaixa` não são chamados.
  2. Submissão por gerente segue o fluxo atual.
  3. `/setup` e `/setup-caixa` executados por usuário sem a permissão exigida respondem negação efêmera e não enviam mensagens de painel nem gravam configuração.
  4. Os mesmos comandos executados por usuário autorizado mantêm o comportamento atual.
  5. Em DM, comandos e modal respondem sem lançar exceção (`interaction.member` nulo).
- Arquivos prováveis: `interactions/caixa-modal.js`, `commands/setup.js`, `commands/setup-caixa.js`, `test/setup-permissoes.test.js`
- Dependências: STK-003

## STK-007 - Tornar atômicas as operações de estoque do baú
- Tipo: Bug (perda de dados) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: `adicionarAoBau` e `removerDoBau` leem o documento inteiro, alteram em memória e gravam com `set`; duas operações simultâneas perdem atualização. Usar transação do Firestore ou `FieldValue.increment`, mantendo as regras atuais (não deixar estoque negativo).
- Critérios de aceite:
  1. Duas chamadas concorrentes de `adicionarAoBau` no mesmo item (ex.: +5 e +7 em `Promise.all`) resultam em estoque somado (12), no Firestore falso com semântica de transação/increment.
  2. Duas chamadas concorrentes de `removerDoBau` cujo total excede o estoque nunca deixam o estoque negativo; a segunda falha com erro/retorno de "estoque insuficiente".
  3. Operações em itens diferentes do mesmo baú não sobrescrevem uma à outra.
  4. Nenhuma das duas funções usa `set` do documento inteiro (teste verifica que o fake recebeu `runTransaction` ou `update` com incremento).
  5. Quantidade inválida (zero, negativa, não inteira) é rejeitada sem gravar nada.
- Arquivos prováveis: `utils/db.js`, `test/helpers/fake-firestore.js`, `test/db-bau.test.js`
- Dependências: nenhuma

## STK-008 - Tornar atômicas as operações de saldo do caixa
- Tipo: Bug (perda de dados) | Prioridade: High | Camada: back | Status: A fazer
- Descrição: `adicionarCaixa` e `retirarCaixa` em `utils/caixa.js` seguem o mesmo padrão ler-alterar-gravar e perdem atualizações de dinheiro em concorrência. Tornar atômico por transação ou `increment`.
- Critérios de aceite:
  1. Dois `adicionarCaixa` concorrentes somam os dois valores no saldo final.
  2. Dois `retirarCaixa` concorrentes que juntos excedem o saldo nunca deixam saldo negativo; o excedente falha com retorno/erro de saldo insuficiente.
  3. Valor inválido (zero, negativo, não inteiro, `NaN`) é rejeitado sem gravar.
  4. Registro de histórico/movimentação existente continua sendo gravado, uma vez por operação bem-sucedida e nenhuma em operação rejeitada.
  5. Nenhuma das funções usa `set` do documento inteiro.
- Arquivos prováveis: `utils/caixa.js`, `test/helpers/fake-firestore.js`, `test/caixa.test.js`
- Dependências: nenhuma

## STK-009 - Corrigir `getSaldo()` sem `await` em `setup-caixa`
- Tipo: Bug | Prioridade: High | Camada: front | Status: A fazer
- Descrição: em `commands/setup-caixa.js` `getSaldo()` é assíncrona e usada sem `await`; `saldo.sujo` fica `undefined` e o comando quebra.
- Critérios de aceite:
  1. Com saldo simulado no db falso, `/setup-caixa` constrói o embed com o saldo e o valor "sujo" corretos (assert no conteúdo do embed enviado).
  2. Com documento de saldo inexistente, o comando usa valores padrão (0) e não lança exceção.
  3. Teste falha se `getSaldo` for retornado como Promise não resolvida (embed sem `undefined` nem `[object Promise]` nos campos).
  4. A interação é respondida ou deferida em até 3 s mesmo com leitura lenta simulada (`deferReply` chamado antes da leitura).
- Arquivos prováveis: `commands/setup-caixa.js`, `test/setup-caixa.test.js`
- Dependências: STK-006 (mesmo arquivo)

## STK-010 - Corrigir `embedInventario` sem `await` em Ver Estoque
- Tipo: Bug | Prioridade: High | Camada: front | Status: A fazer
- Descrição: no botão Ver Estoque de `interactions/bau-menu.js`, `embedInventario` é assíncrona e é usada sem `await`; `embeds` recebe uma Promise.
- Critérios de aceite:
  1. Ao clicar em Ver Estoque, `reply`/`editReply` recebe `embeds` contendo objetos de embed resolvidos (nenhum elemento é Promise) com o conteúdo do estoque do db falso.
  2. Com baú vazio, o embed indica estoque vazio sem lançar exceção.
  3. Se a leitura do db falhar, o handler responde com mensagem de erro efêmera em vez de ficar sem resposta.
  4. A interação recebe `deferReply`/`deferUpdate` antes da leitura (limite de 3 s).
- Arquivos prováveis: `interactions/bau-menu.js`, `test/bau-menu.test.js`
- Dependências: STK-004 (mesmo arquivo)

## STK-011 - Criar parser numérico estrito com limites
- Tipo: Melhoria | Prioridade: Medium | Camada: back | Status: A fazer
- Descrição: `parseInt("10abc")` vira 10 e o `caixa-modal` remove tudo que não é dígito (`"-50"` vira 50, `"1.000,50"` vira 100050). Criar `utils/validacao.js` com `parseInteiroPositivo(texto, { max })` estrito.
- Critérios de aceite:
  1. `"10"` e `" 10 "` retornam 10.
  2. Retornam inválido: `"10abc"`, `"-50"`, `"0"`, `"1.5"`, `"1,5"`, `"1.000,50"`, `""`, `"abc"`, `"1e3"`, `"+5"` e valores não string (`null`, `undefined`).
  3. Valor acima do máximo informado retorna inválido com motivo "acima do limite"; no limite exato é aceito.
  4. Valor acima de `Number.MAX_SAFE_INTEGER` é inválido.
  5. Limites padrão exportados (quantidade de item e valor de caixa) como constantes testadas.
  6. O retorno distingue ok/erro com mensagem pronta para exibir ao usuário.
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
- Arquivos prováveis: `interactions/bau-quantidade.js`, `interactions/caixa-modal.js`, `interactions/gerencia-ajustar.js`, `test/validacao-handlers.test.js`
- Dependências: STK-011, STK-004, STK-005, STK-006 (mesmos arquivos)

## STK-013 - Criar log de auditoria e tornar atômicas a remoção de item e o zerar baú
- Tipo: Melhoria (perda de dados) | Prioridade: Medium | Camada: back | Status: A fazer
- Descrição: remover item do catálogo apaga o item dos baús sem log e fora de transação; zerar baú e ajuste em massa também não geram log. Criar em `utils/db.js` (ou módulo de log) `registrarLog({ acao, usuarioId, alvo, antes, depois })` e funções atômicas `removerItemDoCatalogo`, `zerarBau` e `ajustarBauEmMassa` que gravam o log na mesma transação.
- Critérios de aceite:
  1. `removerItemDoCatalogo(id)` remove o item do catálogo e de todos os baús numa única transação; se qualquer etapa falhar, nada é alterado (teste com falha injetada no fake).
  2. `zerarBau(bauId)` zera apenas o baú indicado e registra log com quantidades anteriores.
  3. `ajustarBauEmMassa` aplica todas as mudanças ou nenhuma, e registra um log com o antes e o depois.
  4. Cada log contém ação, id do usuário, timestamp e alvo; teste verifica o documento gravado.
  5. Operação sobre item/baú inexistente retorna erro tratável sem gravar log.
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
- Arquivos prováveis: `interactions/gerencia-ajustar.js`, `test/gerencia-ajustar.test.js`
- Dependências: STK-005, STK-012, STK-013

## STK-016 - Gerar id de item seguro e limitar nome em `gerencia-modals`
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: o `id` do item é derivado do nome; nome só com símbolos gera id vazio, nomes parecidos colidem, e não há limite máximo para o nome.
- Critérios de aceite:
  1. Nome só com símbolos (ex.: `"!!!"`) é rejeitado com erro efêmero e nada é gravado.
  2. Dois nomes distintos que gerariam o mesmo id (ex.: `"Pistola 9mm"` e `"pistola-9mm"`) não sobrescrevem: o segundo é rejeitado como duplicado ou recebe id único (regra fixada no teste).
  3. Nome acima do limite (definir, ex.: 50 caracteres) é rejeitado.
  4. O id gerado nunca é string vazia e é seguro como id de documento (sem `/`).
  5. Nome válido continua cadastrando o item como hoje.
- Arquivos prováveis: `interactions/gerencia-modals.js`, `test/gerencia-modals.test.js`
- Dependências: STK-005

## STK-017 - Tratar item inexistente em `bau-item`
- Tipo: Bug | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: se o item selecionado foi removido do catálogo, `item.nome` lança exceção sem tratamento.
- Critérios de aceite:
  1. Com id de item inexistente no db falso, o handler responde mensagem efêmera "item não encontrado" e não lança exceção.
  2. Nenhum modal é aberto nesse caso.
  3. Com item existente, o modal de quantidade abre normalmente.
  4. Erro inesperado de leitura vira mensagem efêmera genérica.
- Arquivos prováveis: `interactions/bau-item.js`, `test/bau-item.test.js`
- Dependências: STK-004

## STK-018 - Centralizar componentes de UI duplicados
- Tipo: Melhoria | Prioridade: Medium | Camada: front | Status: A fazer
- Descrição: `rowMenuBau` (3 arquivos), `rowMenuGerencia`/`rowMenuGerencia2` (4 arquivos) e `embedCaixa` (3 arquivos) estão duplicados. Criar `utils/ui.js` (ou estender `utils/embeds.js`) e importar nos handlers.
- Critérios de aceite:
  1. O módulo exporta `rowMenuBau`, `rowMenuGerencia`, `rowMenuGerencia2` e `embedCaixa`, com testes que verificam custom ids, rótulos e estilos dos botões.
  2. Varredura de teste não encontra definição local dessas funções fora do módulo central.
  3. Os custom ids gerados continuam idênticos aos atuais (teste de snapshot dos ids contra o roteamento do `index.js`).
  4. Os handlers afetados continuam passando seus testes sem alteração de comportamento.
- Arquivos prováveis: `utils/ui.js`, `utils/embeds.js`, `interactions/*.js`, `commands/setup*.js`, `test/ui.test.js`
- Dependências: STK-004, STK-005, STK-006, STK-009, STK-010, STK-014, STK-015, STK-016, STK-017 (mesmos arquivos)

## STK-019 - Persistir o id da mensagem do inventário por canal
- Tipo: Melhoria | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: hoje a atualização procura "a primeira mensagem do bot nas últimas 10", o que é frágil. Guardar no Firestore (ou configuração) o id da mensagem de inventário de cada baú/canal.
- Critérios de aceite:
  1. `salvarMensagemInventario(bauId, canalId, mensagemId)` grava e `obterMensagemInventario(bauId)` devolve o mesmo valor (db falso).
  2. Consulta de baú sem mensagem registrada devolve `null`, sem lançar exceção.
  3. Salvar de novo substitui o id anterior.
  4. Gravar o id não altera os dados de estoque do mesmo documento (teste de não sobrescrita).
- Arquivos prováveis: `utils/db.js`, `test/db-mensagem.test.js`
- Dependências: STK-007 (mesmo arquivo)

## STK-020 - Centralizar a atualização do inventário nos canais
- Tipo: Melhoria | Prioridade: Low | Camada: front | Status: A fazer
- Descrição: a lógica de atualizar a mensagem do inventário está copiada em 3 arquivos. Criar função única `atualizarPainelInventario(client, bauId)` que usa o id guardado em STK-019.
- Critérios de aceite:
  1. Com id guardado, a função busca essa mensagem e a edita (canal falso), sem varrer as últimas 10 mensagens.
  2. Sem id guardado ou mensagem apagada, envia nova mensagem e grava o novo id.
  3. Falha ao editar/enviar é registrada e não propaga exceção para o handler chamador.
  4. Os 3 arquivos antes duplicados passam a chamar a função única (varredura de teste não encontra a lógica antiga).
- Arquivos prováveis: `utils/ui.js` ou `utils/inventario-painel.js`, `interactions/*.js`, `test/painel-inventario.test.js`
- Dependências: STK-018, STK-019

## STK-021 - Unificar roteamento e reduzir ruído de log em `index.js`
- Tipo: Melhoria | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: `index.js` loga toda interação (`BUTTON RECEBIDO` etc.), não tem handlers de `unhandledRejection`/`uncaughtException`, mantém a intent `GuildMessages` sem necessidade e repete o roteamento três vezes (botão, select, modal).
- Critérios de aceite:
  1. Existe função de roteamento única (exportada para teste) que resolve o handler por tipo e custom id para botão, select e modal; ids desconhecidos não lançam exceção.
  2. Os custom ids atualmente roteados continuam roteando para os mesmos handlers (teste de tabela).
  3. Exceção em um handler é capturada, registrada e a interação recebe resposta de erro efêmera sem derrubar o processo.
  4. Handlers de `unhandledRejection` e `uncaughtException` estão registrados e registram o erro.
  5. A lista de intents não inclui `GuildMessages` (asserção sobre a configuração exportada), exceto se a revisão do código mostrar uso real, caso em que o card volta ao jira-manager.
  6. Nenhum `console.log` por interação recebida permanece; logs de erro continuam.
- Arquivos prováveis: `index.js`, `test/roteamento.test.js`
- Dependências: nenhuma

## STK-022 - Validar variáveis obrigatórias em `start.js`
- Tipo: Melhoria | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: `start.js` cria `config.json` a partir de variáveis sem validar; ausentes viram `undefined` silenciosamente.
- Critérios de aceite:
  1. Com todas as variáveis obrigatórias (token, client id, guild id e ids de cargo/canal usados) definidas, `config.json` é gerado com os valores corretos.
  2. Para cada variável obrigatória ausente ou vazia, o processo falha com mensagem que cita o nome dela e não grava `config.json` (um teste por variável).
  3. Nenhum valor `undefined` ou string `"undefined"` é gravado em `config.json`.
  4. A lista de variáveis obrigatórias fica em constante exportada para uso do README.
- Arquivos prováveis: `start.js`, `test/start.test.js`
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
- Dependências: STK-001 a STK-022 (executar por último entre os cards de código)
- Observação: se mais de um dono for necessário, o architect divide por arquivo entre back e front na rodada.

## STK-024 - Corrigir `package.json` (repositório)
- Tipo: Tarefa | Prioridade: Low | Camada: back | Status: A fazer
- Descrição: `package.json` aponta para outro repositório (`Luuqee/Stocky`). Scripts, `engines` e `eslint.config.js` já foram adicionados no bootstrap e não fazem parte deste card.
- Critérios de aceite:
  1. Os campos `repository`, `bugs` e `homepage` (quando existirem) apontam para `lucasouzaoliv/stocky`; teste falha se contiver `Luuqee`.
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
- Arquivos prováveis: `README.md`, `test/readme.test.js`
- Dependências: STK-001, STK-022, STK-023
