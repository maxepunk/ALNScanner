// ESLint Flat Config — permissive baseline (eslint:recommended)
//
// Goal: a lint gate that passes TODAY on the existing codebase while still
// catching real errors (syntax issues, obvious mistakes). Rules that the
// current code violates pervasively are downgraded to 'warn' so they surface
// in output without failing CI. Ratchet rules to 'error' over time.

const js = require('@eslint/js');
const globals = require('globals');

// Rules from eslint:recommended that are noisy on the current codebase.
// Keep them visible as warnings; do not fail the lint gate on them yet.
const noisyDowngrades = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-undef': 'warn',
  'no-empty': 'warn',
  'no-prototype-builtins': 'warn',
  'no-useless-escape': 'warn',
  'no-case-declarations': 'warn',
  'no-fallthrough': 'warn',
  'no-async-promise-executor': 'warn',
  'no-control-regex': 'warn',
  'no-cond-assign': 'warn',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-inner-declarations': 'warn',
  'no-redeclare': 'warn',
  'no-import-assign': 'warn',
  'no-dupe-class-members': 'warn',
  'no-unsafe-optional-chaining': 'warn',
  'no-useless-assignment': 'warn',
  'preserve-caught-error': 'warn',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'data/**',
      'index.html.backup',
    ],
  },

  // Application source (ES modules, browser)
  {
    files: ['src/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...noisyDowngrades,
    },
  },

  // Tests, scripts, and config files (Jest + Node)
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js', '*.cjs', 'babel.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...noisyDowngrades,
    },
  },
];
