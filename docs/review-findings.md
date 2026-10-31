# Achados da revisão do código (31/10/2026)

Entrada para o `jira-manager`. Cada item vira um ou mais cards. Severidade: **C**rítica, **A**lta, **M**édia, **B**aixa.

## Segurança
1. **C** `utils/firebase.js` traz uma credencial de conta de serviço do Firebase (chave privada, id da chave, e-mail, project id) como fallback no código. O repositório é público. Remover todos os fallbacks, exigir `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` (e `FIREBASE_PRIVATE_KEY_ID`) por variável de ambiente e falhar na inicialização com mensagem clara se faltarem. A rotação da chave no Firebase é ação do usuário, fora do código.
2. **A** `node_modules/` está versionado (3.036 arquivos) apesar de estar no `.gitignore`. Já foi removido do índice (`git rm --cached`); garantir que continue fora e que o QA verifique.
3. **A** Só `interactions/caixa-menu.js` verifica permissão. Não verificam: `bau-menu`, `bau-categoria`, `bau-item`, `bau-quantidade` (exige cargo membro), `gerencia-menu`, `gerencia-selects`, `gerencia-modals`, `gerencia-abrir-modal`, `gerencia-ajustar` (exigem gerente: zerar baú, remover item do catálogo e ajustar inventário em massa), e o modal `caixa-modal` (exige gerente; hoje o modal pode ser enviado sem checagem). `commands/setup*.js` também não restringem quem usa. As funções de `utils/permissoes.js` existem mas quase não são usadas.
4. **M** `utils/permissoes.js` e `commands/` assumem `interaction.member`; em DM é nulo. Tratar.

## Corretude e dados
5. **A** Condições de corrida: `adicionarAoBau`, `removerDoBau`, `adicionarCaixa`, `retirarCaixa` leem o documento inteiro, alteram em memória e gravam com `set`. Dois usuários ao mesmo tempo perdem atualizações (estoque e dinheiro). Tornar atômico com transação do Firestore ou `FieldValue.increment`.
6. **A** `commands/setup-caixa.js`: `getSaldo()` sem `await`; `saldo.sujo` fica `undefined` e o comando quebra.
7. **A** `interactions/bau-menu.js` (botão Ver Estoque): `embedInventario` é assíncrona e é usada sem `await`, então `embeds` recebe uma Promise.
8. **M** Validação numérica frouxa: `parseInt("10abc")` vira 10 em `bau-quantidade` e `gerencia-ajustar`; `caixa-modal` remove tudo que não é dígito (`"-50"` vira 50, `"1.000,50"` vira 100050). Exigir inteiro estrito positivo e limites máximos.
9. **M** `gerencia-ajustar.js`: ajuste em massa grava o baú inteiro sem registrar log, sem confirmação e sem `defer` (várias leituras antes de responder, risco do limite de 3 s). Nomes com `:` quebram o parse. Itens com nomes repetidos entre categorias casam o primeiro.
10. **M** `gerencia-modals.js`: o `id` do item é derivado do nome; nome só com símbolos gera id vazio, e nomes parecidos podem colidir. Sem limite máximo no campo de nome.
11. **M** Remoção de item do catálogo em `gerencia-selects.js` apaga o item dos baús sem log e fora de transação; zerar baú e ajuste em massa também não geram log de auditoria.
12. **M** `bau-item.js`: se o item não existir mais, `item.nome` lança exceção (sem tratamento).
13. **B** Atualização do inventário nos canais procura "a primeira mensagem do bot nas últimas 10"; frágil. Guardar o id da mensagem no Firestore ou na configuração. Essa lógica está copiada em 3 arquivos.

## Qualidade de código e operação
14. **M** Código duplicado: `rowMenuBau` (3 arquivos), `rowMenuGerencia`/`rowMenuGerencia2` (4 arquivos), `embedCaixa` (3 arquivos), atualização de inventário (3 arquivos). Centralizar em um módulo de UI.
15. **M** ESLint reporta 12 erros hoje (variáveis e funções não usadas, parâmetro `client` sem uso, `async` sem `await`). Deixar `npm run lint` com zero erros e zero avisos.
16. **M** Não há testes. Criar suíte com `node:test` e um Firestore falso em memória (`test/helpers/fake-firestore.js`) e um helper de interação falsa (`test/helpers/fake-interaction.js`), cobrindo todos os critérios de aceite.
17. **B** `index.js`: logs de depuração de toda interação (`BUTTON RECEBIDO` etc.), sem handlers de `unhandledRejection`/`uncaughtException`, intent `GuildMessages` desnecessária, roteamento repetido três vezes (botão, select, modal). Unificar o roteamento e reduzir o ruído de log.
18. **B** `start.js` cria `config.json` a partir de variáveis sem validar; variáveis ausentes viram `undefined` silenciosamente. Validar variáveis obrigatórias e dar erro claro.
19. **B** `package.json` aponta para outro repositório (`Luuqee/Stocky`), sem `engines`, sem scripts de `test`/`lint` (scripts, `engines` e `eslint.config.js` já foram adicionados pelo bootstrap).
20. **B** README descreve o setup de forma incompleta (variáveis de ambiente do Firebase, como rodar testes).

## Já feito no bootstrap (não virar card)
`node_modules` removido do índice do git, ESLint 9 configurado, scripts `test`/`lint`/`engines`, pasta `test/` com um teste de fumaça, agentes em `.claude/agents/`, `docs/WORKFLOW.md`, `CLAUDE.md`.
