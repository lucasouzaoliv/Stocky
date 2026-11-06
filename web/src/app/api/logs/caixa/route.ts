import { comAutorizacao } from '@/server/auth/autorizacao';
import { responderOk } from '@/server/http';
import { lerLogs } from '@/server/logs/leitura';
import { lerPaginacao } from '@/server/paginacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 2 }, async ({ req }) =>
  responderOk(await lerLogs('caixa', lerPaginacao(req.nextUrl.searchParams))),
);
