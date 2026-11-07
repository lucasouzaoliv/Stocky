import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmarAjuste, preverAjuste } from '@/server/bau/ajuste';
import { adicionarAoBau, removerDoBau } from '@/server/bau/operacoes';
import { zerarBau } from '@/server/bau/zerar';
import { adicionarItemAoCatalogo, removerItemDoCatalogo } from '@/server/catalogo/operacoes';
import { resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { DONO, OUTRO_USUARIO, USUARIO, auditorias, logsDe, seedBase, type ItensBau } from '../helpers/estado';
import { falharCommitDaOperacao } from './commit-falho';

let fake: FakeFirestore;
function abrir(membros: ItensBau = { armas: { colt: 3 }, medicamentos: { analgesico: 10 } }, versao = 4) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros, gerencia: { armas: { usp: 1 } }, versao }) });
  setDb(comoDb(fake));
}
beforeEach(() => abrir());
afterEach(() => {
  resetDb();
  resetSemente();
});

const linha = (categoriaId: string, itemId: string, quantidade: unknown) => ({ categoriaId, itemId, quantidade });
const bau = (t = 'membros') => fake.dump()[`baus/${t}`] as { versao: number; itens: ItensBau };
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-041 confirmarAjuste', () => {
  it('AC1/D3: resumo "Colt 3 → 5", depósito de +10 antes de confirmar → 409, estoque 13 e zero auditoria', async () => {
    const previa = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
    expect(previa.linhas[0]).toMatchObject({ antes: 3, depois: 5 });
    await adicionarAoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 10 }, OUTRO_USUARIO);
    const antes = fake.dump();
    const e = await recusa(confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 5)], USUARIO));
    expect([e.status, e.codigo]).toEqual([409, 'VERSAO_DESATUALIZADA']);
    expect(e.message).toBe('O baú mudou desde o resumo. Refaça o ajuste.');
    expect(bau().itens.armas!.colt).toBe(13);
    expect(auditorias(fake.dump())).toHaveLength(0);
    expect(fake.dump()).toEqual(antes);
  });

  it('AC1: a versão é conferida DENTRO da transação (leitura do baú e escrita no mesmo runTransaction)', async () => {
    const previa = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
    fake.chamadas.length = 0;
    await confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 5)], USUARIO);
    const leituraBau = fake.chamadas.find((c) => c.op === 'get' && c.caminho === 'baus/membros');
    expect(leituraBau?.emTransacao).toBe(true);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
  });

  it('AC1: versão velha de qualquer tipo de mudança (adicionar, remover) é recusada', async () => {
    for (const mexer of [
      () => adicionarAoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 1 }, USUARIO),
      () => removerDoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 1 }, USUARIO),
    ]) {
      abrir();
      const previa = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
      await mexer();
      expect((await recusa(confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 5)], USUARIO))).codigo).toBe('VERSAO_DESATUALIZADA');
    }
  });

  it('AC2: sem mudança entre prévia e confirmação, aplica tudo e a versão sobe 1; alterados correto', async () => {
    const linhas = [linha('armas', 'colt', 5), linha('medicamentos', 'gaze', 4), linha('medicamentos', 'analgesico', 10)];
    const previa = await preverAjuste('membros', linhas);
    expect(previa.alterados).toBe(2);
    const r = await confirmarAjuste('membros', previa.versao, linhas, USUARIO);
    expect(r).toMatchObject({ alterados: 2, versao: 5 });
    expect(r.auditoriaId).toMatch(/^auto/);
    expect(bau()).toMatchObject({ versao: 5, itens: { armas: { colt: 5 }, medicamentos: { analgesico: 10, gaze: 4 } } });
  });

  it('AC2: uma prévia pode ser confirmada uma vez; a segunda confirmação com a mesma versão é recusada', async () => {
    const previa = await preverAjuste('membros', [linha('armas', 'colt', 5)]);
    await confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 5)], USUARIO);
    expect((await recusa(confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 5)], USUARIO))).status).toBe(409);
  });

  it('AC3: uma linha inexistente na revalidação interna cancela todas (dump idêntico)', async () => {
    const antes = fake.dump();
    const e = await recusa(confirmarAjuste('membros', 4, [linha('armas', 'colt', 9), linha('armas', 'nao_existe', 1)], USUARIO));
    expect([e.status, e.detalhes?.linhas?.map((l) => l.indice)]).toEqual([400, [1]]);
    expect(fake.dump()).toEqual(antes);
  });

  it('AC3: linha inválida (quantidade, repetida, forma) cancela tudo sem abrir transação', async () => {
    const antes = fake.dump();
    for (const linhas of [
      [linha('armas', 'colt', 9), linha('armas', 'usp', -3)],
      [linha('armas', 'colt', 9), linha('armas', 'colt', 1)],
      [linha('armas', 'colt', 10_000_001)],
      [],
      'x',
    ]) {
      expect((await recusa(confirmarAjuste('membros', 4, linhas, USUARIO))).status).toBe(400);
    }
    expect(fake.dump()).toEqual(antes);
    expect(escritas()).toEqual([]);
  });

  it('AC3: item removido do catálogo depois da prévia → versão mudou → 409 (e nada gravado)', async () => {
    const previa = await preverAjuste('membros', [linha('armas', 'colt', 9)]);
    await removerItemDoCatalogo('armas', 'colt', DONO);
    const e = await recusa(confirmarAjuste('membros', previa.versao, [linha('armas', 'colt', 9)], USUARIO));
    expect(e.codigo).toBe('VERSAO_DESATUALIZADA');
  });

  it('AC3: versão com o mesmo número mas item sumido do catálogo → 400 por linha (revalidação interna)', async () => {
    const c = fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string }> }> };
    c.categorias.find((x) => x.id === 'armas')!.itens = c.categorias.find((x) => x.id === 'armas')!.itens.filter((i) => i.id !== 'usp');
    fake = criarFakeFirestore({ seed: { ...fake.dump(), 'config/catalogo': c as never } });
    setDb(comoDb(fake));
    const e = await recusa(confirmarAjuste('membros', 4, [linha('armas', 'usp', 2)], USUARIO));
    expect(e.detalhes?.linhas?.[0]).toMatchObject({ indice: 0, itemId: 'usp' });
    expect(escritas()).toEqual([]);
  });

  it('AC4: duas confirmações simultâneas com a mesma versaoVista → uma aplica, a outra recebe 409', async () => {
    const r = await Promise.allSettled([
      confirmarAjuste('membros', 4, [linha('armas', 'colt', 5)], USUARIO),
      confirmarAjuste('membros', 4, [linha('armas', 'colt', 8)], OUTRO_USUARIO),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect([(rej.reason as ErroApp).status, (rej.reason as ErroApp).codigo]).toEqual([409, 'VERSAO_DESATUALIZADA']);
    expect(bau().versao).toBe(5);
    expect(auditorias(fake.dump())).toHaveLength(1);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(1);
  });

  it('AC4: 10 confirmações simultâneas com a mesma versão → exatamente uma aplica', async () => {
    const r = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => confirmarAjuste('membros', 4, [linha('armas', 'colt', 10 + i)], USUARIO)));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(bau().versao).toBe(5);
  });

  it('AC4: confirmação concorrente com um depósito: ou o depósito entra e a confirmação é recusada, ou o contrário', async () => {
    const r = await Promise.allSettled([
      adicionarAoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 10 }, USUARIO),
      confirmarAjuste('membros', 4, [linha('armas', 'colt', 5)], USUARIO),
    ]);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'rejected']);
    expect(bau().itens.armas!.colt).toBe(13);
  });

  it('AC5: auditoria bau.ajuste_massa na mesma transação, com antes/depois por item e o usuário da sessão', async () => {
    const r = await confirmarAjuste('membros', 4, [linha('armas', 'colt', 5), linha('medicamentos', 'gaze', 2), linha('armas', 'usp', 0)], USUARIO);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    const a = fake.dump()[`auditoria/${r.auditoriaId}`];
    expect(a).toMatchObject({
      acao: 'bau.ajuste_massa',
      usuario: { id: USUARIO.id, nome: USUARIO.nome },
      alvo: { tipo: 'membros' },
      antes: { armas: { colt: 3 }, medicamentos: { gaze: 0 } },
      depois: { armas: { colt: 5 }, medicamentos: { gaze: 2 } },
    });
    const [log] = logsDe(fake.dump(), 'membros');
    expect(log).toMatchObject({ acao: 'ajuste', auditoriaId: r.auditoriaId, versao: 5 });
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(1);
  });

  it('AC5: falharProximoCommit → nada muda', async () => {
    const antes = fake.dump();
    const provar = await falharCommitDaOperacao(fake, new Error('falha'));
    await expect(confirmarAjuste('membros', 4, [linha('armas', 'colt', 5)], USUARIO)).rejects.toThrow();
    provar();
    expect(fake.dump()).toEqual(antes);
  });

  it('AC5: falha na escrita da auditoria desfaz o baú também', async () => {
    const antes = fake.dump();
    fake.falharEm('set', /^auditoria\//, new Error('falha'));
    await expect(confirmarAjuste('membros', 4, [linha('armas', 'colt', 5)], USUARIO)).rejects.toThrow();
    expect(fake.dump()).toEqual(antes);
  });

  it('AC6: itens fora do pedido não são tocados e quantidade 0 remove o item (e a categoria vazia)', async () => {
    await confirmarAjuste('membros', 4, [linha('armas', 'colt', 0), linha('medicamentos', 'gaze', 1)], USUARIO);
    expect(bau().itens).toEqual({ medicamentos: { analgesico: 10, gaze: 1 } });
  });

  it('AC6: ajusta só o baú pedido; o outro mantém estoque e versão', async () => {
    await confirmarAjuste('membros', 4, [linha('armas', 'colt', 1)], USUARIO);
    expect(bau('gerencia')).toMatchObject({ versao: 4, itens: { armas: { usp: 1 } } });
    await confirmarAjuste('gerencia', 4, [linha('armas', 'usp', 7)], USUARIO);
    expect(bau('gerencia')).toMatchObject({ versao: 5, itens: { armas: { usp: 7 } } });
  });

  it('AC7: a versão muda (e invalida o ajuste) após adicionar', async () => {
    const v = bau().versao;
    await adicionarAoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 1 }, USUARIO);
    expect(bau().versao).toBe(v + 1);
    expect((await recusa(confirmarAjuste('membros', v, [linha('armas', 'colt', 1)], USUARIO))).codigo).toBe('VERSAO_DESATUALIZADA');
  });

  it('AC7: a versão muda após remover', async () => {
    const v = bau().versao;
    await removerDoBau({ tipo: 'membros', categoriaId: 'armas', itemId: 'colt', quantidade: 1 }, USUARIO);
    expect((await recusa(confirmarAjuste('membros', v, [linha('armas', 'colt', 1)], USUARIO))).codigo).toBe('VERSAO_DESATUALIZADA');
  });

  it('AC7: a versão muda após zerar o baú', async () => {
    const v = bau().versao;
    await zerarBau('membros', DONO);
    expect((await recusa(confirmarAjuste('membros', v, [linha('armas', 'colt', 1)], USUARIO))).codigo).toBe('VERSAO_DESATUALIZADA');
  });

  it('AC7: a versão dos DOIS baús muda após remover item do catálogo', async () => {
    const v = bau().versao;
    await removerItemDoCatalogo('drogas', 'lsd', DONO);
    for (const t of ['membros', 'gerencia']) {
      expect((await recusa(confirmarAjuste(t, v, [linha('armas', 'colt', 1)], USUARIO))).codigo).toBe('VERSAO_DESATUALIZADA');
    }
  });

  it('AC7: adicionar item ao catálogo não invalida o ajuste (baú não mudou)', async () => {
    const v = bau().versao;
    await adicionarItemAoCatalogo('armas', 'Faca', USUARIO);
    expect((await confirmarAjuste('membros', v, [linha('armas', 'faca', 2)], USUARIO)).alterados).toBe(1);
  });

  it('AC8: sem alterações devolve sucesso sem escrever versão, auditoria nem log', async () => {
    const antes = fake.dump();
    const r = await confirmarAjuste('membros', 4, [linha('armas', 'colt', 3), linha('armas', 'usp', 0)], USUARIO);
    expect(r).toEqual({ alterados: 0, versao: 4, auditoriaId: null });
    expect(fake.dump()).toEqual(antes);
    expect(escritas()).toEqual([]);
  });

  it('AC8: sem alterações, mas com versão velha, ainda é recusado', async () => {
    expect((await recusa(confirmarAjuste('membros', 3, [linha('armas', 'colt', 3)], USUARIO))).status).toBe(409);
  });

  it('versão ausente ou malformada → 400 sem tocar o banco', async () => {
    for (const v of [undefined, null, '4', -1, 1.5, Number.NaN, {}, true]) {
      const e = await recusa(confirmarAjuste('membros', v, [linha('armas', 'colt', 5)], USUARIO));
      expect([e.status, e.codigo], String(v)).toEqual([400, 'VALIDACAO']);
    }
    expect(fake.chamadas).toHaveLength(0);
  });

  it('tipo inválido → 400; usuário inválido → erro interno, nada gravado', async () => {
    expect((await recusa(confirmarAjuste('cofre', 4, [linha('armas', 'colt', 5)], USUARIO))).status).toBe(400);
    expect((await recusa(confirmarAjuste('membros', 4, [linha('armas', 'colt', 5)], undefined as never))).codigo).toBe('INTERNO');
    expect(escritas()).toEqual([]);
  });

  it('D1 de ponta a ponta: item "#1 Especial: .50" é ajustado por id', async () => {
    const c = fake.dump()['config/catalogo'] as { categorias: Array<{ id: string; itens: Array<{ id: string; nome: string }> }> };
    c.categorias.find((x) => x.id === 'armas')!.itens.push({ id: '1_especial_50', nome: '#1 Especial: .50' });
    fake = criarFakeFirestore({ seed: { ...fake.dump(), 'config/catalogo': c as never } });
    setDb(comoDb(fake));
    const previa = await preverAjuste('membros', [linha('armas', '1_especial_50', 6)]);
    await confirmarAjuste('membros', previa.versao, [linha('armas', '1_especial_50', 6)], USUARIO);
    expect(bau().itens.armas!['1_especial_50']).toBe(6);
  });
});
