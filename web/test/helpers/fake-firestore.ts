import type { Db } from '@/server/firebase';

export type Dados = Record<string, unknown>;
type TipoCampo = 'increment' | 'delete' | 'serverTimestamp';
type Op = 'get' | 'set' | 'update' | 'delete' | 'add' | 'create';
type OpEscrita = 'set' | 'update' | 'delete' | 'create';

class ValorCampo {
  constructor(
    readonly tipo: TipoCampo,
    readonly n: number = 0,
  ) {}
}

export const FieldValueFake = Object.freeze({
  increment: (n: number) => new ValorCampo('increment', n),
  delete: () => new ValorCampo('delete'),
  serverTimestamp: () => new ValorCampo('serverTimestamp'),
});

export interface ChamadaFake {
  seq: number;
  origem: 'db';
  op: Op;
  caminho: string;
  emTransacao: boolean;
}

const ceder = () => new Promise<void>((resolve) => setImmediate(resolve));

function ehObjetoSimples(v: unknown): v is Dados {
  return Object.prototype.toString.call(v) === '[object Object]' && !(v instanceof ValorCampo);
}

function clonar<T>(v: T): T {
  return structuredClone(v);
}

function validarDados(valor: unknown, campo = '(documento)'): void {
  if (valor === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${campo}").`);
  }
  if (valor === null || valor instanceof ValorCampo || valor instanceof Date) return;
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => validarDados(v, `${campo}[${i}]`));
    return;
  }
  if (ehObjetoSimples(valor)) {
    for (const [k, v] of Object.entries(valor)) validarDados(v, campo === '(documento)' ? k : `${campo}.${k}`);
    return;
  }
  if (['string', 'number', 'boolean'].includes(typeof valor)) return;
  throw new Error(`Unsupported field value (${Object.prototype.toString.call(valor)}) in field "${campo}".`);
}

function resolver(valor: unknown, atual: unknown): unknown {
  if (valor instanceof ValorCampo) {
    if (valor.tipo === 'increment') return (typeof atual === 'number' ? atual : 0) + valor.n;
    if (valor.tipo === 'serverTimestamp') return new Date().toISOString();
    throw new Error('FieldValue.delete() só pode ser usado em update() ou set() com merge.');
  }
  if (Array.isArray(valor)) return valor.map((v) => resolver(v, undefined));
  if (ehObjetoSimples(valor)) {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolver(v, undefined)]));
  }
  return clonar(valor);
}

function mesclar(destino: Dados, dados: Dados): void {
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor instanceof ValorCampo && valor.tipo === 'delete') {
      delete destino[chave];
    } else if (ehObjetoSimples(valor)) {
      let filho = destino[chave];
      if (!ehObjetoSimples(filho)) {
        filho = {};
        destino[chave] = filho;
      }
      mesclar(filho as Dados, valor);
    } else {
      destino[chave] = resolver(valor, destino[chave]);
    }
  }
}

function atualizarCampos(destino: Dados, dados: Dados): void {
  for (const [chave, valor] of Object.entries(dados)) {
    const partes = chave.split('.');
    if (partes.some((p) => p === '')) throw new Error(`Nome de campo inválido em update(): "${chave}".`);
    let atual = destino;
    for (const parte of partes.slice(0, -1)) {
      let filho = atual[parte];
      if (!ehObjetoSimples(filho)) {
        filho = {};
        atual[parte] = filho;
      }
      atual = filho as Dados;
    }
    const folha = partes[partes.length - 1] as string;
    if (valor instanceof ValorCampo && valor.tipo === 'delete') delete atual[folha];
    else atual[folha] = resolver(valor, atual[folha]);
  }
}

function lerCampo(dados: unknown, campo: string): unknown {
  return campo
    .split('.')
    .reduce<unknown>((atual, parte) => (atual === null || atual === undefined ? undefined : (atual as Dados)[parte]), dados);
}

