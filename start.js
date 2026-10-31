const index = require('./index');
const { ErroConfig, lerConfigJson, montarConfigDeEnv, setConfig } = require('./utils/config');
const { validarEnvFirebase } = require('./utils/firebase');

function coletarErros(env, caminhoConfigJson) {
  const erros = [];
  let config = null;
  try {
    config = lerConfigJson(caminhoConfigJson) || montarConfigDeEnv(env);
  } catch (erro) {
    if (!(erro instanceof ErroConfig)) throw erro;
    erros.push(erro.message);
  }
  try {
    validarEnvFirebase(env);
  } catch (erro) {
    erros.push(erro.message);
  }
  return { config, erros };
}

async function main(env = process.env, { caminhoConfigJson } = {}) {
  try {
    const { config, erros } = coletarErros(env, caminhoConfigJson);
    if (erros.length > 0) {
      console.error(`❌ Não foi possível iniciar o Stocky:\n${erros.map((e) => `  - ${e}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    setConfig(config);
    await index.iniciar();
  } catch (erro) {
    console.error('❌ Falha ao iniciar o Stocky:', erro);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { main };
