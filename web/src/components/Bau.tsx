'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { BauDTO, CatalogoDTO, MovimentoBauDTO, TipoBau } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { parseInteiro } from '@/compartilhado/numero';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { CampoQuantidade } from '@/components/CampoQuantidade';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';
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
      <h1 id={idTitulo}>{titulo}</h1>
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
  const [categoriaId, setCategoriaId] = useState(catalogo.categorias[0]?.id ?? '');
  const categoria = catalogo.categorias.find((c) => c.id === categoriaId) ?? catalogo.categorias[0];
  const itens = categoria?.itens ?? [];
  const [itemEscolhido, setItemEscolhido] = useState('');
  const itemId = itens.some((i) => i.id === itemEscolhido) ? itemEscolhido : (itens[0]?.id ?? '');

  const [quantidade, setQuantidade] = useState('');
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const trava = useRef(false);

  const estoque = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of bau.categorias) for (const i of c.itens) mapa.set(`${c.id}/${i.id}`, i.quantidade);
    return mapa;
  }, [bau]);
  const noBau = estoque.get(`${categoria?.id}/${itemId}`) ?? 0;
  const categoriasComItens = bau.categorias.filter((c) => c.itens.some((i) => i.quantidade > 0));

  async function enviar(acao: Acao) {
    if (trava.current || !categoria || !itemId) return;
    const parse = parseInteiro(quantidade, { min: LIMITES.QUANTIDADE_MIN, max: LIMITES.QUANTIDADE_MAX });
    setAviso('');
    setErroEnvio(null);
    if (!parse.ok) {
      setErroCampo(parse.erro);
      return;
    }
    setErroCampo(null);
    trava.current = true;
    setEnviando(true);
    try {
      const resultado = await cliente.post<MovimentoBauDTO>(
        `/api/bau/${tipo}/${acao}`,
        { categoriaId: categoria.id, itemId, quantidade: parse.valor },
        csrf ? { csrf } : undefined,
      );
      if (!resultado.ok) {
        setErroEnvio(resultado.mensagem);
        return;
      }
      const nome = itens.find((i) => i.id === itemId)?.nome ?? 'item';
      const atualizou = await recarregar();
      setQuantidade('');
      if (atualizou) {
        setAviso(`${acao === 'adicionar' ? 'Adicionado' : 'Removido'}: ${formatarNumero(parse.valor)} × ${nome}.`);
      } else {
        setErroEnvio(MENSAGEM_ATUALIZAR);
      }
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    void enviar('adicionar');
  }

  const idCategoria = useId();
  const idItem = useId();
  const idForm = useId();

  return (
    <>
      {categoriasComItens.length === 0 ? (
        <Vazio titulo="Nenhum item" descricao="Este baú está vazio. Adicione itens pelo formulário abaixo." />
      ) : (
        <div className="bau__lista">
          {categoriasComItens.map((c) => (
            <section key={c.id} className="bau__categoria" aria-labelledby={`${idCategoria}-${c.id}`}>
              <h2 id={`${idCategoria}-${c.id}`} className="bau__categoria-titulo">
                <span aria-hidden="true">{c.emoji} </span>
                {c.nome}
              </h2>
              <ul className="bau__itens">
                {c.itens
                  .filter((i) => i.quantidade > 0)
                  .map((i) => (
                    <li key={i.id} className="bau__item">
                      <span className="bau__item-nome">{i.nome}</span>
                      <span className="bau__item-qtd" aria-label={`${formatarNumero(i.quantidade)} unidades`}>
                        {formatarNumero(i.quantidade)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <form className="bau__form" onSubmit={aoSubmeter} noValidate aria-labelledby={idForm}>
        <h2 id={idForm} className="bau__form-titulo">Adicionar ou remover</h2>
        {!categoria ? (
          <p className="estado__texto">O catálogo ainda não tem itens.</p>
        ) : (
          <>
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`${idCategoria}-sel`}>
                Categoria
              </label>
              <select
                id={`${idCategoria}-sel`}
                className="campo__entrada"
                value={categoria?.id ?? ''}
                disabled={enviando}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                {catalogo.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor={idItem}>
                Item
              </label>
              <select
                id={idItem}
                className="campo__entrada"
                value={itemId}
                disabled={enviando || itens.length === 0}
                onChange={(e) => setItemEscolhido(e.target.value)}
              >
                {itens.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} (no baú: {formatarNumero(estoque.get(`${categoria?.id}/${i.id}`) ?? 0)})
                  </option>
                ))}
              </select>
            </div>
            <CampoQuantidade rotulo="Quantidade" valor={quantidade} aoMudar={setQuantidade} erro={erroCampo} desabilitado={enviando} />
            <div className="bau__acoes">
              <button type="submit" className="botao" disabled={enviando || !itemId}>
                Adicionar
              </button>
              {noBau > 0 ? (
                <button type="button" className="botao botao--secundario" disabled={enviando} onClick={() => void enviar('remover')}>
                  Remover
                </button>
              ) : null}
            </div>
          </>
        )}
        <p className="bau__aviso" role="status" aria-live="polite">
          {aviso}
        </p>
        {erroEnvio ? (
          <p className="bau__erro" role="alert">
            {erroEnvio}
          </p>
        ) : null}
      </form>
    </>
  );
}
