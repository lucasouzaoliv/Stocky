# Fluxo leve (padrão a partir de 06/11/2026)

O fluxo de 5 agentes (`docs/WORKFLOW.md`) foi feito para construir o site do zero e é **pesado demais** para ajustes de tela e pequenas mudanças. Para o dia a dia use este:

1. **Direto ao ponto:** o orquestrador (Claude) mais, no máximo, um agente `frontend-dev`. Sem Jira, sem arquiteto, sem QA independente, sem backlog.
2. **Mudou só visual ou texto?** Só front: `web/src/app/**` (exceto api), `web/src/components/**`, `globals.css`, `web/test/ui/**`. Não mexa em `web/src/server/**`.
3. **Mudou regra de negócio, permissão ou dado?** Aí sim mexe no servidor, com teste junto. Uma pessoa só, sem cerimônia.
4. **Verificação rápida antes de commitar** (em `web/`): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Tudo verde, sem aviso. Leva cerca de 2 minutos.
5. **Visual:** conferir por captura de tela em 360 px (celular) e 1280 px (computador) antes de mostrar ao dono.
6. **Commit pequeno e deploy pela `main`.** O deploy na Vercel é automático a cada merge na `main`.

## O que NÃO é cortado (protege estoque e dinheiro)
- Testes de permissão por nível (`web/test/server/cobertura-rotas.test.ts`, `rotas-*`).
- Testes de atomicidade e limites de baú e caixa.
- Varredura de segredos no bundle (`npm run verificar:bundle`).

## O que fica de fora do fluxo leve
- Rodadas de QA com sabotagem de código, ciclos de revalidação e relatório `qa-report.md`.
- Backlog em cards. Se o dono pedir uma função grande, aí reavalia usar `/workflow`.
