import { comAutorizacao } from '@/server/auth/autorizacao';
import { anexarCookie } from '@/server/auth/cookies';
import { cookieApagarSessao } from '@/server/auth/sessao';
import { responderOk } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = comAutorizacao({ nivel: 'opcional' }, async () => anexarCookie(responderOk({}), cookieApagarSessao()));
