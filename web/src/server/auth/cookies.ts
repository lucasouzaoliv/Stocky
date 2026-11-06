import 'server-only';

export interface DefinicaoCookie {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

export function serializarCookie(c: DefinicaoCookie): string {
  const partes = [`${c.name}=${c.value}`, `Path=${c.path}`, `Max-Age=${c.maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  if (c.secure) partes.push('Secure');
  return partes.join('; ');
}

export function anexarCookie(res: Response, c: DefinicaoCookie): Response {
  res.headers.append('Set-Cookie', serializarCookie(c));
  return res;
}

export function lerCookie(req: Request, nome: string): string | undefined {
  const bruto = req.headers.get('cookie');
  if (!bruto) return undefined;
  for (const parte of bruto.split(';')) {
    const igual = parte.indexOf('=');
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() === nome) return parte.slice(igual + 1).trim();
  }
  return undefined;
}
