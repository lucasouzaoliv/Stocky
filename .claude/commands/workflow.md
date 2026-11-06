---
description: Executa o workflow completo (Jira Manager → Architect → Back/Front → QA) para uma demanda do Stocky
argument-hint: <descrição da demanda>
---

Execute o workflow de `docs/WORKFLOW.md` para esta demanda: $ARGUMENTS

Você é o orquestrador. Rode os agentes **em sequência**, sem pular etapas, passando a cada um o contexto necessário (cada agente começa sem memória):

1. **jira-manager**: criar os cards e o `docs/backlog.md`. Mostre ao usuário a tabela de cards antes de seguir se a demanda for ambígua.
2. **architect**: analisar os cards, escrever `docs/architecture.md` (contratos, donos de arquivo, ordem) e delegar.
3. **backend-dev** e **frontend-dev**: implementar cada card da sua camada. Rode em paralelo só quando os arquivos forem disjuntos e o contrato já estiver escrito; caso contrário, back primeiro e depois front.
4. **qa-engineer**: validar tudo e escrever `docs/qa-report.md`.
5. Se o veredito for **FAIL**: devolva os defeitos ao dev dono, aguarde a correção e chame o QA de novo. No máximo 3 ciclos por card; depois pare e consulte o usuário.
6. Se o veredito for **PASS**: peça ao **jira-manager** para concluir os cards e faça o commit referenciando os cards.

Regras: nada é entregue com erro de lint, teste falhando ou critério sem teste. Você mesmo confirma rodando `npm run lint` e `npm test` antes de declarar o trabalho pronto. Ao final, informe ao usuário em poucas linhas o que foi feito, o veredito do QA e qualquer pendência.
