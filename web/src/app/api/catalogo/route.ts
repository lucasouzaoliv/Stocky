import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerCatalogo } from '@/server/catalogo/leitura';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 1 }, async () => responderOk(await lerCatalogo()));
