import { exigirAcaoAuditoria, lerAuditoria } from '@/server/auditoria/leitura';
import { comAutorizacao } from '@/server/auth/autorizacao';
import { responderOk } from '@/server/http';
import { lerPaginacao } from '@/server/paginacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Somente leitura (nível 2): a auditoria não tem nenhum método de escrita. */
export const GET = comAutorizacao({ nivel: 2 }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const paginacao = lerPaginacao(sp);
  const acao = exigirAcaoAuditoria(sp.get('acao'));
  return responderOk(await lerAuditoria({ ...paginacao, acao }));
});
