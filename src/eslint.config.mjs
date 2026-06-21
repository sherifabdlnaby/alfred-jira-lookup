// ESLint flat config (ESLint 9+). Lives in src/ so its plugin imports resolve
// from src/node_modules (the project's deps). hk's eslint step points here via
// `--config src/eslint.config.mjs`. Formatting is owned by Prettier; eslint-config-prettier
// turns off any stylistic rules that would conflict with it.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    // The workflow scripts are CommonJS (require/module.exports).
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Workflow scripts use template fallbacks and intentional unused catch params.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // This config file itself is ESM.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  prettier,
];
