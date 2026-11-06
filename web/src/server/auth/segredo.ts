import 'server-only';
import { getEnv } from '../env';

export function chaveAssinatura(): Uint8Array {
  return new TextEncoder().encode(getEnv().sessionSecret);
}
