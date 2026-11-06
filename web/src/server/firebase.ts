import 'server-only';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { getEnv } from './env';

export type Db = Firestore;
export type { CollectionReference, DocumentReference, Transaction };

let injetado: Db | null = null;
let memo: Db | null = null;

export function getDb(): Db {
  if (injetado) return injetado;
  if (memo) return memo;
  const { projectId, clientEmail, privateKey } = getEnv().firebase;
  const app =
    getApps().length > 0 ? getApp() : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  memo = getFirestore(app);
  return memo;
}

export function setDb(db: Db): void {
  injetado = db;
}

export function resetDb(): void {
  injetado = null;
  memo = null;
}
