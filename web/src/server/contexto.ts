import 'server-only';
import { after } from 'next/server';
import { log } from './log';

export type Agendador = (tarefa: () => Promise<void>) => void;

let fetchAtual: typeof fetch | null = null;
let agendadorAtual: Agendador | null = null;

export function getFetch(): typeof fetch {
  return fetchAtual ?? globalThis.fetch;
}

export function setFetch(f: typeof fetch): void {
  fetchAtual = f;
}

function agendadorPadrao(tarefa: () => Promise<void>): void {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

export function agendar(tarefa: () => Promise<void>): void {
  const segura = async (): Promise<void> => {
    try {
      await tarefa();
    } catch (e) {
      log.erro('Falha em tarefa agendada', e);
    }
  };
  (agendadorAtual ?? agendadorPadrao)(segura);
}

export function setAgendador(a: Agendador): void {
  agendadorAtual = a;
}

export function resetContexto(): void {
  fetchAtual = null;
  agendadorAtual = null;
}
