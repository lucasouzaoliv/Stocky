import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/firebase';
import { ErroApp } from '@/server/erros';
import {
  exigirAlvoZerar,
  exigirEscopoLog,
  exigirTipoBau,
  lerDocBau,
  lerDocSaldo,
  refAuditoria,
  refBau,
  refCatalogo,
  refLogs,
  refMensagemFixa,
  refSaldo,
} from '@/server/dominio/refs';
import { comoDb, criarFakeFirestore } from '../helpers/fake-firestore';

let db: Db;
beforeEach(() => {
  db = comoDb(criarFakeFirestore());
});

describe('WEB-013 modelo de dados', () => {
  it('AC2: helpers de referência apontam para os caminhos do contrato', () => {
    expect(refCatalogo(db).path).toBe('config/catalogo');
    expect(refBau(db, 'membros').path).toBe('baus/membros');
    expect(refBau(db, 'gerencia').path).toBe('baus/gerencia');
    expect(refSaldo(db).path).toBe('caixa/saldo');
    expect(refAuditoria(db).path).toBe('auditoria');
    expect(refLogs(db, 'caixa').path).toBe('logs/caixa/entradas');
    expect(refLogs(db, 'membros').path).toBe('logs/membros/entradas');
    expect(refMensagemFixa(db, 'saldo_caixa').path).toBe('webhook_mensagens/saldo_caixa');
  });

  it('AC2: tipo inválido lança ErroApp VALIDACAO (400)', () => {
    for (const ruim of ['', 'MEMBROS', '../x', 'caixa', 'ambos', null, undefined, 1, {}]) {
      expect(() => exigirTipoBau(ruim), String(ruim)).toThrow(ErroApp);
    }
    expect(() => exigirTipoBau('x')).toThrow(expect.objectContaining({ codigo: 'VALIDACAO', status: 400 }));
    expect(() => refBau(db, 'x' as never)).toThrow(ErroApp);
    expect(() => refLogs(db, 'x' as never)).toThrow(ErroApp);
    expect(() => exigirAlvoZerar('caixa')).toThrow(ErroApp);
    expect(() => exigirEscopoLog('ambos')).toThrow(ErroApp);
    expect(() => refMensagemFixa(db, 'outra' as never)).toThrow(ErroApp);
  });

  it('exigir* aceitam os valores válidos', () => {
    expect(exigirTipoBau('membros')).toBe('membros');
    expect(exigirAlvoZerar('ambos')).toBe('ambos');
    expect(exigirAlvoZerar('gerencia')).toBe('gerencia');
    expect(exigirEscopoLog('caixa')).toBe('caixa');
  });

  it('AC3: lerDocBau ignora chaves que não são item e nunca devolve versao como item', () => {
    const doc = lerDocBau({
      versao: 7,
      atualizadoEm: 'x',
      armas: { colt: 5 },
      itens: {
        armas: { colt: 3, usp: 0, ak_47: -1, desert: 1.5, versao: 'a', __proto__x: 4, '../a': 2 },
        __proto__: { x: 1 },
        vazia: { nada: 0 },
        ruim: 'texto',
        'Chave Ruim': { colt: 1 },
      },
    });
    expect(doc.versao).toBe(7);
    expect(doc.itens).toEqual({ armas: { colt: 3 } });
    expect(JSON.stringify(doc.itens)).not.toContain('versao');
    expect(Object.getPrototypeOf(doc.itens)).toBe(Object.prototype);
  });

  it('lerDocBau e lerDocSaldo toleram lixo e documento ausente', () => {
    expect(lerDocBau(undefined)).toEqual({ versao: 0, itens: {}, atualizadoEm: '' });
    expect(lerDocBau('texto')).toEqual({ versao: 0, itens: {}, atualizadoEm: '' });
    expect(lerDocBau({ versao: -1, itens: [] }).versao).toBe(0);
    expect(lerDocSaldo(undefined)).toEqual({ sujo: 0, limpo: 0, versao: 0, atualizadoEm: '' });
    expect(lerDocSaldo({ sujo: 10, limpo: -5, versao: 2.5 })).toMatchObject({ sujo: 10, limpo: 0, versao: 0 });
  });

  it('AC4: baú com 6 categorias x 25 itens fica abaixo de 100 KB', () => {
    const itens: Record<string, Record<string, number>> = {};
    for (let c = 0; c < 6; c++) {
      const mapa: Record<string, number> = {};
      for (let i = 0; i < 25; i++) mapa[`item_com_nome_longo_numero_${String(i).padStart(2, '0')}_abcdefghijklm`] = 100_000;
      itens[`categoria_${c}`] = mapa;
    }
    const bytes = Buffer.byteLength(JSON.stringify({ versao: 1, itens, atualizadoEm: new Date().toISOString() }));
    expect(bytes).toBeLessThan(100 * 1024);
    expect(Object.keys(lerDocBau({ versao: 1, itens }).itens)).toHaveLength(6);
  });
});
