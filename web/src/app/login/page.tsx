import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TelaLogin } from '@/components/TelaLogin';
import { haSessaoValida } from './usuario-logado';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  if (await haSessaoValida()) redirect('/');
  const { erro } = await searchParams;
  return <TelaLogin erro={Array.isArray(erro) ? erro[0] : erro} />;
}
