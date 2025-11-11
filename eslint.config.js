// ESLint Configuration for Refactored Network Layer
// Minimal config focused on Phase 6 refactored components

module.exports = [
  {
    files: [
      'js/network/NetworkedSession.js',
      'js/network/OrchestratorClient.js',
      'js/network/ConnectionManager.js',
      'js/app/AdminController.js'
    ],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        CustomEvent: 'readonly',
        EventTarget: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',

        // Socket.io
        io: 'readonly',

        // Global app classes (injected by index.html)
        OrchestratorClient: 'readonly',
        ConnectionManager: 'readonly',
        NetworkedSession: 'readonly',
        NetworkedQueueManager: 'readonly',
        AdminController: 'readonly',
        AdminModule: 'readonly',

        // Node.js (for Jest tests)
        module: 'readonly',
        require: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      // Code Quality
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': 'off', // Allowed for now (would migrate to logger later)
      'no-debugger': 'error',
      'no-alert': 'error',

      // Best Practices
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true }],

      // Style (minimal)
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'indent': ['error', 2, { SwitchCase: 1 }],

      // ES6+
      'arrow-spacing': 'error',
      'no-duplicate-imports': 'error',
      'prefer-template': 'error'
    }
  }
];
