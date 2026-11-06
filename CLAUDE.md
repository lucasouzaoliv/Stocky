# Stocky

Gestão de baús e caixa de facção de GTA RP.
- **Site (ativo):** pasta `web/` — Next.js 16 + TypeScript, Firestore (firebase-admin só no servidor), login com Discord, deploy na Vercel (`https://stocky-amber.vercel.app`). Deploy automático a cada merge na `main`.
- **Bot do Discord (arquivado):** raiz do repositório (Node.js, discord.js v14). Não é mais usado.

## Como trabalhar aqui
Use o **fluxo leve**: `docs/web/FLUXO-LEVE.md` (orquestrador + no máximo um agente de front, sem Jira/QA pesado). O fluxo de 5 agentes (`docs/WORKFLOW.md`, `/workflow`) só para funções grandes, a pedido do dono. Contexto técnico do site: `docs/web/CONTEXTO.md`, `docs/web/architecture.md`.

## Regras
- Nenhum segredo no código nem no chat: variáveis de ambiente só na Vercel (`web/.env.example` tem valores falsos).
- Estoque e saldo mudam de forma atômica (transação do Firestore), com log/auditoria na mesma transação.
- Toda rota de API passa por `comAutorizacao`/`rotaPublica` com o nível mínimo (1 membro, 2 gerência, 3 dono). Zerar baú e remover item do catálogo: só nível 3.
- Antes de commitar, em `web/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Paleta: roxo, preto e branco (tokens em `web/src/app/globals.css`).
- Riscos conhecidos aceitos pelo dono: `docs/web/riscos-conhecidos.md`.
