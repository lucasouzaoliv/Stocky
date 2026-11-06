# Workflow de desenvolvimento do Stocky

> **Fluxo pesado, só para funções grandes.** Para ajustes e mudanças visuais use o fluxo leve: `docs/web/FLUXO-LEVE.md`.

Toda atividade (bug, melhoria, funcionalidade) passa pelos 5 agentes, nesta ordem. Os agentes ficam em `.claude/agents/` e o fluxo é disparado com o comando `/workflow <demanda>`.

```
demanda
  └─▶ 1. jira-manager   cria os cards com critérios de aceite testáveis
        └─▶ 2. architect   analisa, decide, escreve o contrato e delega
              ├─▶ 3. backend-dev    implementa a camada back + testes
              └─▶ 4. frontend-dev   implementa a interface Discord + testes
                    └─▶ 5. qa-engineer   testa, revisa e dá PASS ou FAIL
                          ├─ FAIL ─▶ volta ao dev dono do defeito (máx. 3 ciclos)
                          └─ PASS ─▶ jira-manager conclui os cards ─▶ commit
```

## Configuração do Jira

| Chave | Valor |
|---|---|
| `JIRA_CLOUD_ID` | `8cc11c30-0e93-4cd9-9cd5-525a0420726b` |
| `JIRA_PROJECT_KEY` | _(não definido)_ |

Enquanto `JIRA_PROJECT_KEY` estiver vazio, os cards ficam em `docs/backlog.md` (IDs `STK-001`…). Para ligar o Jira: crie um projeto só do Stocky, preencha a chave acima e peça ao `jira-manager` para sincronizar o backlog. O projeto `KAN` (Arkanis) é de outro produto e não deve receber cards do Stocky.

## Quem faz o quê

| Agente | Responsabilidade | Pode editar |
|---|---|---|
| `jira-manager` | Cards, critérios de aceite, status | `docs/backlog.md` |
| `architect` | Análise, contrato, decisões, delegação | `docs/architecture.md` |
| `backend-dev` | Dados, permissões, infra, segurança | `index.js`, `start.js`, `deploy-commands.js`, `utils/db.js`, `utils/caixa.js`, `utils/firebase.js`, `utils/permissoes.js`, `package.json`, testes de back |
| `frontend-dev` | Interface Discord (embeds, botões, selects, modais, comandos) | `interactions/`, `commands/`, `utils/embeds.js`, módulos de UI, testes de front |
| `qa-engineer` | Testes, revisão, veredito | `test/` e `docs/qa-report.md` (nunca código de produção) |

Dois agentes nunca editam o mesmo arquivo na mesma rodada.

## Definition of Ready (card pronto para desenvolver)
- Título, tipo, prioridade, camada e arquivos prováveis preenchidos.
- Critérios de aceite numerados e **cada um verificável por teste**.
- Contrato técnico escrito pelo `architect` em `docs/architecture.md`.

## Definition of Done (nada passa sem isto)
1. `npm run lint` com **zero erros e zero avisos**.
2. `npm test` com **todos os testes passando**, nenhum pulado nem `.only`.
3. `node --check` em todos os arquivos `.js`.
4. **Todo critério de aceite** tem ao menos um teste que o prova, incluindo casos de borda e erro.
5. Nenhum segredo no código (varredura do QA vazia) e `node_modules` fora do git.
6. Todo handler sensível verifica permissão; toda interação responde ou faz `defer` em até 3 s.
7. `docs/qa-report.md` termina com `VEREDITO: PASS`.

## Regras do portão de qualidade
- Só o `qa-engineer` emite PASS. Dev não aprova o próprio trabalho.
- Qualquer defeito de severidade média ou maior = FAIL.
- Em FAIL, o QA lista os defeitos por dono; o dev corrige e entrega de novo; o QA **revalida tudo**, não só o corrigido.
- Depois de 3 ciclos FAIL no mesmo card, o orquestrador para e leva o problema ao usuário.
- Commit só depois do PASS. Mensagem de commit referencia os cards (`STK-001` ou chave do Jira).
- Mudança de escopo ou bug novo encontrado no caminho vira **novo card** pelo `jira-manager`, não é resolvido "por fora".

## Comandos do projeto
```
npm install        # dependências
npm run lint       # ESLint
npm test           # testes (node:test), sem acesso ao Firebase real
npm start          # roda o bot
npm run deploy     # registra os slash commands
```
