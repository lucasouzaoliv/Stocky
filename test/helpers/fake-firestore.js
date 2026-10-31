const ceder = () => new Promise((resolve) => setImmediate(resolve));

class ValorCampo {
  constructor(tipo, n) {
    this.tipo = tipo;
    this.n = n;
  }
}

const FieldValue = Object.freeze({
  increment: (n) => new ValorCampo('increment', n),
  delete: () => new ValorCampo('delete'),
  serverTimestamp: () => new ValorCampo('serverTimestamp')
});

function ehObjetoSimples(valor) {
  return Object.prototype.toString.call(valor) === '[object Object]' && !(valor instanceof ValorCampo);
}

function clonar(valor) {
  return structuredClone(valor);
}

function validarDados(valor, campo = '(documento)') {
  if (valor === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${campo}").`);
  }
  if (valor === null || valor instanceof ValorCampo || valor instanceof Date) return;
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => validarDados(v, `${campo}[${i}]`));
    return;
  }
  if (ehObjetoSimples(valor)) {
    Object.entries(valor).forEach(([k, v]) => validarDados(v, campo === '(documento)' ? k : `${campo}.${k}`));
    return;
  }
  if (['string', 'number', 'boolean'].includes(typeof valor)) return;
  throw new Error(`Unsupported field value (${Object.prototype.toString.call(valor)}) in field "${campo}".`);
}

function resolver(valor, atual) {
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

function mesclar(destino, dados) {
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor instanceof ValorCampo && valor.tipo === 'delete') {
      delete destino[chave];
    } else if (ehObjetoSimples(valor)) {
      if (!ehObjetoSimples(destino[chave])) destino[chave] = {};
      mesclar(destino[chave], valor);
    } else {
      destino[chave] = resolver(valor, destino[chave]);
    }
  }
}

function atualizarCampos(destino, dados) {
  for (const [chave, valor] of Object.entries(dados)) {
    const partes = chave.split('.');
    if (partes.some((p) => p === '')) throw new Error(`Nome de campo inválido em update(): "${chave}".`);
    let atual = destino;
    for (const parte of partes.slice(0, -1)) {
      if (!ehObjetoSimples(atual[parte])) atual[parte] = {};
      atual = atual[parte];
    }
    const folha = partes[partes.length - 1];
    if (valor instanceof ValorCampo && valor.tipo === 'delete') delete atual[folha];
    else atual[folha] = resolver(valor, atual[folha]);
  }
}

function lerCampo(dados, campo) {
  return campo.split('.').reduce((atual, parte) => (atual === null || atual === undefined ? undefined : atual[parte]), dados);
}

function comparar(a, b) {
  const va = a instanceof Date ? a.getTime() : a;
  const vb = b instanceof Date ? b.getTime() : b;
  if (va < vb) return -1;
  if (va > vb) return 1;
  return 0;
}

function aplicarOperacao(docs, { op, caminho, dados, opcoes }) {
  const existente = docs.get(caminho);
  if (op === 'delete') {
    docs.delete(caminho);
    return;
  }
  if (op === 'create' && existente !== undefined) {
    throw new Error(`ALREADY_EXISTS: o documento ${caminho} já existe.`);
  }
  if (op === 'update') {
    if (existente === undefined) throw new Error(`NOT_FOUND: no document to update: ${caminho}`);
    const novo = clonar(existente);
    atualizarCampos(novo, dados);
    docs.set(caminho, novo);
    return;
  }
  const novo = opcoes && opcoes.merge && existente !== undefined ? clonar(existente) : {};
  if (opcoes && opcoes.merge) mesclar(novo, dados);
  else for (const [k, v] of Object.entries(dados)) novo[k] = resolver(v, undefined);
  docs.set(caminho, novo);
}

