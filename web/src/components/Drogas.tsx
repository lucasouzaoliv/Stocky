'use client';

import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { EstadoDrogaDTO, ResultadoDrogaDTO, TipoBau } from '@/compartilhado/api-tipos';
import {
  DROGA,
  MOTIVOS_GUARDAR,
  MOTIVOS_RETIRADA,
  calcularVenda,
  motivoCobra,
  type AcaoDroga,
  type MotivoRetirada,
} from '@/compartilhado/drogas';
import { formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Aviso, useAviso } from '@/components/Aviso';
import { CampoQuantidade } from '@/components/CampoQuantidade';
import { Carregando, ErroTela } from '@/components/Estados';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface DrogasProps {
  cliente?: ClienteApi;
}

interface Pedido {
  acao: AcaoDroga;
  quantidade: number;
  motivo: string;
  deposito: number;
}

export function Drogas({ cliente = apiPadrao }: DrogasProps) {
  const sessao = useSessaoOpcional();
  const csrf = sessao?.csrf;
  const nivel = sessao?.usuario.nivel ?? 1;
  const [tipo, setTipo] = useState<TipoBau>('membros');
  const [estado, setEstado] = useState<EstadoDrogaDTO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [acao, setAcao] = useState<AcaoDroga>('retirar');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [deposito, setDeposito] = useState('');
  const [erros, setErros] = useState<{ quantidade?: string; motivo?: string; deposito?: string }>({});
  const [confirmando, setConfirmando] = useState<Pedido | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [depositoPendente, setDepositoPendente] = useState('');
  const [erroDepositoPendente, setErroDepositoPendente] = useState<string | null>(null);
  const trava = useRef(false);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const { aviso, mostrar, fechar } = useAviso();
  const idTitulo = useId();
  const idMotivo = useId();

  const carregar = useCallback(
    async (sinal?: AbortSignal) => {
      const r = await cliente.get<EstadoDrogaDTO>(`/api/drogas/${tipo}`, { signal: sinal });
      if (sinal?.aborted) return;
      if (r.ok) {
        setEstado(r.dados);
        setErro(null);
      } else {
        setErro(r.mensagem);
      }
    },
    [cliente, tipo],
  );

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void (async () => {
      const r = await cliente.get<EstadoDrogaDTO>(`/api/drogas/${tipo}`, { signal: controle.signal });
      if (!ativo) return;
      if (r.ok) {
        setEstado(r.dados);
        setErro(null);
      } else {
        setErro(r.mensagem);
      }
    })();
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [cliente, tipo, tentativa]);

  useEffect(() => {
    if (confirmando) botaoConfirmar.current?.focus();
  }, [confirmando]);

  const opcoesMotivo = acao === 'retirar' ? MOTIVOS_RETIRADA : MOTIVOS_GUARDAR;

  function trocarAcao(a: AcaoDroga) {
    setAcao(a);
    setMotivo('');
    setErros({});
  }

  function validar(): Pedido | null {
    const q = parseInteiro(quantidade, { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
    const novosErros: typeof erros = {};
    if (!q.ok) novosErros.quantidade = q.erro;
    if (!motivo) novosErros.motivo = 'Escolha o motivo.';
    let dep = 0;
    if (deposito.trim() !== '') {
      const d = parseInteiro(deposito, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
      if (d.ok) dep = d.valor;
      else novosErros.deposito = d.erro;
    }
    setErros(novosErros);
    if (!q.ok || !motivo || novosErros.deposito) return null;
    return { acao, quantidade: q.valor, motivo, deposito: dep };
  }

  function pedir() {
    if (trava.current) return;
    const p = validar();
    if (!p) return;
    if (p.acao === 'retirar' && motivoCobra(p.motivo as MotivoRetirada)) setConfirmando(p);
    else void enviar(p);
  }

  async function enviar(p: Pedido) {
    if (trava.current) return;
    trava.current = true;
    setEnviando(true);
    setConfirmando(null);
    try {
      const corpo: Record<string, unknown> = { acao: p.acao, quantidade: p.quantidade, motivo: p.motivo };
      if (p.deposito > 0) corpo.deposito = p.deposito;
      const r = await cliente.post<ResultadoDrogaDTO>(`/api/drogas/${tipo}/movimentar`, corpo, csrf ? { csrf } : undefined);
      if (!r.ok) {
        mostrar({ tipo: 'erro', texto: r.mensagem });
        return;
      }
      setQuantidade('');
      setDeposito('');
      setMotivo('');
      const resto = r.dados.devido > 0 ? ` Falta depositar ${formatarDinheiro(r.dados.devido)} no caixa.` : '';
      mostrar({
        tipo: 'sucesso',
        texto: `${p.acao === 'retirar' ? 'Retirada' : 'Entrada'} registrada: ${formatarNumero(p.quantidade)}x ${DROGA.nome}.${resto}`,
      });
      await carregar();
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  async function depositarPendencia() {
    if (trava.current) return;
    const v = parseInteiro(depositoPendente, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
    setErroDepositoPendente(v.ok ? null : v.erro);
    if (!v.ok) return;
    trava.current = true;
    setEnviando(true);
    try {
      const r = await cliente.post<{ devido: number }>('/api/drogas/depositar', { valor: v.valor }, csrf ? { csrf } : undefined);
      if (!r.ok) {
        mostrar({ tipo: 'erro', texto: r.mensagem });
        return;
      }
      setDepositoPendente('');
      mostrar({
        tipo: 'sucesso',
        texto: r.dados.devido > 0 ? `Depósito registrado. Ainda falta ${formatarDinheiro(r.dados.devido)}.` : 'Depósito registrado. Você está em dia.',
      });
      await carregar();
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  const calculo = confirmando ? calcularVenda(confirmando.motivo as MotivoRetirada, confirmando.quantidade) : null;

  return (
    <section className="droga" aria-labelledby={idTitulo}>
      <h1 id={idTitulo} className="bau__titulo">Drogas</h1>

      {nivel >= 2 ? (
        <fieldset className="escolha">
          <legend className="campo__rotulo">Baú</legend>
          <div className="escolha__opcoes">
            {(['membros', 'gerencia'] as const).map((t) => (
              <label key={t} className="escolha__opcao">
                <input type="radio" name="droga-bau" value={t} checked={tipo === t} onChange={() => { setEstado(null); setTipo(t); }} />
                <span>{t === 'membros' ? 'Membros' : 'Gerência'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {erro !== null && estado === null ? (
        <ErroTela mensagem={erro} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
      ) : estado === null ? (
        <Carregando mensagem="Carregando…" />
      ) : (
        <>
          <p className="droga__estoque">
            <span>{DROGA.nome} no baú</span>
            <strong>{formatarNumero(estado.estoque)}</strong>
          </p>

          {estado.minhaPendencia > 0 ? (
            <section className="droga__pendencia" role="alert" aria-label="Pendência de depósito">
              <p>
                <TriangleAlert aria-hidden="true" focusable="false" /> Você precisa depositar <strong>{formatarDinheiro(estado.minhaPendencia)}</strong> no caixa.
              </p>
              <div className="droga__linha">
                <CampoQuantidade rotulo="Valor depositado" valor={depositoPendente} aoMudar={setDepositoPendente} erro={erroDepositoPendente} desabilitado={enviando} />
                <button type="button" className="botao" disabled={enviando} onClick={() => void depositarPendencia()}>
                  Registrar depósito
                </button>
              </div>
            </section>
          ) : null}

          <form className="caixa__form" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Movimentar droga">
            <fieldset className="escolha" disabled={enviando}>
              <legend className="campo__rotulo">O que você vai fazer?</legend>
              <div className="escolha__opcoes">
                <label className="escolha__opcao">
                  <input type="radio" name="droga-acao" checked={acao === 'retirar'} onChange={() => trocarAcao('retirar')} />
                  <span>Retirar</span>
                </label>
                <label className="escolha__opcao">
                  <input type="radio" name="droga-acao" checked={acao === 'guardar'} onChange={() => trocarAcao('guardar')} />
                  <span>Guardar</span>
                </label>
              </div>
            </fieldset>
            <div className="caixa__campos">
              <CampoQuantidade rotulo="Quantidade" valor={quantidade} aoMudar={setQuantidade} erro={erros.quantidade} desabilitado={enviando} />
              <div className="campo">
                <label className="campo__rotulo" htmlFor={idMotivo}>Motivo</label>
                <select
                  id={idMotivo}
                  className="campo__entrada"
                  value={motivo}
                  disabled={enviando}
                  aria-invalid={erros.motivo ? true : undefined}
                  onChange={(e) => setMotivo(e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {opcoesMotivo.map(([id, rotulo]) => (
                    <option key={id} value={id}>{rotulo}</option>
                  ))}
                </select>
                {erros.motivo ? <p className="campo__erro" role="alert">{erros.motivo}</p> : null}
              </div>
              <CampoQuantidade rotulo="Dinheiro depositado no caixa (opcional)" valor={deposito} aoMudar={setDeposito} erro={erros.deposito} desabilitado={enviando} />
            </div>
            <div className="caixa__acoes">
              <button type="button" className={`botao ${acao === 'retirar' ? 'botao--saida' : 'botao--entrada'}`} disabled={enviando} onClick={pedir}>
                {enviando ? 'Registrando…' : acao === 'retirar' ? 'Retirar' : 'Guardar'}
              </button>
            </div>
            <Aviso aviso={aviso} aoFechar={fechar} />
          </form>
        </>
      )}

      {confirmando && calculo ? (
        <div className="modal" role="presentation" onKeyDown={(e) => { if (e.key === 'Escape') setConfirmando(null); }}>
          <div className="modal__caixa" role="dialog" aria-modal="true" aria-labelledby={`${idTitulo}-modal`}>
            <h2 id={`${idTitulo}-modal`} className="caixa__form-titulo">Quanto cobrar</h2>
            <p className="droga__calculo">
              {formatarNumero(confirmando.quantidade)}x {DROGA.nome} a {formatarDinheiro(calculo.unitario)} cada
              {calculo.atacado ? ' (preço de atacado)' : ''}
            </p>
            <p className="droga__total">{formatarDinheiro(calculo.total)}</p>
            <p className="painel__ajuda">
              Cobre esse valor do cliente e deposite no caixa. Você fica em pendência até depositar.
            </p>
            <div className="caixa__acoes">
              <button type="button" className="botao" ref={botaoConfirmar} onClick={() => void enviar(confirmando)}>
                Confirmar retirada
              </button>
              <button type="button" className="botao botao--secundario" onClick={() => setConfirmando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
