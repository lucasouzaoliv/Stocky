'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export type NivelNavegacao = 1 | 2 | 3;

interface ItemMenu {
  rotulo: string;
  href: string;
  nivelMinimo: NivelNavegacao;
}

export const ITENS_MENU: readonly ItemMenu[] = [
  { rotulo: 'Baú dos Membros', href: '/bau/membros', nivelMinimo: 1 },
  { rotulo: 'Baú da Gerência', href: '/bau/gerencia', nivelMinimo: 2 },
  { rotulo: 'Caixa', href: '/caixa', nivelMinimo: 2 },
  { rotulo: 'Painel', href: '/painel', nivelMinimo: 2 },
  { rotulo: 'Logs', href: '/logs', nivelMinimo: 1 },
  { rotulo: 'Auditoria', href: '/auditoria', nivelMinimo: 2 },
];

function itemAtual(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function Navegacao({ nivel, csrf }: { nivel: NivelNavegacao; csrf: string }) {
  const caminho = usePathname() ?? '';
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function sair() {
    setSaindo(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: '{}',
      });
      if (!resposta.ok) throw new Error('logout');
      router.replace('/login');
      router.refresh();
    } catch {
      setErro('Não foi possível sair. Tente de novo.');
      setSaindo(false);
    }
  }

  return (
    <nav className="navegacao" aria-label="Principal">
      <p className="navegacao__marca">Stocky</p>
      <ul className="navegacao__lista">
        {ITENS_MENU.filter((item) => nivel >= item.nivelMinimo).map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="navegacao__item"
              aria-current={itemAtual(caminho, item.href) ? 'page' : undefined}
            >
              {item.rotulo}
            </Link>
          </li>
        ))}
        <li>
          <button type="button" className="navegacao__sair" onClick={sair} disabled={saindo}>
            Sair
          </button>
        </li>
      </ul>
      {erro ? (
        <p className="navegacao__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </nav>
  );
}
