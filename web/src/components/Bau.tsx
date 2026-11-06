'use client';

import { Minus, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BauDTO, CatalogoDTO, MovimentoBauDTO, TipoBau } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Aviso, useAviso } from '@/components/Aviso';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';
import { iconeDaCategoria, iconeDoItem } from '@/components/icones';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface BauProps {
  tipo: TipoBau;
  /** Título visível (e nome acessível) do baú, ex.: "Baú dos Membros". */
  titulo: string;
  /** Cliente HTTP; o padrão é o do navegador. Os testes injetam um falso. */
  cliente?: ClienteApi;
}

type Acao = 'adicionar' | 'remover';

type Estado =
  | { tag: 'carregando' }
  | { tag: 'erro'; mensagem: string }
  | { tag: 'ok'; bau: BauDTO; catalogo: CatalogoDTO };

const MENSAGEM_ATUALIZAR = 'A movimentação foi feita, mas não foi possível atualizar a lista. Recarregue a página.';

export function Bau({ tipo, titulo, cliente = apiPadrao }: BauProps) {
  const sessao = useSessaoOpcional();
  const csrf = sessao?.csrf;
  const [estado, setEstado] = useState<Estado>({ tag: 'carregando' });

  const carregar = useCallback(
    async (sinal?: AbortSignal): Promise<Estado> => {
      const [bau, catalogo] = await Promise.all([
        cliente.get<BauDTO>(`/api/bau/${tipo}`, { signal: sinal }),
        cliente.get<CatalogoDTO>('/api/catalogo', { signal: sinal }),
      ]);
      if (!bau.ok) return { tag: 'erro', mensagem: bau.mensagem };
      if (!catalogo.ok) return { tag: 'erro', mensagem: catalogo.mensagem };
      return { tag: 'ok', bau: bau.dados, catalogo: catalogo.dados };
    },
    [cliente, tipo],
  );

  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    carregar(controle.signal).then((novo) => {
      if (ativo) setEstado(novo);
    });
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [carregar, tentativa]);

  const idTitulo = useId();
  return (
    <section className="bau" aria-labelledby={idTitulo}>
      <h1 id={idTitulo} className="bau__titulo">{titulo}</h1>
      {estado.tag === 'carregando' ? <Carregando mensagem="Carregando o baú…" /> : null}
      {estado.tag === 'erro' ? (
        <ErroTela mensagem={estado.mensagem} aoTentarNovamente={() => {
            setEstado({ tag: 'carregando' });
            setTentativa((n) => n + 1);
          }} />
      ) : null}
      {estado.tag === 'ok' ? (
        <ConteudoBau
          tipo={tipo}
          bau={estado.bau}
          catalogo={estado.catalogo}
          cliente={cliente}
          csrf={csrf}
          recarregar={async () => {
            const novo = await carregar();
            if (novo.tag === 'ok') setEstado(novo);
            return novo.tag === 'ok';
          }}
        />
      ) : null}
    </section>
  );
}

interface ItemGrade {
  id: string;
  nome: string;
  quantidade: number;
}
interface GrupoGrade {
  id: string;
  nome: string;
  itens: ItemGrade[];
}

const PADRAO_PENDENTE = '1';

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** O catálogo manda na lista (itens zerados também aparecem); o que está no baú e saiu do catálogo continua visível. */
function montarGrupos(bau: BauDTO, catalogo: CatalogoDTO): GrupoGrade[] {
  const noBau = new Map<string, number>();
  for (const c of bau.categorias) for (const i of c.itens) noBau.set(`${c.id}/${i.id}`, i.quantidade);
  const grupos: GrupoGrade[] = catalogo.categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    itens: c.itens.map((i) => ({ id: i.id, nome: i.nome, quantidade: noBau.get(`${c.id}/${i.id}`) ?? 0 })),
  }));
  for (const c of bau.categorias) {
    let grupo = grupos.find((g) => g.id === c.id);
    if (!grupo) {
      grupo = { id: c.id, nome: c.nome, itens: [] };
      grupos.push(grupo);
    }
    for (const i of c.itens) {
      if (!grupo.itens.some((x) => x.id === i.id)) grupo.itens.push({ id: i.id, nome: i.nome, quantidade: i.quantidade });
    }
  }
  return grupos;
}

