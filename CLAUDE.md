# Stocky

Bot Discord de gestão de baú e caixa para facções de GTA RP. Node.js (CommonJS), discord.js v14, Firebase Firestore (firebase-admin), hospedagem no Railway.

## Como trabalhar aqui
Toda mudança segue o workflow de `docs/WORKFLOW.md` (Jira Manager → Architect → Back-end → Front-end → QA). Use `/workflow <demanda>` para rodar o fluxo completo. Nada é concluído sem `VEREDITO: PASS` do QA, lint limpo e testes passando.

## Estrutura
- `index.js` / `start.js`: cliente Discord e roteamento de interações
- `commands/`: slash commands (`/setup`, `/setup-caixa`)
- `interactions/`: botões, selects e modais
- `utils/`: banco (`db.js`, `caixa.js`, `firebase.js`), permissões, embeds
- `test/`: testes com `node:test` e Firestore falso (nunca o banco real)

## Regras
- Nenhum segredo no código: só variáveis de ambiente (`config.json` e `.env` não vão para o git).
- Interações respondem ou fazem `defer` em até 3 s; `showModal` é a primeira resposta quando abre modal.
- Todo handler sensível checa permissão por `utils/permissoes.js`.
- Estoque e saldo são alterados de forma atômica (transação ou `increment`).
- Comandos: `npm test`, `npm run lint`, `npm start`, `npm run deploy`.
