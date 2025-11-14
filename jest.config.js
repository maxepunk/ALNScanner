module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/helpers/test-setup.js'],
  setupFilesAfterEnv: ['./tests/helpers/test-hooks.js'],

  // Coverage for both old (js/) and new (src/) code
  collectCoverageFrom: [
    'js/**/*.js',
    'src/**/*.js',
    '!js/**/*.test.js',
    '!src/**/*.test.js',
    '!**/node_modules/**'
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80
    }
  },

  // Transform ES6 modules with Babel
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
    }]
  },

  // Path aliases matching Vite config
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@network/(.*)$': '<rootDir>/src/network/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1'
  },

  verbose: true
};
