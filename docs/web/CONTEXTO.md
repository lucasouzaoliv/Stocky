# Contexto do projeto web (substitui a stack descrita nos agentes)

Quando a atividade for do site (pasta `web/`), **este arquivo prevalece** sobre qualquer menção a discord.js, interações, embeds, botões, modais ou `utils/` do bot nos arquivos dos agentes e em `docs/WORKFLOW.md`. O resto do workflow (cards, arquitetura, ondas, QA como portão, Definition of Done) continua valendo.

## Stack
- Next.js (App Router) com TypeScript estrito, em `web/`. Versões atuais estáveis; o architect confirma na documentação oficial.
- Firebase Firestore pelo Admin SDK, **apenas no servidor** (rotas e server actions).
- Login com Discord OAuth2 (escopos `identify` e `guilds.members.read`).
- Webhooks do Discord para avisos.
- Testes com Vitest (e Testing Library para componentes); ESLint com a config do Next; `tsc --noEmit` para tipos. O architect define scripts `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Hospedagem na Vercel (Hobby).

## Territórios (nunca dois agentes no mesmo arquivo na mesma onda)
- **backend-dev:** `web/src/server/**` (Firestore, transações, auth, sessão, Discord, webhooks, validação, permissões, auditoria), `web/src/app/api/**` (rotas), `web/package.json`, configs (`next.config`, `tsconfig`, eslint, vitest, regras do Firestore em `web/firestore.rules`), e os testes dessas camadas em `web/test/server/**`.
- **frontend-dev:** `web/src/app/**` exceto `api`, `web/src/components/**`, estilos, acessibilidade, e os testes de interface em `web/test/ui/**`. Consome as rotas e funções pelo contrato do architect.
- **qa-engineer:** só `web/test/qa/**` e `docs/web/qa-report.md`.
- **architect:** `docs/web/architecture.md`.
- **jira-manager:** `docs/web/backlog.md`.

## Regras que valem para todos
- Segredos só por variável de ambiente; nunca em código, testes, README, logs ou no navegador. Em testes, valores falsos óbvios.
- Toda rota e toda server action verifica sessão e nível no servidor antes de qualquer leitura ou escrita.
- Toda alteração de dados em transação, com auditoria e log na mesma transação.
- O front nunca fala com o Firestore direto.
- Interface em português do Brasil, responsiva (celular primeiro, porque a galera usa no celular durante o jogo), acessível (teclado, contraste, rótulos), com estados de carregamento, vazio e erro.
- Ler `docs/web/requisitos.md` e `docs/review-findings.md`/`docs/qa-report.md` (lições do bot) antes de começar.
