module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/helpers/test-setup.js'],
  setupFilesAfterEnv: ['./tests/helpers/test-hooks.js'],
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80
    }
  },
  // Transform for ES6 modules
  transform: {},
  // Suppress warnings for now
  verbose: true
};
