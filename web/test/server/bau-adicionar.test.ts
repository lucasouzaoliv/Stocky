import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adicionarAoBau } from '@/server/bau/operacoes';
import { garantirCatalogo, resetSemente } from '@/server/catalogo/semente';
import { ErroApp } from '@/server/erros';
import { resetDb, setDb } from '@/server/firebase';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { OUTRO_USUARIO, USUARIO, VALORES_INVALIDOS, logsDe, seedBase, type ItensBau } from '../helpers/estado';

let fake: FakeFirestore;
async function abrir(membros: ItensBau = {}, extra: Parameters<typeof seedBase>[0] = {}) {
  resetSemente();
  fake = criarFakeFirestore({ seed: seedBase({ membros, ...extra }) });
  setDb(comoDb(fake));
  await garantirCatalogo();
}
afterEach(() => {
  resetDb();
  resetSemente();
});
beforeEach(() => resetSemente());

const pedido = (quantidade: unknown, o: Partial<{ tipo: 'membros' | 'gerencia'; categoriaId: string; itemId: string }> = {}) => ({
  tipo: o.tipo ?? 'membros',
  categoriaId: o.categoriaId ?? 'medicamentos',
  itemId: o.itemId ?? 'bandagem',
  quantidade,
});
const itensDoBau = (tipo = 'membros') => (fake.dump()[`baus/${tipo}`] as { itens: ItensBau }).itens;
const versao = (tipo = 'membros') => (fake.dump()[`baus/${tipo}`] as { versao: number }).versao;
const escritas = () => fake.chamadas.filter((c) => c.op !== 'get');

async function recusa(p: Promise<unknown>): Promise<ErroApp> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErroApp);
  return e as ErroApp;
}

