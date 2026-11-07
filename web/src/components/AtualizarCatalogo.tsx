'use client';

import { useRef, useState } from 'react';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface AtualizarCatalogoProps {
  cliente?: ClienteApi;
}

/** Gerência e dono (nível 2 ou mais). A segurança real é o 403 da rota. */
export function AtualizarCatalogo({ cliente = apiPadrao }: AtualizarCatalogoProps) {
  const sessao = useSessaoOpcional();
  if (!sessao || sessao.usuario.nivel < 2) return null;
  return <AtualizarCatalogoDono cliente={cliente} csrf={sessao.csrf} />;
}

function AtualizarCatalogoDono({ cliente, csrf }: { cliente: ClienteApi; csrf: string }) {
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const trava = useRef(false);

  async function atualizar() {
    if (trava.current) return;
    if (!window.confirm('Trocar o catálogo pelo da season atual e colocar nos baús o estoque contado? O estoque atual dos baús será substituído.')) return;
    trava.current = true;
    setEnviando(true);
    setMensagem('');
    try {
      const r = await cliente.post<{ removidos: number; adicionados: number }>('/api/catalogo/atualizar', {}, { csrf });
      setMensagem(r.ok ? `Pronto: ${r.dados.removidos} itens removidos, ${r.dados.adicionados} adicionados. Recarregue a página.` : r.mensagem);
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <section className="painel__bloco" aria-labelledby="painel-atualizar">
      <h2 id="painel-atualizar" className="painel__titulo">
        Atualizar catálogo
      </h2>
      <p className="painel__ajuda">Troca a lista de itens pela da season atual e coloca nos dois baús o estoque contado nos prints. O estoque atual dos baús é substituído.</p>
      <div className="bau__acoes">
        <button type="button" className="botao botao--perigo" onClick={() => void atualizar()} disabled={enviando}>
          {enviando ? 'Atualizando…' : 'Atualizar catálogo'}
        </button>
      </div>
      <p className="bau__aviso" role="status" aria-live="polite">
        {mensagem}
      </p>
    </section>
  );
}
