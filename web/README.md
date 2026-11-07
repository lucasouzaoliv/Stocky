# Stocky Web

Site que substitui o bot de Discord do Stocky para gerir o estoque (baús) e o caixa de uma facção de GTA RP. Não precisa de nada ligado 24h: roda na Vercel, guarda os dados no Firebase Firestore e avisa o Discord por webhooks.

O que tem: Baú dos Membros, Baú da Gerência, Caixa da gangue (dinheiro sujo e limpo), painel da gerência (catálogo, zerar baú, ajuste em massa), logs de movimentação, auditoria e avisos nos canais do Discord. Quem entra é decidido pelos cargos do Discord.

## Requisitos

- Node.js 22 (`engines` em `package.json`) e npm.
- Um projeto Firebase com Firestore em `southamerica-east1` (São Paulo).
- Um aplicativo no Discord Developer Portal e acesso de administrador ao servidor.
- Uma conta na Vercel (plano Hobby serve) com este repositório conectado.

## Níveis de acesso

| Nível | Quem | O que pode |
|---|---|---|
| 1 Membro | cargos de `DISCORD_ROLE_MEMBRO` | Baú dos Membros e seus logs |
| 2 Gerente | cargos de `DISCORD_ROLE_GERENTE` | tudo do nível 1, Baú da Gerência, caixa, ajuste em massa, logs e auditoria |
| 3 Dono | cargos de `DISCORD_ROLE_DONO` | tudo do nível 2, zerar baú e remover item do catálogo |

Vale o maior nível encontrado. Quem não está no servidor ou não tem nenhum cargo configurado não entra. A permissão é checada no servidor em toda rota. Os cargos são conferidos de novo a cada 12 horas e a sessão dura no máximo 7 dias.

## Limites de entrada

- Quantidade de item por operação: inteiro de 1 a 100.000.
- Valor do caixa por operação: inteiro de 1 a 1.000.000.000.
- Nome de item: até 50 caracteres; no máximo 25 itens por categoria.
- Ajuste em massa: até 200 linhas.
- Limite de requisições: 60 por minuto por usuário e 10 por minuto por IP no login. É contado na memória de cada instância da Vercel, portanto é aproximado (defesa contra abuso acidental).

## Variáveis de ambiente

Os nomes abaixo são exatamente os que o site lê (`src/server/env.ts`). Os valores nunca vão para o repositório: localmente ficam em `.env.local` (ignorado pelo git) e na Vercel ficam em Project Settings, Environment Variables. Use `.env.example` como modelo (só tem valores falsos).

Se faltar ou estiver inválida alguma variável, o site recusa iniciar e a mensagem lista os nomes problemáticos (nunca os valores).

| Variável | Tipo | O que é e onde obter |
|---|---|---|
| `FIREBASE_PROJECT_ID` | segredo | Campo `project_id` do JSON da conta de serviço. |
| `FIREBASE_CLIENT_EMAIL` | segredo | Campo `client_email` do JSON (termina em `iam.gserviceaccount.com`). |
| `FIREBASE_PRIVATE_KEY` | segredo | Campo `private_key` do JSON, inteiro, com os `\n`. Pode colar entre aspas. |
| `DISCORD_CLIENT_ID` | público | Developer Portal, aba General Information, Application ID. |
| `DISCORD_CLIENT_SECRET` | segredo | Developer Portal, aba OAuth2, Client Secret (Reset Secret gera um). |
| `DISCORD_GUILD_ID` | público | ID do servidor (Discord com Modo Desenvolvedor, botão direito no servidor, Copiar ID). |
| `DISCORD_ROLE_MEMBRO` | público | IDs dos cargos de nível 1, separados por vírgula. |
| `DISCORD_ROLE_GERENTE` | público | IDs dos cargos de nível 2, separados por vírgula. |
| `DISCORD_ROLE_DONO` | público | IDs dos cargos de nível 3, separados por vírgula. |
| `SESSION_SECRET` | segredo | Texto aleatório com 32 caracteres ou mais (veja abaixo como gerar). |
| `APP_URL` | público | Endereço do site, sem barra no fim nem caminho: `https://<seu-projeto>.vercel.app`. Local: `http://localhost:3000`. |
| `WEBHOOK_LOG_MEMBROS` | segredo | Webhook do canal de log do Baú dos Membros. |
| `WEBHOOK_LOG_GERENCIA` | segredo | Webhook do canal de log do Baú da Gerência. |
| `WEBHOOK_LOG_CAIXA` | segredo | Webhook do canal de log do caixa. |
| `WEBHOOK_INVENTARIO_MEMBROS` | segredo | Webhook do canal com o inventário dos membros. |
| `WEBHOOK_INVENTARIO_GERENCIA` | segredo | Webhook do canal com o inventário da gerência. |
| `WEBHOOK_SALDO_CAIXA` | segredo | Webhook do canal com o saldo do caixa. |

