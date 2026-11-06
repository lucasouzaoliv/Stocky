# Como colocar o Stocky no ar (checklist para a pessoa dona)

Você não precisa saber programar. Siga na ordem e marque cada passo. Tenha à mão uma pasta de notas **privada** (bloco de notas no seu computador, nunca em chat público) para guardar os valores que for copiando. **Nunca cole esses valores em lugar público.**

Os nomes em `ASSIM` são os nomes das variáveis. Na Vercel, você vai criar uma variável para cada um, colando o valor que anotou.

## Antes de começar
- [ ] Você é administrador do servidor do Discord.
- [ ] Você tem conta no Google (para o Firebase), no Discord e na Vercel (pode entrar com o GitHub).
- [ ] No Discord: Configurações, Avançado, ligue o **Modo Desenvolvedor** (para poder copiar IDs).

## Parte 1. Firebase (o banco de dados)
- [ ] Entre em console.firebase.google.com e crie um projeto (ou abra o do Stocky).
- [ ] Menu Build, Firestore Database, Criar banco de dados. Escolha **modo produção** e a região **southamerica-east1 (São Paulo)**.
- [ ] Engrenagem, Configurações do projeto, aba **Contas de serviço**, botão **Gerar nova chave privada**. Vai baixar um arquivo `.json`.
- [ ] Abra o arquivo no bloco de notas e copie:
  - o texto depois de `"project_id":` para `FIREBASE_PROJECT_ID`
  - o texto depois de `"client_email":` para `FIREBASE_CLIENT_EMAIL`
  - o texto depois de `"private_key":` (tudo, desde `-----BEGIN` até `END PRIVATE KEY-----\n`) para `FIREBASE_PRIVATE_KEY`
- [ ] Depois de copiar, **apague o arquivo baixado** do computador e da lixeira.
- [ ] **Chave antiga:** a chave do Firebase que ficou no repositório público do bot antigo deve ser considerada vazada. No console.cloud.google.com, IAM e administrador, Contas de serviço, abra a conta **antiga**, aba Chaves, e **exclua a chave antiga** (ou desative a conta). Sem isso, não faça o deploy.

## Parte 2. Regras e índice do Firestore (obrigatório)
Pede ajuda a quem tem o projeto no computador, ou faça pelo console:
- [ ] Firestore, aba **Regras**: apague o que estiver lá, cole o conteúdo do arquivo `web/firestore.rules` (ele bloqueia todo acesso direto) e clique em **Publicar**.
- [ ] Firestore, aba **Índices**, **Criar índice**: coleção `auditoria`; campo `acao` crescente; campo `data` decrescente; escopo da coleção. Espere o status ficar **Ativado**. Sem este índice o filtro da tela de Auditoria quebra.

## Parte 3. Discord: o aplicativo
- [ ] Entre em discord.com/developers/applications, **New Application**, dê o nome (ex.: Stocky).
- [ ] Em **General Information**, copie o **Application ID** para `DISCORD_CLIENT_ID`.
- [ ] Menu **OAuth2**, copie o **Client Secret** (clique em Reset Secret se não aparecer) para `DISCORD_CLIENT_SECRET`.
- [ ] No servidor, botão direito no nome do servidor, **Copiar ID do servidor** para `DISCORD_GUILD_ID`.
- [ ] Cargos: Configurações do servidor, Cargos, botão direito no cargo, **Copiar ID**. Junte os IDs separados por vírgula:
  - cargos de dono para `DISCORD_ROLE_DONO`
  - cargos de gerência para `DISCORD_ROLE_GERENTE`
  - cargos de membro para `DISCORD_ROLE_MEMBRO`
- [ ] **O Redirect URI vem depois** (Parte 5), quando você souber o endereço do site.

## Parte 4. Discord: os seis webhooks
Para cada canal: Editar canal, Integrações, Webhooks, Novo webhook, **Copiar URL do webhook**. Cole cada URL na variável do canal certo:
- [ ] canal de log do baú dos membros: `WEBHOOK_LOG_MEMBROS`
- [ ] canal de log do baú da gerência: `WEBHOOK_LOG_GERENCIA`
- [ ] canal de log do caixa: `WEBHOOK_LOG_CAIXA`
- [ ] canal de inventário dos membros: `WEBHOOK_INVENTARIO_MEMBROS`
- [ ] canal de inventário da gerência: `WEBHOOK_INVENTARIO_GERENCIA`
- [ ] canal do saldo do caixa: `WEBHOOK_SALDO_CAIXA`

## Parte 5. Vercel (o site)
- [ ] Entre em vercel.com, **Add New, Project**, escolha o repositório do Stocky.
- [ ] Em **Root Directory** clique em Edit e escolha a pasta **web**. (A região São Paulo, `gru1`, já está configurada no arquivo `vercel.json`.)
- [ ] Em **Environment Variables**, crie uma por uma todas as variáveis abaixo (marque só **Production**):
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`
  - `DISCORD_ROLE_MEMBRO`, `DISCORD_ROLE_GERENTE`, `DISCORD_ROLE_DONO`
  - `WEBHOOK_LOG_MEMBROS`, `WEBHOOK_LOG_GERENCIA`, `WEBHOOK_LOG_CAIXA`, `WEBHOOK_INVENTARIO_MEMBROS`, `WEBHOOK_INVENTARIO_GERENCIA`, `WEBHOOK_SALDO_CAIXA`
  - `SESSION_SECRET`: invente uma senha longa e aleatória, com **32 letras/números ou mais** (um gerenciador de senhas gera). Guarde-a.
  - `APP_URL`: na primeira vez coloque `https://stocky.vercel.app` (provisório); você acerta no passo seguinte.
- [ ] Clique em **Deploy**. Ao terminar, a Vercel mostra o endereço real do site (algo como `https://nome-do-projeto.vercel.app`). Copie.
- [ ] Em Settings, Environment Variables, edite `APP_URL` para o endereço real: **começa com https://, sem barra no final**, sem nada depois. Depois vá em Deployments, menu do último deploy, **Redeploy**.

## Parte 6. Discord: o Redirect URI
- [ ] No Developer Portal, OAuth2, em **Redirects**, **Add Redirect**, cole o endereço do site seguido de `/api/auth/callback`. Exemplo: `https://nome-do-projeto.vercel.app/api/auth/callback`. Clique em **Save Changes**.

## Parte 7. Conferir
- [ ] Abra o site e clique em entrar com o Discord. Autorize.
- [ ] Você deve ver os baús e o catálogo padrão (ele é criado sozinho na primeira entrada).
- [ ] Teste adicionar um item e veja se o aviso aparece no canal do Discord.
- [ ] Peça a alguém sem cargo para tentar entrar: deve ser recusado.

## Se algo der errado
- **"Configuração inválida" com nomes de variáveis:** aquelas variáveis estão vazias ou erradas na Vercel. Corrija e faça Redeploy.
- **Erro de redirect no Discord:** o Redirect URI não é idêntico ao endereço do site mais `/api/auth/callback`.
- **Auditoria dá erro ao filtrar:** o índice (Parte 2) não foi criado ou ainda não está Ativado.
- **Endereços de "preview" da Vercel não fazem login.** É esperado; use só o endereço de produção.

## Se um segredo vazar
Gere outro no mesmo lugar onde nasceu (nova chave do Firebase e exclusão da antiga, Reset Secret no Discord, nova URL de webhook, novo `SESSION_SECRET`), atualize na Vercel e faça Redeploy. Trocar o `SESSION_SECRET` desconecta todo mundo.
