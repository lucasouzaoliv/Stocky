'use client';

import { useId, useState } from 'react';
import { DROGA, PRECO, calcularVenda } from '@/compartilhado/drogas';
import { formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { CampoQuantidade } from '@/components/CampoQuantidade';

/** Só calcula: não registra nada nem cobra ninguém. */
export function Calculadora() {
  const [quantidade, setQuantidade] = useState('');
  const [destino, setDestino] = useState<'parceria' | 'pista'>('pista');
  const idTitulo = useId();
  const q = parseInteiro(quantidade, { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
  const calculo = q.ok ? calcularVenda(destino, q.valor) : null;

  return (
    <section className="droga" aria-labelledby={idTitulo}>
      <h1 id={idTitulo} className="bau__titulo">Calculadora</h1>
      <p className="painel__ajuda">Veja quanto cobrar na venda de {DROGA.nome}. Aqui nada é registrado.</p>
      <form className="caixa__form" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Calcular venda">
        <fieldset className="escolha">
          <legend className="campo__rotulo">Para quem é a venda?</legend>
          <div className="escolha__opcoes">
            <label className="escolha__opcao">
              <input type="radio" name="calc-destino" checked={destino === 'parceria'} onChange={() => setDestino('parceria')} />
              <span>Parceria ({formatarDinheiro(PRECO.parceria)})</span>
            </label>
            <label className="escolha__opcao">
              <input type="radio" name="calc-destino" checked={destino === 'pista'} onChange={() => setDestino('pista')} />
              <span>Pista ({formatarDinheiro(PRECO.pista)})</span>
            </label>
          </div>
        </fieldset>
        <CampoQuantidade rotulo="Quantidade" valor={quantidade} aoMudar={setQuantidade} erro={quantidade.trim() !== '' && !q.ok ? q.erro : null} />
        <div className="droga__resultado" role="status" aria-live="polite">
          {calculo && q.ok ? (
            <>
              <p className="droga__calculo">
                {formatarNumero(q.valor)}x a {formatarDinheiro(calculo.unitario)} cada{calculo.atacado ? ' (atacado)' : ''}
              </p>
              <p className="droga__total">{formatarDinheiro(calculo.total)}</p>
            </>
          ) : (
            <p className="painel__ajuda">Digite a quantidade.</p>
          )}
        </div>
        <p className="painel__ajuda">
          Pista acima de {formatarNumero(PRECO.LIMITE_ATACADO)} unidades: {formatarDinheiro(PRECO.pistaAtacado)} cada.
        </p>
      </form>
    </section>
  );
}
