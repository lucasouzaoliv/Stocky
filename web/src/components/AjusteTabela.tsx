'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BauDTO, CatalogoDTO, ConfirmacaoAjusteDTO, PreviaAjusteDTO, TipoBau } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Carregando, ErroTela } from '@/components/Estados';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface AjusteTabelaProps {
  tipo: TipoBau;
  /** Título visível, ex.: "Ajuste em massa: Baú dos Membros". */
  titulo: string;
  cliente?: ClienteApi;
}

interface LinhaTabela {
  chave: string;
  categoriaId: string;
  categoriaNome: string;
  itemId: string;
  nome: string;
  atual: number;
}

interface LinhaEnviada {
  categoriaId: string;
  itemId: string;
  quantidade: number;
}

type Dados = { tag: 'carregando' } | { tag: 'erro'; mensagem: string } | { tag: 'ok'; linhas: LinhaTabela[] };
type Fase = 'edicao' | 'resumo' | 'conflito';

export const MENSAGEM_CONFLITO = 'O baú mudou desde que você viu o resumo. Recarregue o baú e refaça a prévia.';

function montarLinhas(catalogo: CatalogoDTO, bau: BauDTO): LinhaTabela[] {
  const linhas: LinhaTabela[] = [];
  for (const c of catalogo.categorias) {
    const noBau = bau.categorias.find((b) => b.id === c.id);
    for (const item of c.itens) {
      linhas.push({
        chave: `${c.id}/${item.id}`,
        categoriaId: c.id,
        categoriaNome: c.nome,
        itemId: item.id,
        nome: item.nome,
        atual: noBau?.itens.find((i) => i.id === item.id)?.quantidade ?? 0,
      });
    }
  }
  return linhas;
}

type AvaliacaoLinha = { estado: 'igual' } | { estado: 'invalida'; erro: string } | { estado: 'alterada'; quantidade: number };

function avaliar(linha: LinhaTabela, texto: string): AvaliacaoLinha {
  if (texto === String(linha.atual)) return { estado: 'igual' };
  const p = parseInteiro(texto, { min: 0, max: LIMITES.QUANTIDADE_MAX });
  if (!p.ok) return { estado: 'invalida', erro: p.erro };
  return p.valor === linha.atual ? { estado: 'igual' } : { estado: 'alterada', quantidade: p.valor };
}