function criarFakeFirestore({ seed = {}, registro = [] } = {}) {
  const banco = { docs: new Map(Object.entries(seed).map(([caminho, dados]) => [caminho, clonar(dados)])) };
  const chamadas = [];
  const falhas = [];
  let proximoErroCommit = null;
  let sequenciaId = 0;
  let fila = Promise.resolve();

  function registrar(op, caminho, emTransacao) {
    const entrada = { seq: registro.length + 1, origem: 'db', op, caminho, emTransacao };
    registro.push(entrada);
    chamadas.push(entrada);
  }

  function consumirFalha(op, caminho) {
    const opFalha = op === 'create' ? 'set' : op;
    const indice = falhas.findIndex((f) => f.op === opFalha && f.regex.test(caminho));
    return indice === -1 ? null : falhas.splice(indice, 1)[0].erro;
  }

  function proximoId() {
    sequenciaId += 1;
    return `auto${String(sequenciaId).padStart(16, '0')}`;
  }

  function criarSnapshot(caminho) {
    const dados = banco.docs.get(caminho);
    const existe = dados !== undefined;
    return {
      id: caminho.split('/').pop(),
      exists: existe,
      ref: criarDocRef(caminho),
      data: () => (existe ? clonar(dados) : undefined)
    };
  }

  function coletar(caminhoColecao, ordem, limite) {
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

  class Consulta {
    constructor(caminhoColecao, ordem = [], limite = null) {
      this.caminhoColecao = caminhoColecao;
      this.ordem = ordem;
      this.limite = limite;
    }

    orderBy(campo, direcao = 'asc') {
      if (!['asc', 'desc'].includes(direcao)) throw new Error(`Direção inválida em orderBy: ${direcao}`);
      return new Consulta(this.caminhoColecao, [...this.ordem, { campo, direcao }], this.limite);
    }

    limit(n) {
      return new Consulta(this.caminhoColecao, this.ordem, n);
    }

    async get() {
      registrar('get', this.caminhoColecao, false);
      const erro = consumirFalha('get', this.caminhoColecao);
      const resultado = coletar(this.caminhoColecao, this.ordem, this.limite);
      await ceder();
      if (erro) throw erro;
      return resultado;
    }
  }

  class ColecaoRef extends Consulta {
    constructor(caminho) {
      super(caminho);
      this.path = caminho;
      this.id = caminho.split('/').pop();
    }

    doc(id) {
      return criarDocRef(`${this.path}/${id === undefined ? proximoId() : id}`);
    }

    async add(dados) {
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

  function criarDocRef(caminho) {
    async function escrever(op, dados, opcoes) {
      if (dados !== undefined) validarDados(dados);
      registrar(op, caminho, false);
      const erro = consumirFalha(op, caminho);
      await ceder();
      if (erro) throw erro;
      aplicarOperacao(banco.docs, { op, caminho, dados, opcoes });
    }

    return {
      id: caminho.split('/').pop(),
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
      delete: () => escrever('delete')
    };
  }

  function criarTransacao() {
    const operacoes = [];
    let erroCommit = null;

    function escrever(op, ref, dados, opcoes) {
      if (dados !== undefined) validarDados(dados);
      registrar(op, ref.path, true);
      const erro = consumirFalha(op, ref.path);
      if (erro && !erroCommit) erroCommit = erro;
      operacoes.push({ op, caminho: ref.path, dados, opcoes });
    }

    const tx = {
      get(alvo) {
        if (operacoes.length > 0) {
          return Promise.reject(new Error('Firestore transactions require all reads to be executed before all writes.'));
        }
        const caminho = alvo.path || alvo.caminhoColecao;
        registrar('get', caminho, true);
        const erro = consumirFalha('get', caminho);
        if (erro) return Promise.reject(erro);
        return Promise.resolve(alvo instanceof Consulta ? coletar(alvo.caminhoColecao, alvo.ordem, alvo.limite) : criarSnapshot(alvo.path));
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
      }
    };

    return {
      tx,
      commit() {
        const erroProximo = proximoErroCommit;
        proximoErroCommit = null;
        if (erroProximo) throw erroProximo;
        if (erroCommit) throw erroCommit;
        const copia = new Map(banco.docs);
        operacoes.forEach((operacao) => aplicarOperacao(copia, operacao));
        banco.docs = copia;
      }
    };
  }

  function runTransaction(fn) {
    const execucao = fila.then(async () => {
      const { tx, commit } = criarTransacao();
      const retorno = await fn(tx);
      commit();
      return retorno;
    });
    fila = execucao.catch(() => {});
    return execucao;
  }

  return {
    collection: (nome) => new ColecaoRef(nome),
    runTransaction,
    FieldValue,
    chamadas,
    falharProximoCommit(erro) {
      proximoErroCommit = erro;
    },
    falharEm(op, regexCaminho, erro) {
      falhas.push({ op, regex: regexCaminho, erro });
    },
    dump() {
      return Object.fromEntries([...banco.docs.entries()].map(([caminho, dados]) => [caminho, clonar(dados)]));
    }
  };
}

module.exports = { criarFakeFirestore };