function comparar(a: unknown, b: unknown): number {
  const va = a instanceof Date ? a.getTime() : (a as number | string);
  const vb = b instanceof Date ? b.getTime() : (b as number | string);
  if (va < vb) return -1;
  if (va > vb) return 1;
  return 0;
}

interface Operacao {
  op: OpEscrita;
  caminho: string;
  dados?: Dados;
  opcoes?: { merge?: boolean };
}

function aplicarOperacao(docs: Map<string, Dados>, { op, caminho, dados, opcoes }: Operacao): void {
  const existente = docs.get(caminho);
  if (op === 'delete') {
    docs.delete(caminho);
    return;
  }
  const entrada = dados ?? {};
  if (op === 'create' && existente !== undefined) {
    throw new Error(`ALREADY_EXISTS: o documento ${caminho} já existe.`);
  }
  if (op === 'update') {
    if (existente === undefined) throw new Error(`NOT_FOUND: no document to update: ${caminho}`);
    const novo = clonar(existente);
    atualizarCampos(novo, entrada);
    docs.set(caminho, novo);
    return;
  }
  const novo: Dados = opcoes?.merge && existente !== undefined ? clonar(existente) : {};
  if (opcoes?.merge) mesclar(novo, entrada);
  else for (const [k, v] of Object.entries(entrada)) novo[k] = resolver(v, undefined);
  docs.set(caminho, novo);
}

export interface SnapshotFake {
  id: string;
  exists: boolean;
  ref: DocRefFake;
  data(): Dados | undefined;
}

export interface QuerySnapshotFake {
  docs: SnapshotFake[];
  size: number;
  empty: boolean;
  forEach(fn: (d: SnapshotFake) => void): void;
}

export interface DocRefFake {
  id: string;
  path: string;
  collection(nome: string): ColecaoRefFake;
  get(): Promise<SnapshotFake>;
  set(dados: Dados, opcoes?: { merge?: boolean }): Promise<void>;
  update(dados: Dados): Promise<void>;
  delete(): Promise<void>;
}

export interface ConsultaFake {
  caminhoColecao: string;
  orderBy(campo: string, direcao?: 'asc' | 'desc'): ConsultaFake;
  limit(n: number): ConsultaFake;
  get(): Promise<QuerySnapshotFake>;
}

export interface ColecaoRefFake extends ConsultaFake {
  id: string;
  path: string;
  doc(id?: string): DocRefFake;
  add(dados: Dados): Promise<DocRefFake>;
}

export interface TransacaoFake {
  get(alvo: DocRefFake): Promise<SnapshotFake>;
  get(alvo: ConsultaFake): Promise<QuerySnapshotFake>;
  set(ref: DocRefFake, dados: Dados, opcoes?: { merge?: boolean }): TransacaoFake;
  update(ref: DocRefFake, dados: Dados): TransacaoFake;
  delete(ref: DocRefFake): TransacaoFake;
  create(ref: DocRefFake, dados: Dados): TransacaoFake;
}

export interface FakeFirestore {
  collection(nome: string): ColecaoRefFake;
  runTransaction<T>(fn: (tx: TransacaoFake) => Promise<T>): Promise<T>;
  FieldValue: typeof FieldValueFake;
  chamadas: ChamadaFake[];
  falharProximoCommit(erro: Error): void;
  falharEm(op: Exclude<Op, 'create'>, regexCaminho: RegExp, erro: Error): void;
  dump(): Record<string, Dados>;
}