export function AjusteTabela({ tipo, titulo, cliente = apiPadrao }: AjusteTabelaProps) {
  const sessao = useSessaoOpcional();
  const csrf = sessao?.csrf;

  const [dados, setDados] = useState<Dados>({ tag: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<Fase>('edicao');
  const [previa, setPrevia] = useState<{ dto: PreviaAjusteDTO; enviadas: LinhaEnviada[] } | null>(null);
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const tituloResumo = useRef<HTMLHeadingElement>(null);
  const alertaConflito = useRef<HTMLDivElement>(null);

  const carregar = useCallback(
    async (sinal?: AbortSignal): Promise<Dados> => {
      const [catalogo, bau] = await Promise.all([
        cliente.get<CatalogoDTO>('/api/catalogo', { signal: sinal }),
        cliente.get<BauDTO>(`/api/bau/${tipo}`, { signal: sinal }),
      ]);
      if (!catalogo.ok) return { tag: 'erro', mensagem: catalogo.mensagem };
      if (!bau.ok) return { tag: 'erro', mensagem: bau.mensagem };
      return { tag: 'ok', linhas: montarLinhas(catalogo.dados, bau.dados) };
    },
    [cliente, tipo],
  );

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void carregar(controle.signal).then((novo) => {
      if (ativo) setDados(novo);
    });
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [carregar, tentativa]);

  useEffect(() => {
    if (fase === 'resumo') tituloResumo.current?.focus();
    if (fase === 'conflito') alertaConflito.current?.focus();
  }, [fase]);

  const avaliadas = useMemo(
    () => (dados.tag === 'ok' ? dados.linhas : []).map((l) => ({ linha: l, texto: valores[l.chave] ?? String(l.atual), av: avaliar(l, valores[l.chave] ?? String(l.atual)) })),
    [dados, valores],
  );
  const alteradas = avaliadas.filter((a) => a.av.estado === 'alterada');
  const invalidas = avaliadas.filter((a) => a.av.estado === 'invalida').length;
  const podeVerResumo = alteradas.length > 0 && invalidas === 0 && !ocupado;

  function mudar(chave: string, texto: string) {
    setValores((v) => ({ ...v, [chave]: texto }));
    setErrosServidor((e) => {
      if (!(chave in e)) return e;
      const resto = { ...e };
      delete resto[chave];
      return resto;
    });
    setAviso('');
    setErroEnvio(null);
  }

  async function recarregarDados(): Promise<void> {
    setValores({});
    setErrosServidor({});
    setPrevia(null);
    setFase('edicao');
    setErroEnvio(null);
    setDados({ tag: 'carregando' });
    setTentativa((n) => n + 1);
  }

  async function verResumo() {
    if (trava.current) return;
    setAviso('');
    setErroEnvio(null);
    if (alteradas.length > LIMITES.AJUSTE_LINHAS_MAX) {
      setErroEnvio(`São ${alteradas.length} itens alterados e o limite é ${LIMITES.AJUSTE_LINHAS_MAX} por ajuste. Divida em mais de um ajuste.`);
      return;
    }
    const enviadas: LinhaEnviada[] = alteradas.map((a) => ({
      categoriaId: a.linha.categoriaId,
      itemId: a.linha.itemId,
      quantidade: (a.av as { quantidade: number }).quantidade,
    }));
    trava.current = true;
    setOcupado(true);
    try {
      const r = await cliente.post<PreviaAjusteDTO>(`/api/bau/${tipo}/ajuste/previa`, { linhas: enviadas }, csrf ? { csrf } : undefined);
      if (!r.ok) {
        const lista = r.detalhes?.linhas;
        if (r.status === 400 && lista?.length) {
          const mapa: Record<string, string> = {};
          for (const d of lista) {
            const alvo = d.categoriaId && d.itemId ? `${d.categoriaId}/${d.itemId}` : alteradas[d.indice]?.linha.chave;
            if (alvo) mapa[alvo] = d.motivo;
          }
          setErrosServidor(mapa);
        }
        setErroEnvio(r.mensagem);
        return;
      }
      setErrosServidor({});
      setPrevia({ dto: r.dados, enviadas });
      setFase('resumo');
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (trava.current || !previa) return;
    trava.current = true;
    setOcupado(true);
    setErroEnvio(null);
    try {
      const r = await cliente.post<ConfirmacaoAjusteDTO>(
        `/api/bau/${tipo}/ajuste/confirmar`,
        { versao: previa.dto.versao, linhas: previa.enviadas },
        csrf ? { csrf } : undefined,
      );
      if (!r.ok) {
        if (r.codigo === 'VERSAO_DESATUALIZADA') {
          // O resumo ficou velho: descarta para que não dê para reconfirmar o mesmo.
          setPrevia(null);
          setFase('conflito');
          return;
        }
        setErroEnvio(r.mensagem);
        return;
      }
      const n = r.dados.alterados;
      await recarregarDados();
      setAviso(
        n === 0
          ? 'Nenhuma alteração foi necessária.'
          : `Ajuste aplicado: ${formatarNumero(n)} ${n === 1 ? 'item alterado' : 'itens alterados'}.`,
      );
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }

  const idTitulo = useId();
  return (
    <section className="ajuste" aria-labelledby={idTitulo}>
      <h1 id={idTitulo}>{titulo}</h1>

      {dados.tag === 'carregando' ? <Carregando mensagem="Carregando o baú…" /> : null}
      {dados.tag === 'erro' ? (
        <ErroTela
          mensagem={dados.mensagem}
          aoTentarNovamente={() => {
            setDados({ tag: 'carregando' });
            setTentativa((n) => n + 1);
          }}
        />
      ) : null}

      {dados.tag === 'ok' && fase === 'conflito' ? (
        <div ref={alertaConflito} tabIndex={-1} className="estado estado--erro" role="alert">
          <p className="estado__texto">{MENSAGEM_CONFLITO}</p>
          <button type="button" className="botao" onClick={() => void recarregarDados()}>
            Recarregar o baú
          </button>
        </div>
      ) : null}

      {dados.tag === 'ok' && fase === 'resumo' && previa ? (
        <div className="ajuste__resumo">
          <h2 ref={tituloResumo} tabIndex={-1} className="bau__form-titulo">
            Resumo do ajuste
          </h2>
          {previa.dto.linhas.length === 0 ? (
            <p className="painel__ajuda">Nenhuma alteração a aplicar.</p>
          ) : (
            <div className="ajuste__rolagem">
              <table className="ajuste__tabela">
                <caption className="sr-only">Quantidades antes e depois do ajuste</caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Antes</th>
                    <th scope="col">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.dto.linhas.map((l) => (
                    <tr key={`${l.categoriaId}/${l.itemId}`}>
                      <th scope="row">{l.nome}</th>
                      <td data-rotulo="Antes">{formatarNumero(l.antes)}</td>
                      <td data-rotulo="Depois">
                        <span aria-hidden="true">→ </span>
                        {formatarNumero(l.depois)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {erroEnvio ? (
            <p className="bau__erro" role="alert">
              {erroEnvio}
            </p>
          ) : null}
          <div className="bau__acoes">
            <button type="button" className="botao botao--secundario" disabled={ocupado} onClick={() => setFase('edicao')}>
              Voltar e editar
            </button>
            <button type="button" className="botao" disabled={ocupado || previa.dto.linhas.length === 0} onClick={() => void confirmar()}>
              {ocupado ? 'Aplicando…' : 'Confirmar ajuste'}
            </button>
          </div>
        </div>
      ) : null}

      {dados.tag === 'ok' && fase === 'edicao' ? (
        <>
          <p className="painel__ajuda">
            Altere a coluna “Nova quantidade” (0 a {formatarNumero(LIMITES.QUANTIDADE_MAX)}; 0 tira o item do baú) e veja o resumo antes de aplicar.
          </p>
          <div className="ajuste__rolagem">
            <table className="ajuste__tabela">
              <caption className="sr-only">Itens do catálogo e quantidade atual no baú</caption>
              <thead>
                <tr>
                  <th scope="col">Categoria</th>
                  <th scope="col">Item</th>
                  <th scope="col">Atual</th>
                  <th scope="col">Nova quantidade</th>
                </tr>
              </thead>
              <tbody>
                {avaliadas.map(({ linha, texto, av }) => {
                  const erro = av.estado === 'invalida' ? av.erro : (errosServidor[linha.chave] ?? null);
                  const idErro = `ajuste-erro-${linha.chave}`;
                  return (
                    <tr key={linha.chave} className={av.estado === 'alterada' ? 'ajuste__linha--alterada' : undefined}>
                      <td data-rotulo="Categoria">{linha.categoriaNome}</td>
                      <th scope="row" data-rotulo="Item">
                        {linha.nome}
                      </th>
                      <td data-rotulo="Atual">{formatarNumero(linha.atual)}</td>
                      <td data-rotulo="Nova quantidade">
                        <input
                          className="campo__entrada ajuste__entrada"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Nova quantidade de ${linha.nome} (${linha.categoriaNome})`}
                          value={texto}
                          disabled={ocupado}
                          aria-invalid={erro ? true : undefined}
                          aria-describedby={erro ? idErro : undefined}
                          onChange={(e) => mudar(linha.chave, e.target.value)}
                        />
                        {erro ? (
                          <p id={idErro} className="campo__erro" aria-live="polite">
                            {erro}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="painel__ajuda" aria-live="polite">
            {alteradas.length === 0
              ? 'Nenhum item alterado.'
              : `${formatarNumero(alteradas.length)} ${alteradas.length === 1 ? 'item alterado' : 'itens alterados'} (máximo de ${LIMITES.AJUSTE_LINHAS_MAX} por ajuste).`}
            {invalidas > 0 ? ` Corrija ${invalidas === 1 ? 'a linha marcada' : `as ${invalidas} linhas marcadas`} para continuar.` : ''}
          </p>
          {erroEnvio ? (
            <p className="bau__erro" role="alert">
              {erroEnvio}
            </p>
          ) : null}
          <div className="bau__acoes">
            <button type="button" className="botao" disabled={!podeVerResumo} onClick={() => void verResumo()}>
              {ocupado ? 'Calculando…' : 'Ver resumo'}
            </button>
          </div>
        </>
      ) : null}

      <p className="bau__aviso" role="status" aria-live="polite">
        {aviso}
      </p>
    </section>
  );
}
