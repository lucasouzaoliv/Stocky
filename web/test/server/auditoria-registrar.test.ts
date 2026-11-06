import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registrarAuditoriaTx } from '@/server/auditoria/registrar';
import { ErroApp } from '@/server/erros';
import { getDb, resetDb, setDb } from '@/server/firebase';
import { esquemaConfirmar, esquemaNovoItem, esquemaPrevia, esquemaZerar, validarCorpo } from '@/server/validacao/corpo';
import { comoDb, criarFakeFirestore, type FakeFirestore } from '../helpers/fake-firestore';
import { USUARIO, auditorias } from '../helpers/estado';

let fake: FakeFirestore;
beforeEach(() => {
  fake = criarFakeFirestore();
  setDb(comoDb(fake));
});
afterEach(() => resetDb());

const entrada = (o: object = {}) => ({
  acao: 'bau.zerar' as const,
  usuario: { id: USUARIO.id, nome: USUARIO.nome },
  alvo: { alvos: ['membros'] },
  resumo: 'Zerou.',
  antes: { membros: {} },
  depois: {},
  ...o,
});

describe('registrarAuditoriaTx', () => {
  it('grava dentro da transação com data ISO, devolve o id e guarda só id e nome do usuário', async () => {
    const db = getDb();
    const id = await db.runTransaction(async (tx) => registrarAuditoriaTx(tx, db, entrada({ usuario: { ...USUARIO, nivel: 3, token: 'x' } })));
    expect(fake.chamadas.filter((c) => c.op === 'create').every((c) => c.emTransacao)).toBe(true);
    const doc = fake.dump()[`auditoria/${id}`]!;
    expect(doc.usuario).toEqual({ id: USUARIO.id, nome: USUARIO.nome });
    expect(new Date(String(doc.data)).toISOString()).toBe(doc.data);
  });

  it('usuário ausente ou incompleto → erro e nada gravado', async () => {
    const db = getDb();
    for (const usuario of [undefined, null, {}, { id: '', nome: 'x' }, { id: '1', nome: '' }]) {
      await expect(db.runTransaction(async (tx) => registrarAuditoriaTx(tx, db, entrada({ usuario })))).rejects.toBeInstanceOf(ErroApp);
    }
    expect(auditorias(fake.dump())).toHaveLength(0);
  });

  it('resumo é limitado a 200 caracteres', async () => {
    const db = getDb();
    await db.runTransaction(async (tx) => registrarAuditoriaTx(tx, db, entrada({ resumo: 'a'.repeat(500) })));
    expect(String(auditorias(fake.dump())[0]!.resumo)).toHaveLength(200);
  });

  it('falha de commit → nenhuma auditoria', async () => {
    const db = getDb();
    fake.falharProximoCommit(new Error('falha'));
    await expect(db.runTransaction(async (tx) => registrarAuditoriaTx(tx, db, entrada()))).rejects.toThrow();
    expect(auditorias(fake.dump())).toHaveLength(0);
  });
});

describe('esquemas de corpo da onda 5 (ADR-14)', () => {
  const recusa = (esquema: Parameters<typeof validarCorpo>[0], dados: unknown) => {
    try {
      validarCorpo(esquema, dados);
    } catch (e) {
      expect(e).toBeInstanceOf(ErroApp);
      expect((e as ErroApp).message).toBe('Os dados enviados são inválidos.');
      return true;
    }
    return false;
  };

  it('esquemaNovoItem: exige categoriaId seguro e nome texto; campo extra recusado', () => {
    expect(validarCorpo(esquemaNovoItem, { categoriaId: 'armas', nome: 'Faca' })).toEqual({ categoriaId: 'armas', nome: 'Faca' });
    for (const d of [{}, { categoriaId: 'Armas', nome: 'x' }, { categoriaId: 'armas', nome: 1 }, { categoriaId: 'armas', nome: 'x', a: 1 }, null, []]) expect(recusa(esquemaNovoItem, d)).toBe(true);
  });

  it('esquemaZerar: alvo e confirmacao são textos; extra recusado', () => {
    expect(validarCorpo(esquemaZerar, { alvo: 'ambos', confirmacao: 'ZERAR' })).toEqual({ alvo: 'ambos', confirmacao: 'ZERAR' });
    for (const d of [{}, { alvo: 'ambos' }, { alvo: 1, confirmacao: 'ZERAR' }, { alvo: 'ambos', confirmacao: 'ZERAR', x: 1 }]) expect(recusa(esquemaZerar, d)).toBe(true);
  });

  it('esquemaPrevia/esquemaConfirmar: linhas em lista de objetos estritos; versão numérica obrigatória na confirmação', () => {
    const l = [{ categoriaId: 'armas', itemId: 'colt', quantidade: 1 }];
    expect(validarCorpo(esquemaPrevia, { linhas: l })).toEqual({ linhas: l });
    expect(validarCorpo(esquemaConfirmar, { versao: 0, linhas: l })).toEqual({ versao: 0, linhas: l });
    for (const d of [{}, { linhas: 'x' }, { linhas: [1] }, { linhas: [{ ...l[0], x: 1 }] }, { linhas: l, versao: 1 }]) expect(recusa(esquemaPrevia, d)).toBe(true);
    for (const d of [{ linhas: l }, { versao: '1', linhas: l }, { versao: 1 }, { versao: 1, linhas: l, x: 1 }]) expect(recusa(esquemaConfirmar, d)).toBe(true);
  });
});
