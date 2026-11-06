import { FRASE_ZERAR } from '@/compartilhado/limites';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { zerarBau } from '@/server/bau/zerar';
import { exigirAlvoZerar } from '@/server/dominio/refs';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaZerar, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exclusiva do dono (nível 3). Exige a frase `ZERAR` para evitar clique acidental e chamada forjada. */
export const POST = comAutorizacao({ nivel: 3 }, async ({ corpo, usuario }) => {
  if (!usuario) throw new ErroApp('SEM_SESSAO');
  const { alvo, confirmacao } = validarCorpo(esquemaZerar, corpo);
  const alvoValido = exigirAlvoZerar(alvo);
  if (confirmacao !== FRASE_ZERAR) throw new ErroApp('VALIDACAO', `Digite ${FRASE_ZERAR} para confirmar.`);
  return responderOk(await zerarBau(alvoValido, usuario));
});
