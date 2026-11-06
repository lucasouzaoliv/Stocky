import { comAutorizacao } from '@/server/auth/autorizacao';
import { lerSaldo } from '@/server/caixa/leitura';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = comAutorizacao({ nivel: 2 }, async () => responderOk(await lerSaldo()));
