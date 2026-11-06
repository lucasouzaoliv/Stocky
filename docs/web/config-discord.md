# Configuração do Discord (IDs públicos, não são segredos)

- DISCORD_CLIENT_ID=1480244621715046565
- DISCORD_GUILD_ID=1561468121733267486

## Cargos por nível (um nível pode ter vários cargos)
- Dono (nível 3): `liderança` = 1561468121733267495
- Gerência (nível 2): `OG - Original Gangster` = 1563258601575813191, `Gerente` = 1561468121733267493
- Membro (nível 1): `Membro` = 1561468121733267491, `Baby Gangster` = 1561468121733267490

Consequência técnica: `DISCORD_ROLE_MEMBRO`, `DISCORD_ROLE_GERENTE` e `DISCORD_ROLE_DONO` aceitam **lista separada por vírgula**.
Vale o maior nível encontrado. Dono implica gerência e membro; gerência implica membro.

Segredos (nunca no repositório): DISCORD_CLIENT_SECRET, chave do Firebase, SESSION_SECRET, URLs de webhook.