function ConteudoBau({
  tipo,
  bau,
  catalogo,
  cliente,
  csrf,
  recarregar,
}: {
  tipo: TipoBau;
  bau: BauDTO;
  catalogo: CatalogoDTO;
  cliente: ClienteApi;
  csrf: string | undefined;
  recarregar: () => Promise<boolean>;
}) {
  const grupos = useMemo(() => montarGrupos(bau, catalogo), [bau, catalogo]);
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  // Quantidade pendente de cada item: só o clique em Adicionar/Retirar chama a API.
  const [pendente, setPendente] = useState<Record<string, string>>({});
  const [erroCampo, setErroCampo] = useState<{ chave: string; mensagem: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pulso, setPulso] = useState<string | null>(null);
  const trava = useRef(false);
  const { aviso, mostrar, fechar } = useAviso();

  const total = grupos.reduce((soma, g) => soma + g.itens.reduce((s, i) => s + i.quantidade, 0), 0);
  const tiposComEstoque = grupos.reduce((soma, g) => soma + g.itens.filter((i) => i.quantidade > 0).length, 0);
  const totalItensCatalogo = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  const filtroAtual = grupos.some((g) => g.id === filtro) ? filtro : 'todos';
  const termo = semAcento(busca.trim());
  const visiveis = grupos
    .filter((g) => filtroAtual === 'todos' || g.id === filtroAtual)
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !termo || semAcento(i.nome).includes(termo)) }))
    .filter((g) => g.itens.length > 0);

  function valorPendente(chave: string): string {
    return pendente[chave] ?? PADRAO_PENDENTE;
  }
  function definir(chave: string, valor: string) {
    setPendente((p) => ({ ...p, [chave]: valor }));
    setErroCampo((e) => (e?.chave === chave ? null : e));
  }
  function passo(chave: string, delta: 1 | -1) {
    const atual = parseInteiro(valorPendente(chave), { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
    const base = atual.ok ? atual.valor : LIMITES.QUANTIDADE_MIN;
    const proximo = Math.min(LIMITES.QUANTIDADE_MAX, Math.max(LIMITES.QUANTIDADE_MIN, atual.ok ? base + delta : base));
    definir(chave, String(proximo));
  }

  async function confirmar(acao: Acao, categoria: GrupoGrade, item: ItemGrade) {
    if (trava.current) return;
    const chave = `${categoria.id}/${item.id}`;
    const parse = parseInteiro(valorPendente(chave), { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
    if (!parse.ok) {
      setErroCampo({ chave, mensagem: parse.erro });
      return;
    }
    setErroCampo(null);
    trava.current = true;
    setEnviando(true);
    try {
      const resultado = await cliente.post<MovimentoBauDTO>(
        `/api/bau/${tipo}/${acao}`,
        { categoriaId: categoria.id, itemId: item.id, quantidade: parse.valor },
        csrf ? { csrf } : undefined,
      );
      if (!resultado.ok) {
        mostrar({ tipo: 'erro', texto: resultado.mensagem });
        return;
      }
      const atualizou = await recarregar();
      setPendente((p) => ({ ...p, [chave]: PADRAO_PENDENTE }));
      if (atualizou) {
        setPulso(chave);
        mostrar({ tipo: 'sucesso', texto: `${acao === 'adicionar' ? 'Adicionado' : 'Removido'}: ${formatarNumero(parse.valor)} × ${item.nome}.` });
      } else {
        mostrar({ tipo: 'erro', texto: MENSAGEM_ATUALIZAR });
      }
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  const idGrupos = useId();
  const idBusca = useId();

  return (
    <>
      <dl className="bau__resumo" aria-label="Resumo do baú">
        <div className="bau__resumo-item">
          <dt>Itens no baú</dt>
          <dd>{formatarNumero(total)}</dd>
        </div>
        <div className="bau__resumo-item">
          <dt>Tipos com estoque</dt>
          <dd>
            {formatarNumero(tiposComEstoque)}
            <span className="bau__resumo-de"> de {formatarNumero(totalItensCatalogo)}</span>
          </dd>
        </div>
        <div className="bau__resumo-item">
          <dt>Categorias</dt>
          <dd>{formatarNumero(grupos.length)}</dd>
        </div>
      </dl>

      {grupos.length === 0 ? (
        <Vazio titulo="Catálogo vazio" descricao="O catálogo ainda não tem itens. Cadastre os itens no Painel para movimentar o baú." />
      ) : (
        <>
          <div className="bau__ferramentas">
            <div className="bau__busca">
              <Search aria-hidden="true" focusable="false" />
              <label className="sr-only" htmlFor={idBusca}>
                Buscar item
              </label>
              <input
                id={idBusca}
                type="search"
                className="bau__busca-campo"
                placeholder="Buscar item"
                autoComplete="off"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="bau__chips" role="group" aria-label="Filtrar por categoria">
              <button type="button" className="chip" aria-pressed={filtroAtual === 'todos'} onClick={() => setFiltro('todos')}>
                Todos
              </button>
              {grupos.map((g) => {
                const Icone = iconeDaCategoria(g.nome);
                return (
                  <button key={g.id} type="button" className="chip" aria-pressed={filtroAtual === g.id} onClick={() => setFiltro(g.id)}>
                    <Icone aria-hidden="true" focusable="false" />
                    <span>{g.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visiveis.length === 0 ? (
            <Vazio titulo="Nenhum item encontrado" descricao="Nada combina com a busca nesta categoria. Limpe a busca ou escolha outra categoria." />
          ) : (
            <div className="bau__lista">
              {visiveis.map((g) => (
                <section key={g.id} className="bau__categoria" aria-labelledby={`${idGrupos}-${g.id}`}>
                  <h2 id={`${idGrupos}-${g.id}`} className="bau__categoria-titulo">
                    {g.nome}
                    <span className="bau__categoria-contagem">{g.itens.length}</span>
                  </h2>
                  <ul className="bau__grade">
                    {g.itens.map((i) => {
                      const chave = `${g.id}/${i.id}`;
                      const Icone = iconeDoItem(g.nome, i.nome);
                      const erro = erroCampo?.chave === chave ? erroCampo.mensagem : null;
                      const idErro = `${idGrupos}-${g.id}-${i.id}-erro`;
                      return (
                        <li key={i.id} className={`bau__item${i.quantidade === 0 ? ' bau__item--zerado' : ''}`}>
                          <div className="bau__item-topo">
                            <span className="bau__item-icone" aria-hidden="true">
                              <Icone focusable="false" />
                            </span>
                            <p className="bau__item-qtd">
                              <span key={pulso === chave ? bau.versao : 'fixo'} className={pulso === chave ? 'bau__item-numero bau__item-numero--pulso' : 'bau__item-numero'}>
                                {formatarNumero(i.quantidade)}
                              </span>
                              <span className="sr-only"> no baú</span>
                            </p>
                          </div>
                          <p className="bau__item-nome">{i.nome}</p>
                          <div className="passo" role="group" aria-label={`Quantidade de ${i.nome}`}>
                            <button
                              type="button"
                              className="passo__botao"
                              aria-label={`Diminuir quantidade de ${i.nome}`}
                              disabled={enviando}
                              onClick={() => passo(chave, -1)}
                            >
                              <Minus aria-hidden="true" focusable="false" />
                            </button>
                            <input
                              className="passo__campo"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              aria-label={`Quantidade de ${i.nome}`}
                              value={valorPendente(chave)}
                              disabled={enviando}
                              aria-invalid={erro ? true : undefined}
                              aria-describedby={erro ? idErro : undefined}
                              onChange={(e) => definir(chave, e.target.value)}
                            />
                            <button
                              type="button"
                              className="passo__botao"
                              aria-label={`Aumentar quantidade de ${i.nome}`}
                              disabled={enviando}
                              onClick={() => passo(chave, 1)}
                            >
                              <Plus aria-hidden="true" focusable="false" />
                            </button>
                          </div>
                          {erro ? (
                            <p id={idErro} className="campo__erro" role="alert">
                              {erro}
                            </p>
                          ) : null}
                          <div className="bau__item-acoes">
                            <button type="button" className="botao botao--compacto" aria-label={`Adicionar ${i.nome}`} disabled={enviando} onClick={() => void confirmar('adicionar', g, i)}>
                              Adicionar
                            </button>
                            <button
                              type="button"
                              className="botao botao--compacto botao--secundario"
                              aria-label={`Retirar ${i.nome}`}
                              disabled={enviando || i.quantidade === 0}
                              onClick={() => void confirmar('remover', g, i)}
                            >
                              Retirar
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <Aviso aviso={aviso} aoFechar={fechar} />
    </>
  );
}
