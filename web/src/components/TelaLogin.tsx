import { MENSAGENS_LOGIN } from '@/compartilhado/erros';

export const MENSAGEM_LOGIN_GENERICA = 'Não foi possível entrar. Tente de novo.';

/** Só códigos conhecidos viram texto; o valor recebido nunca é refletido na tela. */
export function mensagemDeLogin(codigo: unknown): string | null {
  if (codigo === undefined || codigo === null || codigo === '') return null;
  if (typeof codigo === 'string' && Object.hasOwn(MENSAGENS_LOGIN, codigo)) return MENSAGENS_LOGIN[codigo]!;
  return MENSAGEM_LOGIN_GENERICA;
}

export function TelaLogin({ erro }: { erro?: unknown }) {
  const mensagem = mensagemDeLogin(erro);
  return (
    <main id="conteudo" tabIndex={-1} className="conteudo login">
      <section className="login__cartao" aria-labelledby="login-titulo">
        <span className="login__logo" aria-hidden="true" />
        <h1 id="login-titulo" className="sr-only">Stocky</h1>
        <p className="login__texto">Entre com a sua conta do Discord.</p>
        {mensagem ? (
          <p className="login__erro" role="alert">
            {mensagem}
          </p>
        ) : null}
        <a className="botao login__botao" href="/api/auth/login">
          Entrar com Discord
        </a>
      </section>
    </main>
  );
}
