import { comAutorizacao, nivelDoBau } from '@/server/auth/autorizacao';
import { lerBau } from '@/server/bau/leitura';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao<{ tipo: string }>({ nivel: nivelDoBau }, async ({ params }) =>
  responderOk(await lerBau(params.tipo)),
);
