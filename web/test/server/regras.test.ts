import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ_WEB, ler, lerJson } from '../helpers/arquivos';

const regras = ler(join(RAIZ_WEB, 'firestore.rules'));
const semComentarios = regras.replace(/\/\/.*$/gm, '');

describe('WEB-012 regras do Firestore', () => {
  it('AC1: uma só regra catch-all que nega leitura e escrita', () => {
    expect(semComentarios.match(/match\s+\/\{document=\*\*\}/g)).toHaveLength(1);
    const allows = semComentarios.match(/allow\b[^;]*;/g) ?? [];
    expect(allows).toEqual(['allow read, write: if false;']);
  });

  it('AC2: sem condição que libere acesso', () => {
    expect(semComentarios).not.toMatch(/if\s+true/);
    expect(semComentarios).not.toMatch(/request\.auth/);
    expect(semComentarios.match(/:\s*if\s+(?!false;)/g)).toBeNull();
  });

  it('firebase.json aponta para as regras e para os índices', () => {
    const cfg = lerJson<{ firestore: { rules: string; indexes: string } }>(join(RAIZ_WEB, 'firebase.json'));
    expect(cfg.firestore.rules).toBe('firestore.rules');
    expect(cfg.firestore.indexes).toBe('firestore.indexes.json');
  });

  it('índice composto da auditoria (acao ASC, data DESC) declarado', () => {
    const idx = lerJson<{ indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }> }>(
      join(RAIZ_WEB, 'firestore.indexes.json'),
    );
    expect(idx.indexes).toContainEqual(
      expect.objectContaining({
        collectionGroup: 'auditoria',
        fields: [
          { fieldPath: 'acao', order: 'ASCENDING' },
          { fieldPath: 'data', order: 'DESCENDING' },
        ],
      }),
    );
  });
});
