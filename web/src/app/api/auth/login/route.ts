import { anexarCookie } from '@/server/auth/cookies';
import { iniciarLogin } from '@/server/auth/oauth';
import { responderErro } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const params = new URL(req.url).searchParams;
    const { url, cookieState } = await iniciarLogin(params.get('volta'), { consentir: params.get('consentimento') === '1' });
    const res = new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store' } });
    return anexarCookie(res, cookieState);
  } catch (e) {
    return responderErro(e);
  }
}
