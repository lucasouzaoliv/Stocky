import { expect } from 'vitest';
import { garantirCatalogo } from '@/server/catalogo/semente';
import type { FakeFirestore } from '../helpers/fake-firestore';

const escritasFeitas = (fake: FakeFirestore): number => fake.chamadas.filter((c) => c.op !== 'get').length;

/**
 * Arma a falha de commit para a transação DA OPERAÇÃO, não para a da semente: `garantirCatalogo()` abre uma
 * transação própria no início de toda operação e consumiria a falha. Devolve a prova de que a operação chegou a
 * preparar escritas antes de o commit falhar (chame depois da operação).
 */
export async function falharCommitDaOperacao(fake: FakeFirestore, erro: Error): Promise<() => void> {
  await garantirCatalogo();
  const antes = escritasFeitas(fake);
  fake.falharProximoCommit(erro);
  return () => expect(escritasFeitas(fake), 'a falha de commit precisa atingir a transação da operação').toBeGreaterThan(antes);
}
