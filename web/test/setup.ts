import { afterEach, beforeEach } from 'vitest';

if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
} else {
  // Rede e pós-commit sempre bloqueados por padrão: nenhum teste do servidor fala com o Discord de verdade.
  // O teste que precisa de webhook troca isto por um fake-fetch e por um agendador que captura as tarefas.
  const { setAgendador, setFetch } = await import('@/server/contexto');
  beforeEach(() => {
    setFetch((() => Promise.reject(new Error('rede bloqueada no teste'))) as typeof fetch);
    setAgendador(() => undefined);
  });
}
