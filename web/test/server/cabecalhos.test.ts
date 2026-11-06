import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { proxy } from '@/proxy';
import { CABECALHOS_FIXOS, montarCsp } from '@/server/seguranca/cabecalhos';

const diretivas = (csp: string) => new Map(csp.split('; ').map((d) => [d.split(' ')[0] ?? '', d] as const));

describe('WEB-025 cabeçalhos de segurança', () => {
  it('AC1: valores esperados dos cabeçalhos fixos', () => {
    expect(CABECALHOS_FIXOS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
  });

  it('AC1: CSP tem as diretivas obrigatórias', () => {
    const d = diretivas(montarCsp('NONCE', true));
    expect(d.get('default-src')).toBe("default-src 'self'");
    expect(d.get('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(d.get('object-src')).toBe("object-src 'none'");
    expect(d.get('base-uri')).toBe("base-uri 'self'");
    expect(d.get('form-action')).toMatch(/^form-action 'self'/);
    expect(d.get('script-src')).toContain("'nonce-NONCE'");
  });

  it('AC2: sem unsafe-eval em produção; unsafe-inline só em style-src', () => {
    const csp = montarCsp('N', true);
    expect(csp).not.toContain('unsafe-eval');
    const d = diretivas(csp);
    for (const [nome, texto] of d) {
      if (nome !== 'style-src') expect(texto, nome).not.toContain('unsafe-inline');
    }
    expect(d.get('style-src')).toContain("'unsafe-inline'");
  });

  it('AC2: unsafe-eval só fora de produção e só em script-src', () => {
    const d = diretivas(montarCsp('N', false));
    expect(d.get('script-src')).toContain("'unsafe-eval'");
    expect(montarCsp('N', false).match(/unsafe-eval/g)).toHaveLength(1);
  });

  it('proxy aplica CSP com nonce novo por requisição e os cabeçalhos fixos', () => {
    const a = proxy(new NextRequest('http://localhost:3000/'));
    const b = proxy(new NextRequest('http://localhost:3000/'));
    const cspA = a.headers.get('content-security-policy') ?? '';
    expect(cspA).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(cspA).not.toBe(b.headers.get('content-security-policy'));
    for (const [k, v] of Object.entries(CABECALHOS_FIXOS)) expect(a.headers.get(k), k).toBe(v);
  });

  it('AC3: /api/** recebe Cache-Control: no-store', async () => {
    const regras = (await nextConfig.headers?.()) ?? [];
    const api = regras.find((r) => r.source === '/api/:path*');
    expect(api?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' });
  });

  it('AC4: X-Powered-By desativado', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
