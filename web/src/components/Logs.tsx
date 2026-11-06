'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AcaoLogBau, EscopoLog, LogBau, LogCaixa, LogDTO, NivelAcesso } from '@/compartilhado/api-tipos';
import { formatarData, formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';
import { usePaginado } from '@/components/usePaginado';

export interface LogsProps {
  /** Nível da sessão: 1 vê só o Baú dos Membros; 2+ vê as três abas. */
  nivel: NivelAcesso;
  cliente?: ClienteApi;
}

const TAMANHO_PAGINA = 20;

const ABAS: ReadonlyArray<{ escopo: EscopoLog; rotulo: string; nivel: NivelAcesso; url: string }> = [
  { escopo: 'membros', rotulo: 'Baú dos Membros', nivel: 1, url: '/api/logs/bau/membros' },
  { escopo: 'gerencia', rotulo: 'Baú da Gerência', nivel: 2, url: '/api/logs/bau/gerencia' },
  { escopo: 'caixa', rotulo: 'Caixa', nivel: 2, url: '/api/logs/caixa' },
];

const ROTULO_ACAO_BAU: Record<AcaoLogBau, string> = {
  adicionar: 'Adicionou',
  remover: 'Removeu',
  zerar: 'Zerou o baú',
  ajuste: 'Ajuste em massa',
  catalogo_remover: 'Item removido do catálogo',
};

export function Logs({ nivel, cliente = apiPadrao }: LogsProps) {
  const abas = ABAS.filter((a) => nivel >= a.nivel);
  const [ativa, setAtiva] = useState<EscopoLog>('membros');
  const [visitadas, setVisitadas] = useState<ReadonlySet<EscopoLog>>(new Set<EscopoLog>(['membros']));
  const refs = useRef<Partial<Record<EscopoLog, HTMLButtonElement | null>>>({});
  const idBase = useId();

  function ativar(escopo: EscopoLog, focar = false) {
    setAtiva(escopo);
    setVisitadas((v) => (v.has(escopo) ? v : new Set(v).add(escopo)));
    if (focar) refs.current[escopo]?.focus();
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let alvo: number | null = null;
    if (e.key === 'ArrowRight') alvo = (indice + 1) % abas.length;
    else if (e.key === 'ArrowLeft') alvo = (indice - 1 + abas.length) % abas.length;
    else if (e.key === 'Home') alvo = 0;
    else if (e.key === 'End') alvo = abas.length - 1;
    if (alvo === null) return;
    e.preventDefault();
    ativar(abas[alvo]!.escopo, true);
  }

  return (
    <section className="logs" aria-labelledby={`${idBase}-titulo`}>
      <h1 id={`${idBase}-titulo`}>Logs</h1>
      <div role="tablist" aria-label="Tipo de log" className="logs__abas">
        {abas.map((a, i) => (
          <button
            key={a.escopo}
            ref={(el) => {
              refs.current[a.escopo] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-aba-${a.escopo}`}
            aria-selected={ativa === a.escopo}
            aria-controls={`${idBase}-painel-${a.escopo}`}
            tabIndex={ativa === a.escopo ? 0 : -1}
            className="logs__aba"
            onClick={() => ativar(a.escopo)}
            onKeyDown={(e) => aoTeclar(e, i)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div
          key={a.escopo}
          role="tabpanel"
          id={`${idBase}-painel-${a.escopo}`}
          aria-labelledby={`${idBase}-aba-${a.escopo}`}
          hidden={ativa !== a.escopo}
          tabIndex={0}
          className="logs__painel"
        >
          {visitadas.has(a.escopo) ? <ListaLog escopo={a.escopo} rotulo={a.rotulo} url={a.url} cliente={cliente} /> : null}
        </div>
      ))}
    </section>
  );
}

function ListaLog({ escopo, rotulo, url, cliente }: { escopo: EscopoLog; rotulo: string; url: string; cliente: ClienteApi }) {
  const est = usePaginado<LogDTO>(cliente, `${url}?limite=${TAMANHO_PAGINA}`);

  if (est.erro !== null) {
    return <ErroTela titulo="Não foi possível carregar os logs" mensagem={est.erro} aoTentarNovamente={est.recarregar} />;
  }
  if (est.itens === null) return <Carregando mensagem={`Carregando os logs: ${rotulo}…`} />;
  if (est.itens.length === 0) {
    return <Vazio titulo="Nenhum registro" descricao="As movimentações aparecem aqui quando acontecerem." />;
  }
  return (
    <>
      <ul className="logs__lista" aria-label={`Logs: ${rotulo}`}>
        {est.itens.map((l) => (
          <li key={l.id} className="logs__item">
            {escopo === 'caixa' ? <LinhaCaixa log={l as { id: string } & LogCaixa} /> : <LinhaBau log={l as { id: string } & LogBau} />}
          </li>
        ))}
      </ul>
      {est.erroMais ? (
        <p className="bau__erro" role="alert">
          {est.erroMais}
        </p>
      ) : null}
      {est.proximo ? (
        <button type="button" className="botao botao--secundario" disabled={est.carregandoMais} onClick={est.carregarMais}>
          {est.carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      ) : null}
    </>
  );
}

function Meta({ nome, data }: { nome: string; data: string }) {
  return (
    <p className="logs__meta">
      <bdi>{nome}</bdi>, <time dateTime={data}>{formatarData(data)}</time>
    </p>
  );
}

function LinhaBau({ log }: { log: { id: string } & LogBau }) {
  const rotulo = ROTULO_ACAO_BAU[log.acao] ?? log.acao;
  const detalhe =
    log.nomeItem !== null
      ? `${log.quantidade !== null ? `${formatarNumero(log.quantidade)}× ` : ''}${log.nomeItem}${log.nomeCategoria ? ` (${log.nomeCategoria})` : ''}`
      : log.resumo;
  return (
    <>
      <p className="logs__acao">
        <strong>{rotulo}</strong>
      </p>
      {detalhe ? <p className="logs__texto">{detalhe}</p> : null}
      {log.saldoResultante !== null ? <p className="logs__meta">Estoque depois: {formatarNumero(log.saldoResultante)}</p> : null}
      <Meta nome={log.usuario.nome} data={log.data} />
    </>
  );
}

function LinhaCaixa({ log }: { log: { id: string } & LogCaixa }) {
  const entrada = log.acao === 'entrada';
  return (
    <>
      <p className={`logs__acao logs__acao--${log.acao}`}>
        <strong>
          <span aria-hidden="true">{entrada ? '+' : '−'}</span>
          <span className="sr-only">{entrada ? 'Entrada: ' : 'Saída: '}</span>
          {formatarDinheiro(log.valor)}
        </strong>{' '}
        <span className="logs__meta">{log.tipo === 'sujo' ? 'Dinheiro sujo' : 'Dinheiro limpo'}</span>
      </p>
      <p className="logs__texto">{log.anotacao}</p>
      <p className="logs__meta">Saldo depois: {formatarDinheiro(log.saldoResultante)}</p>
      <Meta nome={log.usuario.nome} data={log.data} />
    </>
  );
}
