import { LIMITES } from '@/compartilhado/limites';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { preverAjuste } from '@/server/bau/ajuste';
import { exigirTipoBau } from '@/server/dominio/refs';
import { responderOk } from '@/server/http';
import { esquemaPrevia, validarCorpo } from '@/server/validacao/corpo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nível 2 para os dois baús. Somente leitura: o servidor não guarda estado de prévia. */
export const POST = comAutorizacao<{ tipo: string }>(
  { nivel: 2, corpoMax: LIMITES.CORPO_AJUSTE_MAX_BYTES },
  async ({ params, corpo }) => {
    const tipo = exigirTipoBau(params.tipo);
    const { linhas } = validarCorpo(esquemaPrevia, corpo);
    return responderOk(await preverAjuste(tipo, linhas));
  },
);