Regras: pelo menos um cargo no total entre `DISCORD_ROLE_MEMBRO`, `DISCORD_ROLE_GERENTE` e `DISCORD_ROLE_DONO`; cada ID é número de 17 a 20 dígitos; webhooks são `https://discord.com/api/webhooks/<id>/<token>`.

Gerar o `SESSION_SECRET`:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Passo a passo da configuração

### 1. Firebase: chave da conta de serviço

1. Abra o Console do Firebase, crie (ou escolha) o projeto e ative o Firestore em modo produção, região `southamerica-east1`.
2. Engrenagem ao lado de "Visão geral", Configurações do projeto, aba Contas de serviço.
3. Clique em Gerar nova chave privada e confirme. Baixa um arquivo `.json`.
4. Copie do arquivo `project_id`, `client_email` e `private_key` para as três variáveis do Firebase. Depois apague o arquivo baixado; ele não pode ir para o repositório.

### 2. Firebase: regras e índice (passo obrigatório)

As regras negam todo acesso direto de clientes; só o servidor (Admin SDK) lê e escreve. O índice composto da auditoria é obrigatório: sem ele, filtrar a auditoria por ação falha em produção.

Com a Firebase CLI, dentro de `web/`:

```
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project <id-do-projeto>
```

Sem a CLI: no Console, Firestore, aba Regras, cole o conteúdo de `firestore.rules` e publique; aba Índices, crie o índice composto na coleção `auditoria` com os campos `acao` (crescente) e `data` (decrescente). A definição de referência está em `firestore.indexes.json`. Espere o índice ficar com status Ativado.

### 3. Discord: aplicativo e Redirect URI

1. Em https://discord.com/developers/applications, crie um aplicativo (New Application).
2. Aba OAuth2: copie o Client ID e o Client Secret para as variáveis.
3. Em Redirects, adicione exatamente `https://<dominio>/api/auth/callback` (o mesmo endereço do `APP_URL`, mais `/api/auth/callback`). Para testar local, adicione também `http://localhost:3000/api/auth/callback`. Salve.
4. Os escopos usados são `identify` e `guilds.members.read`; o site os pede sozinho.
5. Para os IDs de cargo e do servidor, ative o Modo Desenvolvedor (Configurações do Discord, Avançado) e use Copiar ID.

### 4. Discord: webhooks

Para cada canal de aviso: Editar canal, Integrações, Webhooks, Novo webhook, Copiar URL do webhook. São seis canais, um para cada variável de webhook da tabela. A URL é segredo: quem a tem escreve no canal.

### 5. Deploy na Vercel

1. Na Vercel, Add New Project e importe o repositório.
2. Em Root Directory escolha `web`. O framework Next.js é detectado; `vercel.json` já fixa a região das funções em `gru1` (São Paulo), perto do Firestore.
3. Em Environment Variables, cadastre todas as variáveis da tabela, para Production. Não use "Preview": os deploys de preview têm outro endereço e não conseguem fazer login.
4. Deploy. Se o `APP_URL` ainda não era conhecido, copie o endereço gerado, ajuste a variável, volte ao Discord para conferir o Redirect URI e faça Redeploy.
5. Abra o site, entre com o Discord e confira que o catálogo padrão aparece (ele é criado na primeira execução).

Passo a passo mais simples, para quem não programa: `docs/web/DEPLOY.md`.

## Rotação da chave antiga do Firebase

A chave do Firebase que esteve no repositório público do bot é tratada como vazada. Antes do deploy: no Console do Firebase, Contas de serviço, gere uma conta/chave nova só para o site e use-a nas variáveis; depois, no Google Cloud Console, IAM e administrador, Contas de serviço, abra a conta antiga, aba Chaves, e exclua a chave antiga (ou desative a conta). O mesmo vale para qualquer segredo que apareça em lugar público: gere outro (Reset Secret no Discord, nova URL de webhook, novo `SESSION_SECRET`), atualize na Vercel e faça Redeploy. Trocar o `SESSION_SECRET` encerra todas as sessões.

