const js = require('@eslint/js');
const globals = require('globals');
const n = require('eslint-plugin-n').default;
const security = require('eslint-plugin-security');
const promise = require('eslint-plugin-promise');

module.exports = [
  js.configs.recommended,
  n.configs['flat/recommended-script'],
  security.configs.recommended,
  promise.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'n/no-unpublished-require': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
];