export function criarFakeFirestore({
  seed = {},
  registro = [],
}: { seed?: Record<string, Dados>; registro?: ChamadaFake[] } = {}): FakeFirestore {
  const banco = { docs: new Map<string, Dados>(Object.entries(seed).map(([c, d]) => [c, clonar(d)])) };
  const chamadas: ChamadaFake[] = [];
  const falhas: Array<{ op: string; regex: RegExp; erro: Error }> = [];
  let proximoErroCommit: Error | null = null;
  let sequenciaId = 0;
  let fila: Promise<unknown> = Promise.resolve();

  function registrar(op: Op, caminho: string, emTransacao: boolean): void {
    const entrada: ChamadaFake = { seq: registro.length + 1, origem: 'db', op, caminho, emTransacao };
    registro.push(entrada);
    chamadas.push(entrada);
  }

  function consumirFalha(op: Op, caminho: string): Error | null {
    const opFalha = op === 'create' ? 'set' : op;
    const indice = falhas.findIndex((f) => f.op === opFalha && f.regex.test(caminho));
    return indice === -1 ? null : (falhas.splice(indice, 1)[0] as { erro: Error }).erro;
  }

  function proximoId(): string {
    sequenciaId += 1;
    return `auto${String(sequenciaId).padStart(16, '0')}`;
  }

  function criarSnapshot(caminho: string): SnapshotFake {
    const dados = banco.docs.get(caminho);
    return {
      id: caminho.split('/').pop() as string,
      exists: dados !== undefined,
      ref: criarDocRef(caminho),
      data: () => (dados === undefined ? undefined : clonar(dados)),
    };
  }

  function coletar(
    caminhoColecao: string,
    ordem: Array<{ campo: string; direcao: 'asc' | 'desc' }>,
    limite: number | null,
  ): QuerySnapshotFake {
    const prefixo = `${caminhoColecao}/`;
    let caminhos = [...banco.docs.keys()].filter((c) => c.startsWith(prefixo) && !c.slice(prefixo.length).includes('/'));
    if (ordem.length === 0) {
      caminhos.sort();
    } else {
      caminhos = caminhos.filter((c) => ordem.every(({ campo }) => lerCampo(banco.docs.get(c), campo) !== undefined));
      caminhos.sort((ca, cb) => {
        for (const { campo, direcao } of ordem) {
          const r = comparar(lerCampo(banco.docs.get(ca), campo), lerCampo(banco.docs.get(cb), campo));
          if (r !== 0) return direcao === 'desc' ? -r : r;
        }
        return ca < cb ? -1 : 1;
      });
    }
    if (limite !== null) caminhos = caminhos.slice(0, limite);
    const docs = caminhos.map(criarSnapshot);
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
  }

  class Consulta implements ConsultaFake {
    constructor(
      readonly caminhoColecao: string,
      protected readonly ordem: Array<{ campo: string; direcao: 'asc' | 'desc' }> = [],
      protected readonly limite: number | null = null,
    ) {}

    orderBy(campo: string, direcao: 'asc' | 'desc' = 'asc'): ConsultaFake {
      if (!['asc', 'desc'].includes(direcao)) throw new Error(`Direção inválida em orderBy: ${String(direcao)}`);
      return new Consulta(this.caminhoColecao, [...this.ordem, { campo, direcao }], this.limite);
    }

    limit(n: number): ConsultaFake {
      return new Consulta(this.caminhoColecao, this.ordem, n);
    }

    async get(): Promise<QuerySnapshotFake> {
      registrar('get', this.caminhoColecao, false);
      const erro = consumirFalha('get', this.caminhoColecao);
      const resultado = coletar(this.caminhoColecao, this.ordem, this.limite);
      await ceder();
      if (erro) throw erro;
      return resultado;
    }

    resultadoSincrono(): QuerySnapshotFake {
      return coletar(this.caminhoColecao, this.ordem, this.limite);
    }
  }

  class ColecaoRef extends Consulta implements ColecaoRefFake {
    readonly path: string;
    readonly id: string;

    constructor(caminho: string) {
      super(caminho);
      this.path = caminho;
      this.id = caminho.split('/').pop() as string;
    }

    doc(id?: string): DocRefFake {
      return criarDocRef(`${this.path}/${id === undefined ? proximoId() : id}`);
    }

    async add(dados: Dados): Promise<DocRefFake> {
      validarDados(dados);
      const ref = this.doc();
      registrar('add', ref.path, false);
      const erro = consumirFalha('add', ref.path);
      await ceder();
      if (erro) throw erro;
      aplicarOperacao(banco.docs, { op: 'set', caminho: ref.path, dados });
      return ref;
    }
  }

  function criarDocRef(caminho: string): DocRefFake {
    async function escrever(op: OpEscrita, dados?: Dados, opcoes?: { merge?: boolean }): Promise<void> {
      if (dados !== undefined) validarDados(dados);
      registrar(op, caminho, false);
      const erro = consumirFalha(op, caminho);
      await ceder();
      if (erro) throw erro;
      aplicarOperacao(banco.docs, { op, caminho, dados, opcoes });
    }

    return {
      id: caminho.split('/').pop() as string,
      path: caminho,
      collection: (nome) => new ColecaoRef(`${caminho}/${nome}`),
      async get() {
        registrar('get', caminho, false);
        const erro = consumirFalha('get', caminho);
        const snapshot = criarSnapshot(caminho);
        await ceder();
        if (erro) throw erro;
        return snapshot;
      },
      set: (dados, opcoes) => escrever('set', dados, opcoes),
      update: (dados) => escrever('update', dados),
      delete: () => escrever('delete'),
    };
  }

  function criarTransacao() {
    const operacoes: Operacao[] = [];
    let erroCommit: Error | null = null;

    function escrever(op: OpEscrita, ref: DocRefFake, dados?: Dados, opcoes?: { merge?: boolean }): void {
      if (dados !== undefined) validarDados(dados);
      registrar(op, ref.path, true);
      const erro = consumirFalha(op, ref.path);
      if (erro && !erroCommit) erroCommit = erro;
      operacoes.push({ op, caminho: ref.path, dados, opcoes });
    }

    const tx: TransacaoFake = {
      get(alvo: DocRefFake | ConsultaFake): never {
        if (operacoes.length > 0) {
          return Promise.reject(
            new Error('Firestore transactions require all reads to be executed before all writes.'),
          ) as never;
        }
        const ehConsulta = alvo instanceof Consulta;
        const caminho = ehConsulta ? alvo.caminhoColecao : (alvo as DocRefFake).path;
        registrar('get', caminho, true);
        const erro = consumirFalha('get', caminho);
        if (erro) return Promise.reject(erro) as never;
        return Promise.resolve(
          ehConsulta ? alvo.resultadoSincrono() : criarSnapshot((alvo as DocRefFake).path),
        ) as never;
      },
      set(ref, dados, opcoes) {
        escrever('set', ref, dados, opcoes);
        return tx;
      },
      update(ref, dados) {
        escrever('update', ref, dados);
        return tx;
      },
      delete(ref) {
        escrever('delete', ref);
        return tx;
      },
      create(ref, dados) {
        escrever('create', ref, dados);
        return tx;
      },
    };

    return {
      tx,
      commit(): void {
        const erroProximo = proximoErroCommit;
        proximoErroCommit = null;
        if (erroProximo) throw erroProximo;
        if (erroCommit) throw erroCommit;
        const copia = new Map(banco.docs);
        operacoes.forEach((operacao) => aplicarOperacao(copia, operacao));
        banco.docs = copia;
      },
    };
  }

  function runTransaction<T>(fn: (tx: TransacaoFake) => Promise<T>): Promise<T> {
    const execucao = fila.then(async () => {
      const { tx, commit } = criarTransacao();
      const retorno = await fn(tx);
      commit();
      return retorno;
    });
    fila = execucao.catch(() => undefined);
    return execucao;
  }

  return {
    collection: (nome) => new ColecaoRef(nome),
    runTransaction,
    FieldValue: FieldValueFake,
    chamadas,
    falharProximoCommit(erro) {
      proximoErroCommit = erro;
    },
    falharEm(op, regexCaminho, erro) {
      falhas.push({ op, regex: regexCaminho, erro });
    },
    dump() {
      return Object.fromEntries([...banco.docs.entries()].map(([c, d]) => [c, clonar(d)]));
    },
  };
}

export function comoDb(fake: FakeFirestore): Db {
  return fake as unknown as Db;
}
