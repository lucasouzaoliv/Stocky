import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerDados } from '@/server/drogas/operacoes';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 2 }, async () => responderOk(await lerDados()));