describe('WEB-029 adicionarAoBau', () => {
  it('soma ao estoque, devolve a quantidade resultante e a versão', async () => {
    await abrir({ medicamentos: { bandagem: 3 } }, { versao: 4 });
    const r = await adicionarAoBau(pedido(5), USUARIO);
    expect(r).toEqual({ categoriaId: 'medicamentos', itemId: 'bandagem', quantidade: 8, versao: 5 });
    expect(itensDoBau()).toEqual({ medicamentos: { bandagem: 8 } });
  });

  it('cria a categoria e o item quando o baú está vazio, e não mexe no outro baú', async () => {
    await abrir();
    await adicionarAoBau(pedido(2, { categoriaId: 'armas', itemId: 'colt' }), USUARIO);
    expect(itensDoBau()).toEqual({ armas: { colt: 2 } });
    expect(itensDoBau('gerencia')).toEqual({});
    expect(versao('gerencia')).toBe(0);
  });

  it('AC1: +5 e +7 simultâneos resultam em 12', async () => {
    await abrir();
    await Promise.all([adicionarAoBau(pedido(5), USUARIO), adicionarAoBau(pedido(7), OUTRO_USUARIO)]);
    expect(itensDoBau().medicamentos!.bandagem).toBe(12);
    expect(versao()).toBe(2);
  });

  it('AC1: 50 adições paralelas somam corretamente, com 50 logs', async () => {
    await abrir();
    const valores = Array.from({ length: 50 }, (_, i) => i + 1);
    await Promise.all(valores.map((v) => adicionarAoBau(pedido(v), USUARIO)));
    expect(itensDoBau().medicamentos!.bandagem).toBe(valores.reduce((a, b) => a + b, 0));
    expect(versao()).toBe(50);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(50);
  });

  it('AC2: toda escrita é transacional e o log leva usuário, ação, item, quantidade, saldo resultante e data ISO', async () => {
    await abrir({ medicamentos: { bandagem: 1 } });
    await adicionarAoBau(pedido(4), USUARIO);
    expect(escritas().length).toBe(2);
    expect(escritas().every((c) => c.emTransacao)).toBe(true);
    const [log] = logsDe(fake.dump(), 'membros');
    expect(log).toMatchObject({
      acao: 'adicionar',
      usuario: { id: USUARIO.id, nome: USUARIO.nome },
      categoriaId: 'medicamentos',
      itemId: 'bandagem',
      nomeItem: 'Bandagem',
      nomeCategoria: 'Medicamentos',
      quantidade: 4,
      saldoResultante: 5,
      versao: 1,
      resumo: null,
      auditoriaId: null,
    });
    expect(new Date(log!.data as string).toISOString()).toBe(log!.data);
    expect(logsDe(fake.dump(), 'gerencia')).toHaveLength(0);
  });

  it('AC2: falha no commit não muda estoque, versão nem log (dump idêntico)', async () => {
    await abrir({ medicamentos: { bandagem: 1 } });
    const antes = fake.dump();
    fake.falharProximoCommit(new Error('commit falhou'));
    await expect(adicionarAoBau(pedido(4), USUARIO)).rejects.toThrow('commit falhou');
    expect(fake.dump()).toEqual(antes);
    await adicionarAoBau(pedido(4), USUARIO);
    expect(itensDoBau().medicamentos!.bandagem).toBe(5);
  });

  it('AC2: falha ao gravar o log desfaz também o estoque', async () => {
    await abrir();
    const antes = fake.dump();
    fake.falharEm('set', /^logs\/membros\/entradas\//, new Error('log falhou'));
    await expect(adicionarAoBau(pedido(4), USUARIO)).rejects.toThrow('log falhou');
    expect(fake.dump()).toEqual(antes);
  });

  describe('AC3: quantidade inválida → ErroApp 400 e nada gravado', () => {
    for (const [nome, valor] of [...VALORES_INVALIDOS, ['acima do máximo', 100_001], ['muito grande', '99999999999999999999']] as Array<[string, unknown]>) {
      it(nome, async () => {
        await abrir();
        const antes = fake.dump();
        const e = await recusa(adicionarAoBau(pedido(valor), USUARIO));
        expect(e.status).toBe(400);
        expect(e.codigo).toBe('VALIDACAO');
        expect(fake.dump()).toEqual(antes);
        expect(escritas()).toEqual([]);
      });
    }

    it('limites 1 e 100000 são aceitos; texto só de dígitos também (contrato do parseInteiro)', async () => {
      await abrir();
      await adicionarAoBau(pedido(1), USUARIO);
      await adicionarAoBau(pedido(100_000), USUARIO);
      await adicionarAoBau(pedido('5'), USUARIO);
      expect(itensDoBau().medicamentos!.bandagem).toBe(100_006);
    });
  });

  describe('AC4: item, categoria ou tipo inexistente → nada gravado', () => {
    it('item fora do catálogo → 404', async () => {
      await abrir();
      const antes = fake.dump();
      const e = await recusa(adicionarAoBau(pedido(1, { itemId: 'inexistente' }), USUARIO));
      expect(e.status).toBe(404);
      expect(fake.dump()).toEqual(antes);
    });

    it('categoria fora do catálogo → 404', async () => {
      await abrir();
      const e = await recusa(adicionarAoBau(pedido(1, { categoriaId: 'nada' }), USUARIO));
      expect(e.status).toBe(404);
      expect(escritas()).toEqual([]);
    });

    it('item de outra categoria → 404', async () => {
      await abrir();
      const e = await recusa(adicionarAoBau(pedido(1, { categoriaId: 'armas', itemId: 'bandagem' }), USUARIO));
      expect(e.status).toBe(404);
      expect(escritas()).toEqual([]);
    });

    it('ids malformados ou perigosos → 400', async () => {
      await abrir();
      for (const id of ['__proto__', '../x', 'A', 'a b', '', 'a.b', 'x'.repeat(51), 7 as unknown as string]) {
        expect((await recusa(adicionarAoBau(pedido(1, { itemId: id }), USUARIO))).status).toBe(400);
        expect((await recusa(adicionarAoBau(pedido(1, { categoriaId: id }), USUARIO))).status).toBe(400);
      }
      expect(escritas()).toEqual([]);
    });

    it('tipo de baú inválido → 400', async () => {
      await abrir();
      const e = await recusa(adicionarAoBau({ ...pedido(1), tipo: 'outro' as 'membros' }, USUARIO));
      expect(e.status).toBe(400);
      expect(e.message).toBe('Tipo de baú inválido.');
      expect(escritas()).toEqual([]);
    });
  });

  it('AC5: resultado acima de Number.MAX_SAFE_INTEGER é recusado; até o limite seguro é aceito', async () => {
    await abrir({ medicamentos: { bandagem: Number.MAX_SAFE_INTEGER - 5 } });
    const antes = fake.dump();
    const e = await recusa(adicionarAoBau(pedido(6), USUARIO));
    expect(e.status).toBe(400);
    expect(fake.dump()).toEqual(antes);
    const r = await adicionarAoBau(pedido(5), USUARIO);
    expect(r.quantidade).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('AC6: versao sobe 1 por operação bem-sucedida e não muda em operação recusada', async () => {
    await abrir({}, { versao: 10 });
    await adicionarAoBau(pedido(1), USUARIO);
    expect(versao()).toBe(11);
    await adicionarAoBau(pedido(1), USUARIO);
    expect(versao()).toBe(12);
    await recusa(adicionarAoBau(pedido(0), USUARIO));
    await recusa(adicionarAoBau(pedido(1, { itemId: 'nao_existe' }), USUARIO));
    expect(versao()).toBe(12);
  });

  it('AC7: o usuário do log é o recebido (da sessão); campos extras como nível não são gravados', async () => {
    await abrir();
    const daSessao = { ...OUTRO_USUARIO, nivel: 3 } as unknown as typeof USUARIO;
    await adicionarAoBau(pedido(1), daSessao);
    const [log] = logsDe(fake.dump(), 'membros');
    expect(log!.usuario).toEqual({ id: OUTRO_USUARIO.id, nome: OUTRO_USUARIO.nome });
  });

  it('usuário sem id ou nome não grava nada (log sempre identifica quem fez)', async () => {
    await abrir();
    const antes = fake.dump();
    await expect(adicionarAoBau(pedido(1), { id: '', nome: 'X' })).rejects.toBeInstanceOf(ErroApp);
    await expect(adicionarAoBau(pedido(1), { id: '1', nome: '' })).rejects.toBeInstanceOf(ErroApp);
    expect(fake.dump()).toEqual(antes);
  });

  it('funciona também no baú da gerência, com log no escopo certo', async () => {
    await abrir();
    await adicionarAoBau(pedido(3, { tipo: 'gerencia' }), USUARIO);
    expect(itensDoBau('gerencia')).toEqual({ medicamentos: { bandagem: 3 } });
    expect(logsDe(fake.dump(), 'gerencia')).toHaveLength(1);
    expect(logsDe(fake.dump(), 'membros')).toHaveLength(0);
  });
});
