// ESLint Flat Config — eslint:recommended at ERROR.
//
// The former "noisyDowngrades" warn-level block died with the train fix
// vehicle (owner ruling: "pre-existing" is an attribution, not a verdict —
// the backlog was cleaned, not carried). Everything from eslint:recommended
// now fails the gate; the entries below either carry a deliberate option
// or enable rules recommended doesn't include. Deliberate exceptions live
// as line-level eslint-disable comments with a stated reason (the three
// CONTROL_AND_BIDI strips), never as a rule downgrade.

const js = require('@eslint/js');
const globals = require('globals');

const sharedRuleOverrides = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-constant-condition': ['error', { checkLoops: false }],
  // Not in eslint:recommended — enabled deliberately (kept from the old block).
  'no-useless-assignment': 'error',
  'preserve-caught-error': 'error',
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
        io: 'readonly', // socket.io client script tag (index.html)
        NDEFReader: 'readonly', // Web NFC (not yet in the globals lib)
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...sharedRuleOverrides,
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
      ...sharedRuleOverrides,
    },
  },
];
