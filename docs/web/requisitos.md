# Stocky Web: requisitos

Site que substitui o bot de Discord para gerir o estoque (baús) e o caixa de uma facção de GTA RP (Marabunta Grande). Uma facção só. Substitui o bot: nada precisa ficar ligado 24h.

## Decisões já tomadas com o usuário
- **Login:** Discord OAuth2. O site lê os cargos do usuário no servidor e converte em nível: `membro` (1), `gerente` (2), `dono` (3). Quem não está no servidor ou não tem cargo configurado não entra.
- **Stack:** Next.js (App Router) hospedado na Vercel (plano Hobby, grátis) + Firebase Firestore (Admin SDK, só no servidor).
- **Avisos no Discord:** webhooks (sem bot). Movimentações, inventário atualizado e saldo do caixa continuam aparecendo nos canais.
- **Uma facção só.** Sem multi-tenant.
- **Pasta do projeto:** `web/` neste repositório. O bot antigo (raiz do repositório) fica arquivado e não é mais evoluído.
- **Google Analytics:** desligado.

## O que o site precisa ter (paridade com o bot)
1. **Baú dos Membros** (nível 1+) e **Baú da Gerência** (nível 2+): ver estoque por categoria, adicionar e remover itens com quantidade.
2. **Caixa da gangue** (nível 2+): dinheiro sujo e limpo, entrada e saída com anotação obrigatória, histórico.
3. **Painel da gerência** (nível 2+): catálogo (adicionar e remover item, por categoria), zerar baú (um ou ambos), ajuste em massa de inventário com resumo antes/depois e confirmação.
4. **Logs de movimentação** por baú e **Auditoria** (remover item do catálogo, zerar baú, ajuste em massa). A tela de auditoria é nova: o bot só gravava.
5. **Avisos por webhook** dos eventos acima, nos canais configurados.
6. **Catálogo padrão** semeado na primeira execução (categorias: Medicamentos, Armas, Coletes e Munição, Materiais, Drogas, Extras; itens como no bot).

## Regras de negócio (vêm do bot revisado, mantêm-se)
- Quantidade de item por operação: inteiro estrito entre 1 e 10.000.000. Valor do caixa por operação: inteiro estrito entre 1 e 1.000.000.000. Sem ponto, vírgula, sinal ou texto misturado.
- Nome de item: até 50 caracteres; id gerado a partir do nome (sem acento, minúsculo, `_`), nunca vazio, sem colisão (nem entre nomes equivalentes). Máximo de 25 itens por categoria. Até 200 linhas por ajuste em massa.
- Estoque nunca fica negativo; ao chegar a zero o item some do baú.
- Toda alteração de estoque e de saldo é **atômica** (transação do Firestore). Registro de auditoria e log são gravados **na mesma transação** da alteração.
- Permissão é decidida **no servidor, em toda rota**, nunca só escondendo botão na tela.
- Erros ao usuário em português, curtos, sem detalhes internos.

## Lições do QA do bot (não repetir)
- **D3 (média):** o ajuste em massa gravava valores absolutos de um resumo velho; movimentações feitas entre o resumo e a confirmação eram apagadas sem aviso. No site, o ajuste deve usar **controle de versão otimista** (recusar se o baú mudou desde o resumo e pedir para refazer) ou aplicar **diferenças**, nunca sobrescrever às cegas.
- **D1 (média):** formato de texto com `# Categoria` rejeitava nomes de item iniciados por `#`. No site, preferir edição em tabela na tela; se houver importação por texto, o formato não pode ser ambíguo com nomes válidos.
- **D2:** respeitar limites de tamanho de mensagem do Discord nos webhooks (embeds: 6000 caracteres no total, 1024 por campo, 4096 na descrição, no máximo 10 embeds por mensagem).
- **D6:** semear o catálogo padrão dentro de transação.
- Dependências sem vulnerabilidade conhecida crítica ou alta no `npm audit` ao entregar.

## Segurança (requisitos não funcionais)
- Firestore com regras que **negam todo acesso de cliente**; só as rotas de servidor (Admin SDK) leem e escrevem.
- Sessão em cookie `httpOnly`, `Secure`, `SameSite=Lax`, assinado, com expiração; checagem periódica dos cargos no Discord; proteção contra CSRF nas rotas que alteram dados; validação de toda entrada no servidor; limite de requisições por usuário.
- Nenhum segredo no código nem no navegador (só variáveis de ambiente da Vercel). Webhooks são segredos.
- Cabeçalhos de segurança (CSP razoável, frame-ancestors none, etc.).

## Variáveis de ambiente previstas (Vercel)
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_ROLE_MEMBRO`, `DISCORD_ROLE_GERENTE`, `DISCORD_ROLE_DONO`, `SESSION_SECRET`, `APP_URL`, e um webhook por canal de aviso (log do baú dos membros, log do baú da gerência, inventário dos membros, inventário da gerência, saldo do caixa, log do caixa). O architect pode refinar a lista.

## Fora do escopo agora
Multi-facção, aplicativo móvel, notificações push, importação do estoque antigo (o banco antigo foi apagado; o inventário inicial entra pela tela de ajuste em massa).

## Critério de pronto
Definition of Done de `docs/WORKFLOW.md` adaptada ao site: lint e verificação de tipos sem erro nem aviso, testes passando (incluindo testes de permissão em todas as rotas, concorrência e validação), build de produção sem erro, nenhum segredo no repositório, `npm audit` sem vulnerabilidade crítica ou alta, e veredito PASS do QA.


## Atualização: cargos em lista
`DISCORD_ROLE_MEMBRO/GERENTE/DONO` aceitam lista separada por vírgula (ver `docs/web/config-discord.md`). WEB-018 deve testar lista, espaços, vazio e maior nível vencendo.


## Região
Firestore em southamerica-east1 (São Paulo), confirmado pelo usuário. Função da Vercel fixada em `gru1` (vercel.json, onda 7).
