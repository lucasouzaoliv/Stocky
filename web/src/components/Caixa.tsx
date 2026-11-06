'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AcaoCaixa, LogCaixa, LogDTO, Pagina, SaldoDTO, TipoCaixa } from '@/compartilhado/api-tipos';
import { formatarData, formatarDinheiro } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { CampoQuantidade } from '@/components/CampoQuantidade';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface CaixaProps {
  /** Cliente HTTP; o padrão é o do navegador. Os testes injetam um falso. */
  cliente?: ClienteApi;
}

type MovimentoCaixa = { id: string } & LogCaixa;

const TAMANHO_PAGINA = 20;
const ROTULO_TIPO: Record<TipoCaixa, string> = { sujo: 'Dinheiro sujo', limpo: 'Dinheiro limpo' };
const ROTULO_ACAO: Record<AcaoCaixa, string> = { entrada: 'Entrada', saida: 'Saída' };

function ehMovimento(l: LogDTO): l is MovimentoCaixa {
  return 'tipo' in l && 'valor' in l;
}

export function Caixa({ cliente = apiPadrao }: CaixaProps) {
  const sessao = useSessaoOpcional();
  const csrf = sessao?.csrf;

  const [saldo, setSaldo] = useState<SaldoDTO | null>(null);
  const [erroSaldo, setErroSaldo] = useState<string | null>(null);
  const [historico, setHistorico] = useState<MovimentoCaixa[] | null>(null);
  const [proximo, setProximo] = useState<string | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const urlHistorico = (cursor: string | null) =>
    `/api/caixa/historico?limite=${TAMANHO_PAGINA}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

  const carregarHistorico = useCallback(
    async (sinal?: AbortSignal) => {
      const r = await cliente.get<Pagina<LogDTO>>(urlHistorico(null), { signal: sinal });
      return r;
    },
    [cliente],
  );

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void (async () => {
      const [s, h] = await Promise.all([
        cliente.get<SaldoDTO>('/api/caixa', { signal: controle.signal }),
        carregarHistorico(controle.signal),
      ]);
      if (!ativo) return;
      if (s.ok) {
        setSaldo(s.dados);
        setErroSaldo(null);
      } else {
        setErroSaldo(s.mensagem);
      }
      if (h.ok) {
        setHistorico(h.dados.itens.filter(ehMovimento));
        setProximo(h.dados.proximoCursor);
        setErroHistorico(null);
      } else {
        setErroHistorico(h.mensagem);
      }
    })();
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [cliente, carregarHistorico, tentativa]);

  function tentarDeNovo() {
    setSaldo(null);
    setErroSaldo(null);
    setHistorico(null);
    setErroHistorico(null);
    setTentativa((n) => n + 1);
  }

  async function carregarMais() {
    if (carregandoMais || !proximo) return;
    setCarregandoMais(true);
    try {
      const r = await cliente.get<Pagina<LogDTO>>(urlHistorico(proximo));
      if (!r.ok) {
        setErroHistorico(r.mensagem);
        return;
      }
      setErroHistorico(null);
      setHistorico((atual) => [...(atual ?? []), ...r.dados.itens.filter(ehMovimento)]);
      setProximo(r.dados.proximoCursor);
    } finally {
      setCarregandoMais(false);
    }
  }

  async function aoRegistrar(novoSaldo: SaldoDTO): Promise<void> {
    setSaldo(novoSaldo);
    const h = await carregarHistorico();
    if (h.ok) {
      setHistorico(h.dados.itens.filter(ehMovimento));
      setProximo(h.dados.proximoCursor);
      setErroHistorico(null);
    }
  }

  const idTitulo = useId();
  const falhaTotal = erroSaldo !== null && saldo === null;

  return (
    <section className="caixa" aria-labelledby={idTitulo}>
      <h1 id={idTitulo}>Caixa</h1>

      {falhaTotal ? (
        <ErroTela mensagem={erroSaldo} aoTentarNovamente={tentarDeNovo} />
      ) : saldo === null ? (
        <Carregando mensagem="Carregando o caixa…" />
      ) : (
        <>
          <dl className="caixa__saldos" aria-label="Saldos do caixa">
            <div className="caixa__saldo caixa__saldo--sujo">
              <dt>Dinheiro sujo</dt>
              <dd>{formatarDinheiro(saldo.sujo ?? 0)}</dd>
            </div>
            <div className="caixa__saldo caixa__saldo--limpo">
              <dt>Dinheiro limpo</dt>
              <dd>{formatarDinheiro(saldo.limpo ?? 0)}</dd>
            </div>
          </dl>

          <FormularioCaixa cliente={cliente} csrf={csrf} aoRegistrar={aoRegistrar} />

          <section className="caixa__historico" aria-labelledby={`${idTitulo}-hist`}>
            <h2 id={`${idTitulo}-hist`} className="bau__form-titulo">Histórico</h2>
            {historico === null && erroHistorico === null ? <Carregando mensagem="Carregando o histórico…" /> : null}
            {erroHistorico !== null ? (
              <ErroTela titulo="Não foi possível carregar o histórico" mensagem={erroHistorico} aoTentarNovamente={proximo || historico ? undefined : tentarDeNovo} />
            ) : null}
            {historico !== null && historico.length === 0 && erroHistorico === null ? (
              <Vazio titulo="Nenhuma movimentação" descricao="As entradas e saídas registradas aparecem aqui." />
            ) : null}
            {historico !== null && historico.length > 0 ? (
              <ul className="caixa__lista">
                {historico.map((m) => (
                  <li key={m.id} className={`caixa__mov caixa__mov--${m.acao}`}>
                    <div className="caixa__mov-topo">
                      <span className="caixa__mov-valor">
                        <span aria-hidden="true">{m.acao === 'entrada' ? '+' : '−'}</span>
                        <span className="sr-only">{ROTULO_ACAO[m.acao]}: </span>
                        {formatarDinheiro(m.valor)}
                      </span>
                      <span className="caixa__mov-tipo">{ROTULO_TIPO[m.tipo]}</span>
                    </div>
                    <p className="caixa__mov-nota">{m.anotacao}</p>
                    <p className="caixa__mov-meta">
                      <bdi>{m.usuario.nome}</bdi>, <time dateTime={m.data}>{formatarData(m.data)}</time>. Saldo depois: {formatarDinheiro(m.saldoResultante)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {proximo ? (
              <button type="button" className="botao botao--secundario" disabled={carregandoMais} onClick={() => void carregarMais()}>
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

function FormularioCaixa({
  cliente,
  csrf,
  aoRegistrar,
}: {
  cliente: ClienteApi;
  csrf: string | undefined;
  aoRegistrar: (saldo: SaldoDTO) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoCaixa>('limpo');
  const [acao, setAcao] = useState<AcaoCaixa>('entrada');
  const [valor, setValor] = useState('');
  const [anotacao, setAnotacao] = useState('');
  const [erroValor, setErroValor] = useState<string | null>(null);
  const [erroAnotacao, setErroAnotacao] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const trava = useRef(false);

  const idForm = useId();
  const idAnotacao = useId();

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    if (trava.current) return;
    setAviso('');
    setErroEnvio(null);
    const parse = parseInteiro(valor, { min: LIMITES.VALOR_CAIXA_MIN, max: LIMITES.VALOR_CAIXA_MAX });
    const nota = anotacao.trim();
    setErroValor(parse.ok ? null : parse.erro);
    setErroAnotacao(nota ? null : 'Escreva uma anotação para registrar a movimentação.');
    if (!parse.ok || !nota) return;

    trava.current = true;
    setEnviando(true);
    try {
      const r = await cliente.post<SaldoDTO>('/api/caixa/movimentar', { tipo, acao, valor: parse.valor, anotacao: nota }, csrf ? { csrf } : undefined);
      if (!r.ok) {
        setErroEnvio(r.mensagem);
        return;
      }
      await aoRegistrar(r.dados);
      setValor('');
      setAnotacao('');
      setAviso(`${ROTULO_ACAO[acao]} registrada: ${formatarDinheiro(parse.valor)} em ${ROTULO_TIPO[tipo].toLowerCase()}.`);
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <form className="bau__form caixa__form" onSubmit={(e) => void aoSubmeter(e)} noValidate aria-labelledby={idForm}>
      <h2 id={idForm} className="bau__form-titulo">Registrar movimentação</h2>
      <Escolha<TipoCaixa> legenda="Tipo de dinheiro" nome="tipo" valor={tipo} aoMudar={setTipo} desabilitado={enviando} opcoes={[['limpo', 'Limpo'], ['sujo', 'Sujo']]} />
      <Escolha<AcaoCaixa> legenda="Ação" nome="acao" valor={acao} aoMudar={setAcao} desabilitado={enviando} opcoes={[['entrada', 'Entrada'], ['saida', 'Saída']]} />
      <CampoQuantidade rotulo="Valor" valor={valor} aoMudar={setValor} erro={erroValor} desabilitado={enviando} />
      <div className="campo">
        <label className="campo__rotulo" htmlFor={idAnotacao}>Anotação</label>
        <input
          id={idAnotacao}
          className="campo__entrada"
          type="text"
          maxLength={LIMITES.ANOTACAO_MAX}
          autoComplete="off"
          value={anotacao}
          disabled={enviando}
          aria-invalid={erroAnotacao ? true : undefined}
          aria-describedby={erroAnotacao ? `${idAnotacao}-erro` : undefined}
          onChange={(e) => setAnotacao(e.target.value)}
        />
        {erroAnotacao ? (
          <p id={`${idAnotacao}-erro`} className="campo__erro" role="alert">{erroAnotacao}</p>
        ) : null}
      </div>
      <div className="bau__acoes">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar'}
        </button>
      </div>
      <p className="bau__aviso" role="status" aria-live="polite">{aviso}</p>
      {erroEnvio ? <p className="bau__erro" role="alert">{erroEnvio}</p> : null}
    </form>
  );
}

function Escolha<T extends string>({
  legenda,
  nome,
  valor,
  aoMudar,
  opcoes,
  desabilitado,
}: {
  legenda: string;
  nome: string;
  valor: T;
  aoMudar: (v: T) => void;
  opcoes: Array<[T, string]>;
  desabilitado: boolean;
}) {
  return (
    <fieldset className="escolha" disabled={desabilitado}>
      <legend className="campo__rotulo">{legenda}</legend>
      <div className="escolha__opcoes">
        {opcoes.map(([v, rotulo]) => (
          <label key={v} className="escolha__opcao">
            <input type="radio" name={nome} value={v} checked={valor === v} onChange={() => aoMudar(v)} />
            <span>{rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
