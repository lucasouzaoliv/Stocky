# Riscos conhecidos no primeiro deploy

Decisão do dono do projeto (06/11/2026): publicar mesmo com o QA em **FAIL** no ciclo 3.
Relatório completo: `docs/web/qa-report.md`. Nada abaixo é grave de segurança de dados; são defeitos de qualidade de texto e de teste.

| ID | Severidade | O que é | Efeito |
|---|---|---|---|
| QA-W15 | Média | 7 caracteres invisíveis raros (Khmer U+17B4/17B5, Mongolian U+180B-180D/180F, Khitan U+16FE4) não são removidos | Um gerente consegue criar um item com nome visualmente igual a outro ("Colt") |
| QA-W16 | Média | Apelido do Discord não é limpo | Um membro pode ter apelido com caracteres de direção/invisíveis e bagunçar a linha dos avisos no Discord ou se passar por outro nome |
| QA-W20 | Média (só teste) | Teste `sessao.test.ts:37` falha às vezes (compara relógio exato) | Código correto; só o teste é instável. CI pode ficar vermelho em algumas execuções |
| QA-W18 | Baixa | Embeds não neutralizam direção em nomes já gravados | Só dados legados |
| QA-W19 | Baixa | Letras cirílicas/gregas parecidas com latinas criam item "gêmeo" | Só por ação de um gerente |
| QA-W17 | Observação | `comAutorizacao` não confere o método HTTP | Sem efeito hoje (Next responde 405) |

Os testes do QA que provam esses defeitos (`web/test/qa/ciclo3-unicode.test.ts` e parte de `ciclo3-adversarial.test.ts`) ficam vermelhos de propósito até as correções. Por isso o CI do GitHub aparece vermelho; a Vercel não depende do CI.

Correção sugerida (próximo ciclo, pequeno): usar `\p{Default_Ignorable_Code_Point}` mais U+2800 e U+16FE4 em `server/validacao/texto.ts`; sanear o apelido em `server/discord/api.ts`; tornar o teste de sessão independente do relógio.
