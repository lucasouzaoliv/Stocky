'use client';

import {
  Banknote,
  Ellipsis,
  History,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Vault,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { NOME_FACCAO, SUBTITULO_FACCAO } from '@/compartilhado/marca';
import { api } from '@/components/api';

export type NivelNavegacao = 1 | 2 | 3;

interface ItemMenu {
  rotulo: string;
  href: string;
  nivelMinimo: NivelNavegacao;
  icone: LucideIcon;
  /** Fica na barra inferior do celular; os demais entram no menu "Mais". */
  principal: boolean;
}

export const ITENS_MENU: readonly ItemMenu[] = [
  { rotulo: 'Baú dos Membros', href: '/bau/membros', nivelMinimo: 1, icone: Warehouse, principal: true },
  { rotulo: 'Baú da Gerência', href: '/bau/gerencia', nivelMinimo: 2, icone: Vault, principal: true },
  { rotulo: 'Caixa', href: '/caixa', nivelMinimo: 2, icone: Banknote, principal: true },
  { rotulo: 'Painel', href: '/painel', nivelMinimo: 2, icone: LayoutDashboard, principal: false },
  { rotulo: 'Movimentações', href: '/logs', nivelMinimo: 1, icone: History, principal: true },
  { rotulo: 'Auditoria', href: '/auditoria', nivelMinimo: 2, icone: ScrollText, principal: false },
];

function itemAtual(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function Navegacao({ nivel, csrf }: { nivel: NivelNavegacao; csrf: string }) {
  const caminho = usePathname() ?? '';
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O menu "Mais" guarda o caminho em que foi aberto: ao navegar, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const maisAberto = abertoEm === caminho;
  const setMaisAberto = (aberto: boolean) => setAbertoEm(aberto ? caminho : null);
  const idMais = useId();
  const botaoMais = useRef<HTMLButtonElement>(null);

  const visiveis = ITENS_MENU.filter((item) => nivel >= item.nivelMinimo);
  const principais = visiveis.filter((i) => i.principal);
  const secundarios = visiveis.filter((i) => !i.principal);

  // Esc fecha o menu "Mais" e devolve o foco ao botão.
  useEffect(() => {
    if (!maisAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbertoEm(null);
      botaoMais.current?.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [maisAberto]);

  async function sair() {
    setSaindo(true);
    setErro(null);
    const resultado = await api.post('/api/auth/logout', {}, { csrf });
    if (!resultado.ok && resultado.codigo !== 'SEM_SESSAO') {
      setErro('Não foi possível sair. Tente de novo.');
      setSaindo(false);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  function link(item: ItemMenu) {
    const Icone = item.icone;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className="navegacao__item"
          aria-current={itemAtual(caminho, item.href) ? 'page' : undefined}
        >
          <Icone className="navegacao__icone" aria-hidden="true" focusable="false" />
          <span className="navegacao__rotulo">{item.rotulo}</span>
        </Link>
      </li>
    );
  }

  return (
    <nav className="navegacao" aria-label="Principal">
      <div className="navegacao__marca">
        <span className="navegacao__logo" aria-hidden="true" />
        <p className="navegacao__nome">{NOME_FACCAO}</p>
        <p className="navegacao__subtitulo">{SUBTITULO_FACCAO}</p>
      </div>
      <ul className="navegacao__lista">{principais.map(link)}</ul>
      <button
        ref={botaoMais}
        type="button"
        className="navegacao__item navegacao__mais"
        aria-expanded={maisAberto}
        aria-controls={idMais}
        onClick={() => setMaisAberto(!maisAberto)}
      >
        <Ellipsis className="navegacao__icone" aria-hidden="true" focusable="false" />
        <span className="navegacao__rotulo">Mais</span>
      </button>
      <div id={idMais} className="navegacao__secundaria" data-aberto={maisAberto ? 'sim' : 'nao'}>
        <ul className="navegacao__lista navegacao__lista--secundaria">
          {secundarios.map(link)}
          <li>
            <button type="button" className="navegacao__sair" onClick={sair} disabled={saindo}>
              <LogOut className="navegacao__icone" aria-hidden="true" focusable="false" />
              <span className="navegacao__rotulo">Sair</span>
            </button>
          </li>
        </ul>
        {erro ? (
          <p className="navegacao__erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
