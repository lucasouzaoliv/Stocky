import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const RAIZ_WEB = resolve(__dirname, '..', '..');
export const RAIZ_REPO = resolve(RAIZ_WEB, '..');

export function ler(caminho: string): string {
  return readFileSync(caminho, 'utf8');
}

export function lerJson<T = Record<string, unknown>>(caminho: string): T {
  return JSON.parse(ler(caminho)) as T;
}

export function listar(pasta: string, ext: RegExp): string[] {
  if (!existsSync(pasta)) return [];
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === 'node_modules' || nome === '.next') continue;
    const cheio = join(pasta, nome);
    if (statSync(cheio).isDirectory()) saida.push(...listar(cheio, ext));
    else if (ext.test(nome)) saida.push(cheio);
  }
  return saida;
}
