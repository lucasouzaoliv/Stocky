# 📦 Stocky — Bot de Gerenciamento de Baú

Bot Discord para registro e controle de inventário (baú) e caixa de grupos em servidores de GTA/FiveM RP. Os membros registram o que guardam e retiram do baú; a gerência cuida do catálogo, do caixa e dos logs.

---

## Funcionalidades

- **Baú dos Membros e Baú da Gerência** — menus fixos nos canais com adicionar, remover e ver estoque
- **Painel da Gerência** — adicionar/remover itens do catálogo, zerar baú, ver logs e ajustar o inventário em massa
- **Caixa da Gangue** — controle de dinheiro sujo e limpo, com anotação e histórico em canal de log
- **Inventário em tempo real** — mensagens de inventário nos canais atualizadas após as movimentações
- **Logs** — registro de entradas e saídas com responsável, item e quantidade
- **Ajuste em massa** — a gerência edita o inventário de um baú inteiro de uma vez, por modal de texto, vê um resumo das alterações (antes e depois) e só então confirma por botão. Veja [Ajuste em massa](#ajuste-em-massa)
- **Auditoria** — remover item do catálogo, zerar baú e ajuste em massa gravam um registro na coleção `auditoria` do Firestore, na mesma transação da operação (usuário, data/hora, alvo, estado antes e depois). Ainda não existe tela de leitura desse registro: consulte-o direto no console do Firebase
- **Painéis fixos** — o id da mensagem dos painéis de inventário e de saldo do caixa fica guardado na coleção `paineis`, e o bot edita essa mesma mensagem a cada movimentação
- **Firebase Firestore** — dados persistentes entre deploys

---

## Stack

- [Node.js](https://nodejs.org/) (>= 18)
- [discord.js v14](https://discord.js.org/)
- [Firebase Firestore](https://firebase.google.com/) via `firebase-admin`
- Hospedagem no [Railway](https://railway.app/)

---

## Pré-requisitos

- Node.js **18 ou superior**
- Um bot criado no [Discord Developer Portal](https://discord.com/developers/applications), convidado para o servidor
- Um projeto Firebase com Firestore e uma conta de serviço (service account)
- Os cargos (membro, gerente, dono) e os canais listados abaixo já criados no servidor

---

## Variáveis de ambiente

Todas as variáveis abaixo são **obrigatórias**. Se alguma faltar, o bot não inicia e informa quais.

### Discord e servidor (`utils/config.js`)

| Variável | Descrição |
|---|---|
| `TOKEN` | Token do bot |
| `CLIENT_ID` | ID da aplicação (bot) |
| `GUILD_ID` | ID do servidor onde os comandos são registrados |
| `ROLE_MEMBRO` | ID do cargo de membro |
| `ROLE_GERENTE` | ID do cargo de gerente |
| `ROLE_DONO` | ID do cargo de dono |
| `CH_BAU_MEMBROS` | Canal do menu do Baú dos Membros |
| `CH_BAU_GERENCIA` | Canal do menu do Baú da Gerência |
| `CH_LOG_MEMBROS` | Canal de log do Baú dos Membros |
| `CH_LOG_GERENCIA` | Canal de log do Baú da Gerência |
| `CH_INV_MEMBROS` | Canal do inventário dos Membros |
| `CH_INV_GERENCIA` | Canal do inventário da Gerência |
| `CH_PAINEL_GERENCIA` | Canal do Painel da Gerência |
| `CH_CAIXA` | Canal do menu do caixa |
| `CH_LOG_CAIXA` | Canal de log do caixa |
| `CH_SALDO_CAIXA` | Canal do saldo do caixa |

Opcional: `COR` — cor dos embeds, como número inteiro ou hexadecimal (`#3498db`). Padrão: `3447003`.

### Firebase (`utils/firebase.js`)

| Variável | Descrição |
|---|---|
| `FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `FIREBASE_CLIENT_EMAIL` | E-mail da conta de serviço |
| `FIREBASE_PRIVATE_KEY` | Chave privada da conta de serviço (use `\n` literal no lugar das quebras de linha) |
| `FIREBASE_PRIVATE_KEY_ID` | ID da chave privada |

### Exemplo (valores FALSOS, apenas ilustrativos)

```env
TOKEN=token-falso-do-bot
CLIENT_ID=111111111111111111
GUILD_ID=222222222222222222
ROLE_MEMBRO=333333333333333333
ROLE_GERENTE=444444444444444444
ROLE_DONO=555555555555555555
CH_BAU_MEMBROS=100000000000000001
CH_BAU_GERENCIA=100000000000000002
CH_LOG_MEMBROS=100000000000000003
CH_LOG_GERENCIA=100000000000000004
CH_INV_MEMBROS=100000000000000005
CH_INV_GERENCIA=100000000000000006
CH_PAINEL_GERENCIA=100000000000000007
CH_CAIXA=100000000000000008
CH_LOG_CAIXA=100000000000000009
CH_SALDO_CAIXA=100000000000000010
FIREBASE_PROJECT_ID=meu-projeto-falso
FIREBASE_CLIENT_EMAIL=conta-falsa@meu-projeto-falso.example.com
FIREBASE_PRIVATE_KEY=chave-privada-falsa-com-\n-literais
FIREBASE_PRIVATE_KEY_ID=id-falso-da-chave
```

---

## Configuração

### No Railway

1. Crie um serviço a partir do repositório.
2. Em **Variables**, cadastre todas as variáveis das tabelas acima.
3. O comando de início é `npm start`.
4. Registre os comandos uma vez (veja abaixo) a partir de uma máquina com as mesmas variáveis.

### Localmente

1. Clone o repositório e instale as dependências: `npm install`
2. Informe a configuração do Discord de **uma** destas formas:
   - **Variáveis de ambiente** (as tabelas acima), ou
   - **`config.json` (opcional)**: copie `config.example.json` para `config.json` e preencha. Se o arquivo existir, ele tem prioridade sobre as variáveis do Discord.
3. As variáveis `FIREBASE_*` sempre vêm do ambiente; não existem no `config.json`.
4. O `start.js` **não gera** `config.json`; ele apenas lê a configuração.
5. O `config.json` e o `.env` estão no `.gitignore`.

### Registrar os comandos e iniciar

```bash
npm run deploy   # registra os slash commands no servidor (GUILD_ID)
npm start        # inicia o bot
```

Depois, no servidor, use `/setup` (tipo: Baú dos Membros, Baú da Gerência ou Painel da Gerência) e `/setup-caixa` para publicar as mensagens fixas nos canais. Cada comando deve ser usado uma vez por canal.

---

## Permissões por cargo

Os níveis são hierárquicos: dono inclui gerente, que inclui membro. Quem não tem nenhum dos três cargos não acessa nada.

| Ação | Membro | Gerente | Dono |
|---|:---:|:---:|:---:|
| Usar o Baú dos Membros (adicionar, remover, ver estoque) | sim | sim | sim |
| Usar o Baú da Gerência | não | sim | sim |
| Painel da Gerência (catálogo, zerar baú, logs, ajuste em massa) | não | sim | sim |
| Caixa da Gangue | não | sim | sim |
| `/setup` e `/setup-caixa` | não | sim | sim |

Os comandos funcionam apenas dentro do servidor (não em mensagem direta).

---

## Limites de entrada

| Campo | Limite |
|---|---|
| Quantidade por item | até 100.000 |
| Valor por operação do caixa | até 1.000.000.000 |
| Nome de item | até 50 caracteres |
| ID gerado do item | até 50 caracteres |
| Itens por categoria | até 25 |
| Anotação do caixa | até 100 caracteres |
| Linhas por ajuste em massa | até 200 |

Quantidades e valores devem ser números inteiros positivos, sem pontos, vírgulas ou sinais.

---

## Ajuste em massa

No Painel da Gerência, os botões "Ajustar Baú Membros" e "Ajustar Baú Gerência" abrem um modal para colar o inventário em texto:

```
# Armas
Colt: 3
# Medicamentos
Gaze: 120
```

- Cada linha `# Categoria` abre uma seção; as linhas seguintes são `Item: quantidade`, separadas no último `:`. Sem cabeçalho, o item é procurado em todas as categorias (e é recusado se existir em mais de uma).
- Quantidade é um inteiro de 0 a 100.000; `0` remove o item do baú. Nome e categoria ignoram maiúsculas e acentos.
- No máximo 200 linhas não vazias. Se houver qualquer linha inválida (categoria ou item inexistente, item repetido, quantidade inválida), **nada é gravado** e o bot lista os erros por linha.
- Se o texto é válido, o bot mostra um resumo só do que muda e dois botões, Confirmar e Cancelar. Nada é gravado antes da confirmação.
- A confirmação vale por **10 minutos** e **só quem gerou o ajuste** pode confirmar ou cancelar. Ela fica em memória: se o bot reiniciar, refaça o ajuste. Cada confirmação só pode ser usada uma vez.
- Ao confirmar, o ajuste é aplicado em uma única transação, junto com o registro em `auditoria`, e o painel de inventário é atualizado.

---

## Testes e lint

```bash
npm test         # testes (node:test), com Firestore falso em memória
npm run lint     # ESLint
```

Os testes nunca acessam o banco real. O `test/readme.test.js` confere que este README continua batendo com o código (variáveis, limites, licença, links e scripts).

---

## Segurança

- **Nunca** faça commit de tokens, chaves ou do `config.json`/`.env`. Credenciais vivem só em variáveis de ambiente.
- Se uma chave do Firebase **já esteve no código ou no histórico do git**, considere-a comprometida: **revogue-a** no console do Firebase/Google Cloud e **gere uma nova**. Remover a chave do código não basta, pois o histórico continua acessível.
- Se o token do bot vazar, gere um novo no Discord Developer Portal.

---

## Desenvolvimento

Toda mudança segue o fluxo de agentes descrito em [`docs/WORKFLOW.md`](docs/WORKFLOW.md). As regras do projeto para quem desenvolve (inclusive com Claude Code) estão em [`CLAUDE.md`](CLAUDE.md). Nada é concluído sem testes passando e lint limpo.

---

## Aviso

> Este projeto foi desenvolvido com auxílio do **Claude AI (Anthropic)** como ferramenta de aprendizado e desenvolvimento assistido por IA.

---

## Licença

[ISC](LICENSE)
