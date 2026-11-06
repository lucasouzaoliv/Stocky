import 'server-only';
import { LIMITES } from '@/compartilhado/limites';

export function gerarIdItem(nome: string): string {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, LIMITES.ID_ITEM_MAX)
    .replace(/_$/, '');
}

export type ResultadoNomeItem = { ok: true; nome: string; id: string } | { ok: false; erro: string };

export function validarNomeItem(nome: unknown): ResultadoNomeItem {
  if (typeof nome !== 'string') return { ok: false, erro: 'Informe o nome do item.' };
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo) return { ok: false, erro: 'Informe o nome do item.' };
  if (Array.from(limpo).length > LIMITES.NOME_ITEM_MAX) {
    return { ok: false, erro: `O nome do item pode ter no máximo ${LIMITES.NOME_ITEM_MAX} caracteres.` };
  }
  const id = gerarIdItem(limpo);
  if (!id) return { ok: false, erro: 'O nome do item precisa ter ao menos uma letra ou número.' };
  return { ok: true, nome: limpo, id };
}

const ID_SEGURO = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const ID_DOCUMENTO = /^[A-Za-z0-9]{1,40}$/;

export function ehIdSeguro(v: unknown): v is string {
  return typeof v === 'string' && v.length <= LIMITES.ID_ITEM_MAX && ID_SEGURO.test(v);
}

export function ehIdDocumento(v: unknown): v is string {
  return typeof v === 'string' && ID_DOCUMENTO.test(v);
}
