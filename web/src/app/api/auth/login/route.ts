import { anexarCookie } from '@/server/auth/cookies';
import { rotaPublica } from '@/server/auth/autorizacao';
import { iniciarLogin } from '@/server/auth/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaPublica(async (req) => {
  const params = req.nextUrl.searchParams;
  const { url, cookieState } = await iniciarLogin(params.get('volta'), { consentir: params.get('consentimento') === '1' });
  const res = new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store' } });
  return anexarCookie(res, cookieState);
});
