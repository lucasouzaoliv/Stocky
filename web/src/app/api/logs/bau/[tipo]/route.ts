import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { exigirTipoBau } from '@/server/dominio/refs';
import { responderOk } from '@/server/http';
import { lerLogs } from '@/server/logs/leitura';
import { lerPaginacao } from '@/server/paginacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Membros (nível 1) leem só os logs do Baú dos Membros; os da gerência exigem nível 2. */
export const GET = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ req, params }) =>
  responderOk(await lerLogs(exigirTipoBau(params.tipo), lerPaginacao(req.nextUrl.searchParams))),
);
