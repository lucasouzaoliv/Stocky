const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'config.json'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
      'require-await': 'error',
      'no-floating-decimal': 'error',
      eqeqeq: 'error'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node } }
  }
];