## Rodar localmente

```
cd web
npm ci
cp .env.example .env.local   # preencha com valores reais
npm run dev
```

Abra http://localhost:3000. O Redirect URI local precisa estar cadastrado no Discord (passo 3).

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run start` | serve o build de produção |
| `npm run lint` | ESLint, sem avisos permitidos |
| `npm run typecheck` | verificação de tipos (`tsc --noEmit`) |
| `npm test` | testes (Vitest); usam Firestore falso, nunca o banco real |
| `npm run verificar:bundle` | confere que nenhum segredo foi parar no código enviado ao navegador |
| `npm run verificar:build` | constrói sem nenhuma variável de ambiente (sem `warn`/`Failed`), sobe `npm run start` e confere `/login` 200, `/api/caixa` 401 e os cabeçalhos de segurança; encerra o servidor ao fim |

Os testes e o build usam apenas valores falsos; nenhum precisa de credencial real.

## Segurança

- Nenhum segredo no código nem no navegador. Nunca cole chaves, tokens ou URLs de webhook em issues, commits ou conversas.
- O Firestore nega todo acesso de cliente; só o servidor acessa.
- Sessão em cookie `httpOnly`, `Secure`, `SameSite=Lax`, assinada; proteção contra CSRF nas rotas que alteram dados.
- Só produção (`APP_URL`) e `localhost` fazem login.
- Ids de item que coincidem com chaves de `Object.prototype` (como `constructor`) são recusados ao criar o item, e toda leitura de estoque por id usa só chaves próprias.

### Texto livre (nome do item e anotação do caixa)

Os dois passam por uma única função, `sanearTexto` (`src/server/validacao/texto.ts`): NFC, espaços exóticos (`\p{Zs}`, `\p{Zl}`, `\p{Zp}`, tabulação, quebras) viram um espaço comum, e são **removidos** controles (`\p{Cc}`), caracteres de formato (`\p{Cf}`: ZWSP, ZWNJ, ZWJ, LRM/RLM, LRE/RLE/PDF/LRO/RLO, isolates, BOM, soft hyphen, tag chars), seletores de variação, CGJ, preenchedores do hangul e o braille em branco. O texto precisa ter ao menos uma letra, número, pontuação ou símbolo, senão a resposta é 400. Duplicados no catálogo comparam o id gerado **e** o nome normalizado (NFKC, sem diacríticos, minúsculas), então "Colt" não tem gêmeo visual.

Decisão sobre emojis: como ZWJ e seletor de variação são removidos, sequências como 👨‍👩‍👧 viram três emojis separados e ❤️ vira ❤ (sem estilo emoji). Perde-se um pouco de estética em troca de nenhum jeito de esconder ou inverter conteúdo. Está coberto em `test/server/validacao-item.test.ts`.

### Riscos aceitos

- **Logout não revoga o JWT no servidor.** A sessão é assinada e sem estado: `POST /api/auth/logout` apaga o cookie do navegador, mas um cookie copiado antes continua válido até expirar (no máximo 7 dias). O risco é limitado pela revalidação de cargos a cada 12 horas (quem perde o cargo perde o acesso) e pelo `httpOnly`/`Secure` do cookie. Revogar exigiria ler uma lista de sessões revogadas no Firestore a cada requisição, custo maior que o risco para este site.
- **State do OAuth sem uso único no servidor.** O state é um JWT assinado, de 10 minutos, no cookie `httpOnly` `stocky_oauth` (`Path=/api/auth`), e o callback sempre o apaga. Reapresentar o mesmo cookie e o mesmo `state` dentro dessa janela passa a checagem, mas o código de autorização do Discord só vale uma vez, então o login não se repete. Invalidar o state exigiria gravar cada uso no Firestore (uma escrita extra por login, mais limpeza), custo maior que o risco: quem tem o cookie `httpOnly` já controla o navegador da vítima.
- **Dependências de produção com 6 avisos moderados** (`glob`/`minimatch` via `rimraf`, `gaxios`, `google-gax` dentro do `firebase-admin`). O `npm audit fix` não altera nada (a correção exige `google-gax` 6, versão major, que o `firebase-admin` fixado ainda não aceita). O site nunca chama `glob` com entrada do usuário. Reavaliar a cada atualização do `firebase-admin`.

## Licença

MIT (arquivo `LICENSE`).
