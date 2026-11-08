'use client';

import { useEffect, useId, useState } from 'react';
import type { AcaoAuditoria, AuditoriaDetalheDTO, AuditoriaResumoDTO } from '@/compartilhado/api-tipos';
import { formatarData, formatarNumero } from '@/compartilhado/formatacao';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';
import { usePaginado } from '@/components/usePaginado';

export interface AuditoriaProps {
  cliente?: ClienteApi;
}

const TAMANHO_PAGINA = 20;

export const ROTULO_ACAO_AUDITORIA: Record<AcaoAuditoria, string> = {
  'catalogo.adicionar_item': 'Item adicionado ao catálogo',
  'catalogo.remover_item': 'Item removido do catálogo',
  'bau.zerar': 'Baú zerado',
  'bau.ajuste_massa': 'Ajuste em massa',
};

const ACOES = Object.keys(ROTULO_ACAO_AUDITORIA) as AcaoAuditoria[];
const ROTULO_BAU: Record<string, string> = { membros: 'Baú dos Membros', gerencia: 'Baú da Gerência', casa: 'Baú da Casa' };

export function Auditoria({ cliente = apiPadrao }: AuditoriaProps) {
  const [acao, setAcao] = useState<AcaoAuditoria | ''>('');
  const [aberto, setAberto] = useState<string | null>(null);
  const idTitulo = useId();
  const idFiltro = useId();

  const url = `/api/auditoria?limite=${TAMANHO_PAGINA}${acao ? `&acao=${encodeURIComponent(acao)}` : ''}`;
  const est = usePaginado<AuditoriaResumoDTO>(cliente, url);

  function aoFiltrar(valor: string) {
    setAberto(null);
    setAcao(ACOES.find((a) => a === valor) ?? '');
  }

  return (
    <section className="auditoria" aria-labelledby={idTitulo}>
      <h1 id={idTitulo}>Auditoria</h1>
      <div className="campo auditoria__filtro">
        <label className="campo__rotulo" htmlFor={idFiltro}>
          Filtrar por ação
        </label>
        <select id={idFiltro} className="campo__entrada" value={acao} onChange={(e) => aoFiltrar(e.target.value)}>
          <option value="">Todas as ações</option>
          {ACOES.map((a) => (
            <option key={a} value={a}>
              {ROTULO_ACAO_AUDITORIA[a]}
            </option>
          ))}
        </select>
      </div>

      {est.erro !== null ? (
        <ErroTela titulo="Não foi possível carregar a auditoria" mensagem={est.erro} aoTentarNovamente={est.recarregar} />
      ) : est.itens === null ? (
        <Carregando mensagem="Carregando a auditoria…" />
      ) : est.itens.length === 0 ? (
        <Vazio
          titulo="Nenhum registro"
          descricao={acao ? 'Nenhuma ação deste tipo foi registrada.' : 'As ações sensíveis registradas aparecem aqui.'}
        />
      ) : (
        <>
          <ul className="logs__lista" aria-label="Registros de auditoria">
            {est.itens.map((r) => (
              <ItemAuditoria key={r.id} registro={r} cliente={cliente} aberto={aberto === r.id} alternar={() => setAberto(aberto === r.id ? null : r.id)} />
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
      )}
    </section>
  );
}

function ItemAuditoria({
  registro,
  cliente,
  aberto,
  alternar,
}: {
  registro: AuditoriaResumoDTO;
  cliente: ClienteApi;
  aberto: boolean;
  alternar: () => void;
}) {
  const idDetalhe = useId();
  return (
    <li className="logs__item">
      <p className="logs__acao">
        <strong>{ROTULO_ACAO_AUDITORIA[registro.acao] ?? registro.acao}</strong>
      </p>
      <p className="logs__texto">{registro.resumo}</p>
      <p className="logs__meta">
        <bdi>{registro.usuario.nome}</bdi>, <time dateTime={registro.data}>{formatarData(registro.data)}</time>
      </p>
      <button type="button" className="botao botao--secundario" aria-expanded={aberto} aria-controls={idDetalhe} onClick={alternar}>
        {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
      </button>
      <div id={idDetalhe} hidden={!aberto}>
        {aberto ? <Detalhe id={registro.id} cliente={cliente} /> : null}
      </div>
    </li>
  );
}

function Detalhe({ id, cliente }: { id: string; cliente: ClienteApi }) {
  const [tentativa, setTentativa] = useState(0);
  const chave = `${tentativa}|${id}`;
  const [guardado, setGuardado] = useState<{ chave: string; detalhe: AuditoriaDetalheDTO | null; erro: string | null } | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void (async () => {
      const r = await cliente.get<AuditoriaDetalheDTO>(`/api/auditoria/${encodeURIComponent(id)}`, { signal: controle.signal });
      if (!ativo) return;
      setGuardado(r.ok ? { chave, detalhe: r.dados, erro: null } : { chave, detalhe: null, erro: r.mensagem });
    })();
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [cliente, id, chave]);

  const atual = guardado && guardado.chave === chave ? guardado : null;
  const erro = atual?.erro ?? null;
  const detalhe = atual?.detalhe ?? null;

  if (erro !== null) return <ErroTela titulo="Não foi possível carregar o detalhe" mensagem={erro} aoTentarNovamente={() => setTentativa((n) => n + 1)} />;
  if (detalhe === null) return <Carregando mensagem="Carregando o detalhe…" />;
  return (
    <div className="auditoria__comparacao">
      <section className="auditoria__lado" aria-label="Antes">
        <h2 className="auditoria__lado-titulo">Antes</h2>
        <Valor valor={detalhe.antes} />
      </section>
      <section className="auditoria__lado" aria-label="Depois">
        <h2 className="auditoria__lado-titulo">Depois</h2>
        <Valor valor={detalhe.depois} />
      </section>
    </div>
  );
}

type Mapa = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Mapa => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Mapa categoria → item → quantidade. */
function ehMapaItens(v: Mapa): boolean {
  return Object.values(v).every((cat) => ehObjeto(cat) && Object.values(cat).every(ehNumero));
}

/**
 * Formatos (architecture.md §3):
 * - remover_item: { membros: n, gerencia: n }
 * - zerar: { membros: itens, gerencia: itens } (itens = categoria → item → qtd); depois = {}
 * - ajuste_massa: categoria → item → qtd, só das linhas alteradas
 * Qualquer outro formato cai no JSON legível; tudo é exibido como texto.
 */
export function Valor({ valor }: { valor: unknown }) {
  if (valor === null || valor === undefined) return <p className="auditoria__vazio">Não se aplica</p>;
  if (ehObjeto(valor)) {
    const chaves = Object.keys(valor);
    if (chaves.length === 0) return <p className="auditoria__vazio">Nada</p>;
    if (chaves.every((k) => ehNumero(valor[k]))) {
      return (
        <dl className="auditoria__lista">
          {chaves.map((k) => (
            <Linha key={k} rotulo={ROTULO_BAU[k] ?? k} valor={formatarNumero(valor[k] as number)} />
          ))}
        </dl>
      );
    }
    if (chaves.every((k) => k in ROTULO_BAU && ehObjeto(valor[k]) && ehMapaItens(valor[k] as Mapa))) {
      return (
        <>
          {chaves.map((k) => (
            <div key={k} role="group" className="auditoria__grupo" aria-label={ROTULO_BAU[k]}>
              <h3 className="auditoria__grupo-titulo">{ROTULO_BAU[k]}</h3>
              <MapaItens mapa={valor[k] as Mapa} />
            </div>
          ))}
        </>
      );
    }
    if (ehMapaItens(valor)) return <MapaItens mapa={valor} />;
  }
  return <pre className="auditoria__json">{JSON.stringify(valor, null, 2)}</pre>;
}

function MapaItens({ mapa }: { mapa: Mapa }) {
  const categorias = Object.keys(mapa);
  if (categorias.length === 0) return <p className="auditoria__vazio">Nada</p>;
  return (
    <>
      {categorias.map((cat) => (
        <div key={cat} role="group" className="auditoria__grupo" aria-label={`Categoria ${cat}`}>
          <h3 className="auditoria__grupo-titulo">{cat}</h3>
          <dl className="auditoria__lista">
            {Object.entries(mapa[cat] as Record<string, number>).map(([item, qtd]) => (
              <Linha key={item} rotulo={item} valor={formatarNumero(qtd)} />
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="auditoria__linha">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
