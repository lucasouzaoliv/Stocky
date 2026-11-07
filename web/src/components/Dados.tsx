'use client';

import { useEffect, useId, useState } from 'react';
import type { DadosDTO, LinhaRankingDTO } from '@/compartilhado/api-tipos';
import { formatarData, formatarDinheiro, formatarNumero } from '@/compartilhado/formatacao';
import { api as apiPadrao, type ClienteApi } from '@/components/api';
import { Carregando, ErroTela, Vazio } from '@/components/Estados';

export interface DadosProps {
  cliente?: ClienteApi;
}

function Ranking({ titulo, linhas, dinheiro }: { titulo: string; linhas: LinhaRankingDTO[]; dinheiro: boolean }) {
  const id = useId();
  const maior = Math.max(1, ...linhas.map((l) => l.valor));
  const fmt = (n: number) => (dinheiro ? formatarDinheiro(n) : formatarNumero(n));
  return (
    <section className="dados__bloco" aria-labelledby={id}>
      <h2 id={id} className="caixa__form-titulo">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="painel__ajuda">Sem registros ainda.</p>
      ) : (
        <ol className="dados__lista">
          {linhas.map((l) => (
            <li key={l.usuarioId} className="dados__linha">
              <span className="dados__nome"><bdi>{l.nome}</bdi></span>
              <span className="dados__valor">{fmt(l.valor)}</span>
              <span className="dados__barra" aria-hidden="true">
                <span style={{ width: `${Math.max(3, Math.round((l.valor / maior) * 100))}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Dados({ cliente = apiPadrao }: DadosProps) {
  const [dados, setDados] = useState<DadosDTO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const idTitulo = useId();

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    void (async () => {
      const r = await cliente.get<DadosDTO>('/api/dados', { signal: controle.signal });
      if (!ativo) return;
      if (r.ok) {
        setDados(r.dados);
        setErro(null);
      } else {
        setErro(r.mensagem);
      }
    })();
    return () => {
      ativo = false;
      controle.abort();
    };
  }, [cliente, tentativa]);

  return (
    <section className="dados" aria-labelledby={idTitulo}>
      <h1 id={idTitulo} className="bau__titulo">Dados</h1>
      {erro !== null && dados === null ? (
        <ErroTela mensagem={erro} aoTentarNovamente={() => { setErro(null); setTentativa((n) => n + 1); }} />
      ) : dados === null ? (
        <Carregando mensagem="Carregando os dados…" />
      ) : (
        <>
          <p className="painel__ajuda">
            Baseado nos últimos {formatarNumero(dados.amostra.droga)} registros de droga e {formatarNumero(dados.amostra.caixa)} do caixa.
          </p>

          <section className="dados__bloco dados__bloco--alerta" aria-labelledby={`${idTitulo}-pend`}>
            <h2 id={`${idTitulo}-pend`} className="caixa__form-titulo">Quem pegou droga e não depositou</h2>
            {dados.pendentes.length === 0 ? (
              <Vazio titulo="Ninguém em pendência" descricao="Todo mundo que retirou para venda já depositou." />
            ) : (
              <ul className="dados__lista">
                {dados.pendentes.map((p) => (
                  <li key={p.usuarioId} className="dados__linha">
                    <span className="dados__nome"><bdi>{p.nome}</bdi></span>
                    <span className="dados__valor">{formatarDinheiro(p.devido)}</span>
                    <span className="dados__desde">{p.desde ? `desde ${formatarData(p.desde)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Ranking titulo="Quem mais retirou droga (unidades)" linhas={dados.retiradasDroga} dinheiro={false} />
          <Ranking titulo="Quem mais depositou no caixa" linhas={dados.depositosCaixa} dinheiro />
          <Ranking titulo="Quem mais retirou dinheiro do caixa" linhas={dados.retiradasCaixa} dinheiro />

          <section className="dados__bloco" aria-labelledby={`${idTitulo}-vendas`}>
            <h2 id={`${idTitulo}-vendas`} className="caixa__form-titulo">Vendas e depósitos</h2>
            {dados.vendas.length === 0 ? (
              <p className="painel__ajuda">Sem vendas registradas ainda.</p>
            ) : (
              <div className="dados__rolagem">
                <table className="dados__tabela">
                  <thead>
                    <tr>
                      <th scope="col">Pessoa</th>
                      <th scope="col">A depositar</th>
                      <th scope="col">Depositou</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.vendas.map((v) => (
                      <tr key={v.usuarioId}>
                        <th scope="row"><bdi>{v.nome}</bdi></th>
                        <td>{formatarDinheiro(v.vendido)}</td>
                        <td>{formatarDinheiro(v.depositado)}</td>
                        <td>{v.falta === 0 ? 'Em dia' : `Falta ${formatarDinheiro(v.falta)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
