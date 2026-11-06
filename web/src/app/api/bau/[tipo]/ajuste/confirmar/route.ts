import { LIMITES } from '@/compartilhado/limites';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { confirmarAjuste } from '@/server/bau/ajuste';
import { exigirTipoBau } from '@/server/dominio/refs';
import { ErroApp } from '@/server/erros';
import { responderOk } from '@/server/http';
import { esquemaConfirmar, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nível 2 para os dois baús. A versão vista na prévia viaja no corpo e é conferida dentro da transação. */
export const POST = comAutorizacao<{ tipo: string }>(
  { nivel: 2, corpoMax: LIMITES.CORPO_AJUSTE_MAX_BYTES },
  async ({ params, corpo, usuario }) => {
    if (!usuario) throw new ErroApp('SEM_SESSAO');
    const tipo = exigirTipoBau(params.tipo);
    const { versao, linhas } = validarCorpo(esquemaConfirmar, corpo);
    return responderOk(await confirmarAjuste(tipo, versao, linhas, usuario));
  },
);
