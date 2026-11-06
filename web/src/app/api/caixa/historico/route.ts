import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerHistoricoCaixa } from '@/server/caixa/leitura';
import { responderOk } from '@/server/http';
import { lerPaginacao } from '@/server/paginacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 2 }, async ({ req }) =>
  responderOk(await lerHistoricoCaixa(lerPaginacao(req.nextUrl.searchParams))),
);
