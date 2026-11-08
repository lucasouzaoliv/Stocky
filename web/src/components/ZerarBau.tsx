'use client';

import { useId, useRef, useState } from 'react';
import type { AlvoZerar, ZerarDTO } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { FRASE_ZERAR } from '@/compartilhado/limites';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Dialogo } from '@/components/Dialogo';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface ZerarBauProps {
  cliente?: ClienteApi;
}

const OPCOES: Array<[AlvoZerar, string]> = [
  ['membros', 'Baú dos Membros'],
  ['gerencia', 'Baú da Gerência'],
  ['casa', 'Baú da Casa'],
  ['ambos', 'Os três baús'],
];

const DESCRICAO_ALVO: Record<AlvoZerar, string> = {
  membros: 'o Baú dos Membros',
  gerencia: 'o Baú da Gerência',
  casa: 'o Baú da Casa',
  ambos: 'o Baú dos Membros, o Baú da Gerência e o Baú da Casa',
};

const RESULTADO_ALVO: Record<AlvoZerar, string> = {
  membros: 'do Baú dos Membros',
  gerencia: 'do Baú da Gerência',
  casa: 'do Baú da Casa',
  ambos: 'dos três baús',
};

/** Exclusivo do dono (nível 3): para os demais não renderiza nada. A segurança real é o 403 da rota. */
export function ZerarBau({ cliente = apiPadrao }: ZerarBauProps) {
  const sessao = useSessaoOpcional();
  if (!sessao || sessao.usuario.nivel < 3) return null;
  return <ZerarBauDono cliente={cliente} csrf={sessao.csrf} />;
}

function ZerarBauDono({ cliente, csrf }: { cliente: ClienteApi; csrf: string }) {
  const [alvo, setAlvo] = useState<AlvoZerar>('membros');
  const [aberto, setAberto] = useState(false);
  const [frase, setFrase] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState('');
  const trava = useRef(false);
  const idTitulo = useId();
  const idFrase = useId();

  function abrir() {
    setFrase('');
    setErro(null);
    setResultado('');
    setAberto(true);
  }

  async function confirmar() {
    if (trava.current || frase !== FRASE_ZERAR) return;
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const r = await cliente.post<ZerarDTO>('/api/bau/zerar', { alvo, confirmacao: FRASE_ZERAR }, { csrf });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      const { itens, unidades } = r.dados;
      setResultado(
        `Concluído: ${formatarNumero(itens)} ${itens === 1 ? 'item' : 'itens'} (${formatarNumero(unidades)} ${unidades === 1 ? 'unidade' : 'unidades'}) removidos ${RESULTADO_ALVO[alvo]}.`,
      );
      setAberto(false);
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <section className="zerar" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="painel__titulo">
        Zerar baú
      </h2>
      <p className="painel__ajuda">Apaga todo o estoque do baú escolhido. Só o dono pode fazer isso e não tem como desfazer pela tela.</p>
      <fieldset className="escolha">
        <legend className="campo__rotulo">Qual baú?</legend>
        <div className="escolha__opcoes">
          {OPCOES.map(([valor, rotulo]) => (
            <label key={valor} className="escolha__opcao">
              <input type="radio" name="alvo-zerar" value={valor} checked={alvo === valor} onChange={() => setAlvo(valor)} />
              <span>{rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="bau__acoes">
        <button type="button" className="botao botao--perigo" onClick={abrir}>
          Zerar baú…
        </button>
      </div>
      <p className="bau__aviso" role="status" aria-live="polite">
        {resultado}
      </p>

      {aberto ? (
        <Dialogo titulo="Confirmar" aoFechar={() => setAberto(false)} bloqueado={enviando}>
          <p>
            Você vai zerar {DESCRICAO_ALVO[alvo]}. Todo o estoque será apagado. A ação fica registrada na auditoria.
          </p>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={idFrase}>
              Digite {FRASE_ZERAR} para confirmar
            </label>
            <input
              id={idFrase}
              className="campo__entrada"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-autofoco=""
              value={frase}
              disabled={enviando}
              onChange={(e) => setFrase(e.target.value)}
            />
          </div>
          {erro ? (
            <p className="bau__erro" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="bau__acoes">
            <button type="button" className="botao botao--secundario" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </button>
            <button type="button" className="botao botao--perigo" disabled={frase !== FRASE_ZERAR || enviando} onClick={() => void confirmar()}>
              {enviando ? 'Zerando…' : 'Confirmar'}
            </button>
          </div>
        </Dialogo>
      ) : null}
    </section>
  );
}
