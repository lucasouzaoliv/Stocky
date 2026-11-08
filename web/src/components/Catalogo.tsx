'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BauDTO, CatalogoDTO, ItemCatalogo, TipoBau } from '@/compartilhado/api-tipos';
import { formatarNumero } from '@/compartilhado/formatacao';
import { LIMITES } from '@/compartilhado/limites';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Carregando, ErroTela } from '@/components/Estados';
import { Dialogo } from '@/components/Dialogo';
import { useSessaoOpcional } from '@/components/SessaoProvider';

export interface CatalogoProps {
  /** Cliente HTTP; o padrão é o do navegador. Os testes injetam um falso. */
  cliente?: ClienteApi;
}

type Categoria = CatalogoDTO['categorias'][number];

type Estado = { tag: 'carregando' } | { tag: 'erro'; mensagem: string } | { tag: 'ok'; catalogo: CatalogoDTO };

interface AlvoRemocao {
  categoria: Categoria;
  item: ItemCatalogo;
}

const BAUS: Array<[TipoBau, string]> = [
  ['membros', 'Baú dos Membros'],
  ['gerencia', 'Baú da Gerência'],
  ['casa', 'Baú da Casa'],
];

export function Catalogo({ cliente = apiPadrao }: CatalogoProps) {
  const sessao = useSessaoOpcional();
  const csrf = sessao?.csrf;
  /** Remover é exclusivo do dono. A UI esconde; o 403 do servidor é a segurança real. */
  const ehDono = (sessao?.usuario.nivel ?? 1) >= 3;

  const [estado, setEstado] = useState<Estado>({ tag: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [alvo, setAlvo] = useState<AlvoRemocao | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(
    async (sinal?: AbortSignal): Promise<Estado> => {
      const r = await cliente.get<CatalogoDTO>('/api/catalogo', { signal: sinal });
      return r.ok ? { tag: 'ok', catalogo: r.dados } : { tag: 'erro', mensagem: r.mensagem };
    },
    [cliente],
  );

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void carregar(controle.signal).then((novo) => {
      if (ativo) setEstado(novo);
    });
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [carregar, tentativa]);

  const recarregar = useCallback(async () => {
    const novo = await carregar();
    if (novo.tag === 'ok') setEstado(novo);
    return novo.tag === 'ok';
  }, [carregar]);

  const idTitulo = useId();
  return (
    <section className="catalogo" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="painel__titulo">
        Catálogo de itens
      </h2>
      <p className="painel__ajuda">
        {ehDono
          ? 'Adicione itens novos ou remova os que não existem mais.'
          : 'Adicione itens novos às categorias. Remover itens do catálogo é só do dono.'}
      </p>
      {estado.tag === 'carregando' ? <Carregando mensagem="Carregando o catálogo…" /> : null}
      {estado.tag === 'erro' ? (
        <ErroTela
          mensagem={estado.mensagem}
          aoTentarNovamente={() => {
            setEstado({ tag: 'carregando' });
            setTentativa((n) => n + 1);
          }}
        />
      ) : null}
      {estado.tag === 'ok' ? (
        <div className="catalogo__lista">
          {estado.catalogo.categorias.map((categoria) => (
            <CategoriaCatalogo
              key={categoria.id}
              categoria={categoria}
              cliente={cliente}
              csrf={csrf}
              ehDono={ehDono}
              recarregar={recarregar}
              aoPedirRemocao={(item) => setAlvo({ categoria, item })}
              aoAvisar={setAviso}
            />
          ))}
        </div>
      ) : null}
      <p className="bau__aviso" role="status" aria-live="polite">
        {aviso}
      </p>
      {ehDono && alvo ? (
        <DialogoRemover
          alvo={alvo}
          cliente={cliente}
          csrf={csrf}
          aoCancelar={() => setAlvo(null)}
          aoRemover={async () => {
            setAviso(`Item “${alvo.item.nome}” removido do catálogo.`);
            setAlvo(null);
            await recarregar();
          }}
        />
      ) : null}
    </section>
  );
}

function CategoriaCatalogo({
  categoria,
  cliente,
  csrf,
  ehDono,
  recarregar,
  aoPedirRemocao,
  aoAvisar,
}: {
  categoria: Categoria;
  cliente: ClienteApi;
  csrf: string | undefined;
  ehDono: boolean;
  recarregar: () => Promise<boolean>;
  aoPedirRemocao: (item: ItemCatalogo) => void;
  aoAvisar: (texto: string) => void;
}) {
  const total = categoria.itens.length;
  const cheia = total >= LIMITES.ITENS_POR_CATEGORIA_MAX;
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const trava = useRef(false);
  const idTitulo = useId();
  const idCampo = useId();

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    if (trava.current || cheia) return;
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Digite o nome do item.');
      return;
    }
    if (limpo.length > LIMITES.NOME_ITEM_MAX) {
      setErro(`O nome pode ter no máximo ${LIMITES.NOME_ITEM_MAX} caracteres.`);
      return;
    }
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const r = await cliente.post<unknown>('/api/catalogo/itens', { categoriaId: categoria.id, nome: limpo }, csrf ? { csrf } : undefined);
      if (!r.ok) {
        setErro(
          r.codigo === 'DUPLICADO'
            ? 'Já existe um item com esse nome nesta categoria.'
            : r.codigo === 'LIMITE_CATEGORIA'
              ? `Esta categoria já tem ${LIMITES.ITENS_POR_CATEGORIA_MAX} itens.`
              : r.mensagem,
        );
        return;
      }
      setNome('');
      aoAvisar(`Item “${limpo}” adicionado em ${categoria.nome}.`);
      await recarregar();
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <section className="bau__categoria catalogo__categoria" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className="bau__categoria-titulo">
        {categoria.emoji ? <span aria-hidden="true">{categoria.emoji} </span> : null}
        {categoria.nome}{' '}
        <span className="catalogo__contador" aria-label={`${formatarNumero(total)} de ${LIMITES.ITENS_POR_CATEGORIA_MAX} itens`}>
          {total}/{LIMITES.ITENS_POR_CATEGORIA_MAX}
        </span>
      </h3>
      {total === 0 ? (
        <p className="painel__ajuda">Nenhum item nesta categoria.</p>
      ) : (
        <ul className="bau__itens">
          {categoria.itens.map((item) => (
            <li key={item.id} className="bau__item">
              <span className="bau__item-nome">{item.nome}</span>
              {ehDono ? (
                <button type="button" className="botao botao--perigo" aria-label={`Remover ${item.nome}`} onClick={() => aoPedirRemocao(item)}>
                  Remover
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form className="catalogo__form" onSubmit={(e) => void aoSubmeter(e)} noValidate>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={idCampo}>
            Novo item em {categoria.nome}
          </label>
          <input
            id={idCampo}
            className="campo__entrada"
            type="text"
            maxLength={LIMITES.NOME_ITEM_MAX}
            autoComplete="off"
            value={nome}
            disabled={cheia || enviando}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${idCampo}-erro` : cheia ? `${idCampo}-cheia` : undefined}
            onChange={(e) => setNome(e.target.value)}
          />
          {erro ? (
            <p id={`${idCampo}-erro`} className="campo__erro" role="alert">
              {erro}
            </p>
          ) : null}
          {cheia ? (
            <p id={`${idCampo}-cheia`} className="campo__erro">
              Categoria cheia: o limite é de {LIMITES.ITENS_POR_CATEGORIA_MAX} itens.
            </p>
          ) : null}
        </div>
        <button type="submit" className="botao" disabled={cheia || enviando}>
          {enviando ? 'Adicionando…' : 'Adicionar item'}
        </button>
      </form>
    </section>
  );
}

function somaItem(bau: BauDTO, categoriaId: string, itemId: string): number {
  const categoria = bau.categorias.find((c) => c.id === categoriaId);
  return categoria?.itens.find((i) => i.id === itemId)?.quantidade ?? 0;
}

function DialogoRemover({
  alvo,
  cliente,
  csrf,
  aoCancelar,
  aoRemover,
}: {
  alvo: AlvoRemocao;
  cliente: ClienteApi;
  csrf: string | undefined;
  aoCancelar: () => void;
  aoRemover: () => Promise<void>;
}) {
  const { categoria, item } = alvo;
  const [impacto, setImpacto] = useState<Record<TipoBau, number> | 'erro' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const trava = useRef(false);

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void (async () => {
      const [membros, gerencia, casa] = await Promise.all(
        BAUS.map(([tipo]) => cliente.get<BauDTO>(`/api/bau/${tipo}`, { signal: controle.signal })),
      );
      if (!ativo) return;
      if (membros?.ok && gerencia?.ok && casa?.ok) {
        setImpacto({
          membros: somaItem(membros.dados, categoria.id, item.id),
          gerencia: somaItem(gerencia.dados, categoria.id, item.id),
          casa: somaItem(casa.dados, categoria.id, item.id),
        });
      } else {
        setImpacto('erro');
      }
    })();
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [cliente, categoria.id, item.id]);

  async function confirmar() {
    if (trava.current) return;
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const r = await cliente.delete<unknown>(
        `/api/catalogo/itens/${encodeURIComponent(categoria.id)}/${encodeURIComponent(item.id)}`,
        csrf ? { csrf } : undefined,
      );
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      await aoRemover();
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <Dialogo titulo={`Remover “${item.nome}” do catálogo?`} aoFechar={aoCancelar} bloqueado={enviando}>
      <p>
        Categoria: {categoria.nome}. O item sai do catálogo e o estoque dele sai dos baús. A ação fica registrada na auditoria.
      </p>
      {impacto === null ? <Carregando mensagem="Conferindo o estoque nos baús…" /> : null}
      {impacto === 'erro' ? <p className="campo__erro" role="alert">Não foi possível conferir o estoque nos baús.</p> : null}
      {impacto && impacto !== 'erro' ? (
        <ul className="dialogo__impacto" aria-label="Estoque que será removido">
          {BAUS.map(([tipo, rotulo]) => (
            <li key={tipo}>
              {rotulo}: {formatarNumero(impacto[tipo])} {impacto[tipo] === 1 ? 'unidade' : 'unidades'}
            </li>
          ))}
        </ul>
      ) : null}
      {erro ? (
        <p className="bau__erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="bau__acoes">
        <button type="button" className="botao botao--secundario" data-autofoco="" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="botao botao--perigo" onClick={() => void confirmar()} disabled={enviando}>
          {enviando ? 'Removendo…' : 'Remover item'}
        </button>
      </div>
    </Dialogo>
  );
}
