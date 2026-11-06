import { lerAuditoriaPorId } from '@/server/auditoria/leitura';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao<{ id: string }>({ nivel: 2 }, async ({ params }) =>
  responderOk(await lerAuditoriaPorId(params.id)),
);
