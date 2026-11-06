import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { listar } from './arquivos';

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const PROIBIDOS_NO_CLIENTE = /^(?:server-only|firebase-admin(?:\/.*)?|next\/headers|jose|node:.*)$/;

export function ehClient(fonte: string): boolean {
  const antes = fonte.replace(/^﻿/, '').replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  return /^['"]use client['"]/.test(antes);
}

export function especificadores(fonte: string): string[] {
  const achados = new Set<string>();
  const padroes = [
    /\bimport\s+(?:type\s+)?[\w*{}\s,$]*?\s+from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\w*{}\s,$]*?\s+from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const p of padroes) for (const m of fonte.matchAll(p)) achados.add(m[1]!);
  return [...achados];
}

function resolverArquivo(base: string): string | null {
  const candidatos = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => join(base, 'index' + e))];
  for (const c of candidatos) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Resolve `@/x` (para `src/x`) e caminhos relativos; pacotes externos devolvem null. */
export function resolverImport(de: string, spec: string, src: string): string | null {
  if (spec.startsWith('@/')) return resolverArquivo(join(src, spec.slice(2)));
  if (spec.startsWith('.')) return resolverArquivo(resolve(dirname(de), spec));
  return null;
}

export interface Violacao {
  cliente: string;
  via: string[];
  motivo: string;
}

/** Percorre, a partir de cada arquivo "use client", o grafo transitivo de imports. */
export function violacoesDoCliente(src: string): Violacao[] {
  const raizServer = join(src, 'server') + '/';
  const violacoes: Violacao[] = [];
  const arquivos = listar(src, /\.(ts|tsx|js|jsx|mjs)$/);
  for (const inicio of arquivos.filter((f) => ehClient(readFileSync(f, 'utf8')))) {
    const visitados = new Set<string>([inicio]);
    const fila: Array<{ arquivo: string; caminho: string[] }> = [{ arquivo: inicio, caminho: [inicio] }];
    while (fila.length > 0) {
      const { arquivo, caminho } = fila.shift()!;
      for (const spec of especificadores(readFileSync(arquivo, 'utf8'))) {
        if (PROIBIDOS_NO_CLIENTE.test(spec)) {
          violacoes.push({ cliente: inicio, via: [...caminho, spec], motivo: `importa ${spec}` });
          continue;
        }
        const alvo = resolverImport(arquivo, spec, src);
        if (!alvo || visitados.has(alvo)) continue;
        if (alvo.startsWith(raizServer)) {
          violacoes.push({ cliente: inicio, via: [...caminho, alvo], motivo: 'alcança src/server' });
          continue;
        }
        visitados.add(alvo);
        fila.push({ arquivo: alvo, caminho: [...caminho, alvo] });
      }
    }
  }
  return violacoes;
}

/** `compartilhado` é código puro (ADR-13): sem server, sem server-only, sem Node. */
export function violacoesDoCompartilhado(src: string): string[] {
  const ruins: string[] = [];
  for (const f of listar(join(src, 'compartilhado'), /\.(ts|tsx)$/)) {
    for (const spec of especificadores(readFileSync(f, 'utf8'))) {
      if (spec.startsWith('@/server') || PROIBIDOS_NO_CLIENTE.test(spec) || spec.includes('/server/')) ruins.push(`${f}: ${spec}`);
    }
  }
  return ruins;
}
