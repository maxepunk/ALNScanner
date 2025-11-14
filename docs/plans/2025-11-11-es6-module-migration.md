# ES6 Module Migration - ALNScanner Modern Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate ALNScanner from single-file HTML with sequential script tags to modern ES6 modules with build tooling and browser-based E2E testing.

**Architecture:** Replace sequential `<script>` tags with ES6 `import`/`export` modules, add Vite build pipeline for development and production, implement complete event-driven initialization, and validate with Playwright E2E tests in real browsers.

**Tech Stack:**
- **Build Tool**: Vite 5.x (fast, zero-config, optimized for modern browsers)
- **Module System**: ES6 modules (`import`/`export`)
- **Testing**: Playwright (real browser E2E), Jest (unit tests with ES6 support)
- **Deployment**: GitHub Pages (static build artifacts)

**Migration Strategy:** Incremental with rollback points - each phase is independently testable and can be reverted if needed.

---

## Current State Analysis

### Problems Identified

1. **Environment Confusion**: Code uses `global` (Node.js) in browser context
2. **Incomplete Refactor**: Event-driven architecture partially implemented
3. **Test/Production Mismatch**: Tests pass in jsdom but production crashes in real browsers
4. **Initialization Orphans**: Admin modules never initialize (no event wiring)
5. **Legacy Patterns**: Sequential script loading conflicts with modern DI patterns

### Current File Structure

```
ALNScanner/
├── index.html (2287 lines - monolithic)
├── js/
│   ├── app/
│   │   ├── AdminController.js (ES6 class, window export)
│   │   ├── app.js (object literal, global)
│   │   ├── initializationSteps.js (object literal)
│   │   └── sessionModeManager.js (ES6 class, window export)
│   ├── core/
│   │   ├── dataManager.js (ES6 class)
│   │   ├── standaloneDataManager.js (ES6 class)
│   │   └── tokenManager.js (object literal)
│   ├── network/
│   │   ├── ConnectionManager.js (ES6 class, window export)
│   │   ├── NetworkedSession.js (ES6 class, window export)
│   │   ├── OrchestratorClient.js (ES6 class, window export)
│   │   └── networkedQueueManager.js (ES6 class)
│   ├── ui/
│   │   ├── settings.js (object literal)
│   │   └── uiManager.js (object literal)
│   └── utils/
│       ├── adminModule.js (multiple exports)
│       ├── config.js (object literal)
│       ├── debug.js (object literal)
│       └── nfcHandler.js (object literal)
└── tests/ (Jest + jsdom)
```

---

## Target Architecture

### New File Structure

```
ALNScanner/
├── index.html (minimal - just loads bundled app.js)
├── src/                          # ES6 modules
│   ├── main.js                   # Entry point
│   ├── app/
│   │   ├── AdminController.js    # ES6 export (no window)
│   │   ├── App.js                # ES6 class
│   │   ├── InitializationSteps.js
│   │   └── SessionModeManager.js
│   ├── core/
│   ├── network/
│   ├── ui/
│   └── utils/
├── dist/                         # Build output (gitignored)
├── tests/
│   ├── unit/ (Jest with ES6)
│   └── e2e/ (Playwright)
├── vite.config.js
└── playwright.config.js
```

### Key Architectural Changes

1. **Pure ES6 Modules**: All files use `export`/`import`, no `window` assignments
2. **Single Entry Point**: `src/main.js` orchestrates initialization
3. **Event Bus**: Centralized event coordination (no scattered listeners)
4. **Fail-Fast**: Remove defensive `typeof` checks, trust build system
5. **Browser-First**: Remove `global` fallbacks, Node.js compatibility via build config

---

## Migration Phases

### Phase 0: Preparation & Safety (1 hour)
- Create migration branch with safety checkpoints
- Document rollback procedures
- Setup automated backups

### Phase 1: Build Infrastructure (2 hours)
- Install and configure Vite
- Setup development server
- Configure Playwright
- Verify baseline works

### Phase 2: Module Conversion - Utilities (2 hours)
- Convert utility modules to ES6
- Update tests
- Verify in isolation

### Phase 3: Module Conversion - Core & UI (2 hours)
- Convert core and UI modules
- Update tests
- Verify in isolation

### Phase 4: Module Conversion - Network Layer (3 hours)
- Convert network modules to ES6
- Fix `global` vs `window` issues permanently
- Update tests
- Verify network stack works

### Phase 5: Module Conversion - App Layer (3 hours)
- Convert app-level modules
- Wire event-driven initialization properly
- Fix admin module initialization
- Update tests

### Phase 6: Entry Point & HTML (2 hours)
- Create src/main.js entry point
- Simplify index.html to minimal loader
- Configure Vite build
- Test development mode

### Phase 7: E2E Testing with Playwright (3 hours)
- Port existing E2E scenarios to Playwright
- Add browser integration tests
- Validate networked mode flow
- Test admin panel initialization

### Phase 8: Production Build & Deployment (2 hours)
- Configure production build
- Optimize bundle
- Setup GitHub Pages deployment
- Deploy and smoke test

### Phase 9: Cleanup & Documentation (1 hour)
- Remove deprecated code
- Update CLAUDE.md
- Update README
- Final verification

**Total Estimated Time: 21 hours (2.5 days)**

---

## Phase 0: Preparation & Safety

### Task 0.1: Create Migration Branch

**Files:**
- Create branch: `feature/es6-module-migration`

**Step 1: Create git worktree for isolation**

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
git worktree add ../ALNScanner-es6-migration -b feature/es6-module-migration
cd ../ALNScanner-es6-migration
```

**Step 2: Verify clean working directory**

```bash
git status
```

Expected: "On branch feature/es6-module-migration, nothing to commit"

**Step 3: Create checkpoint tag**

```bash
git tag pre-es6-migration
git push origin pre-es6-migration
```

**Step 4: Document rollback procedure**

Create file: `docs/plans/ROLLBACK.md`

```markdown
# Rollback Procedure

## If migration fails at any point:

### Option 1: Revert to checkpoint
```bash
git reset --hard pre-es6-migration
git push origin feature/es6-module-migration --force
```

### Option 2: Delete branch and start over
```bash
git checkout main
git branch -D feature/es6-module-migration
git worktree remove ../ALNScanner-es6-migration
```

### Option 3: Cherry-pick successful tasks
```bash
git checkout main
git cherry-pick <successful-commit-hash>
```
```

**Step 5: Commit**

```bash
git add docs/plans/ROLLBACK.md
git commit -m "docs: add rollback procedure for ES6 migration"
```

---

### Task 0.2: Baseline Test Verification

**Files:**
- Run existing tests to establish baseline

**Step 1: Run Jest unit tests**

```bash
npm test
```

Expected: "116+ tests passing" (current baseline)

**Step 2: Document baseline test results**

```bash
npm test 2>&1 | tee docs/plans/baseline-tests.log
```

**Step 3: Check for test warnings or deprecations**

Review `baseline-tests.log` for:
- Deprecated APIs
- Flaky tests
- Tests that depend on `global`

**Step 4: Run backend contract tests**

```bash
cd ../../backend
npm run test:contract
cd ../ALNScanner-es6-migration
```

Expected: "141 tests passing"

**Step 5: Manual smoke test**

1. Open `index.html` in browser (via http-server)
2. Click "Networked Mode" - expect current error
3. Document exact error message

**Step 6: Commit baseline documentation**

```bash
git add docs/plans/baseline-tests.log
git commit -m "docs: capture baseline test results before migration"
```

---

## Phase 1: Build Infrastructure

### Task 1.1: Install Vite

**Files:**
- Create: `package.json`
- Create: `vite.config.js`

**Step 1: Initialize package.json if not exists**

```bash
# Check if package.json exists
if [ ! -f package.json ]; then
  npm init -y
fi
```

**Step 2: Install Vite and dependencies**

```bash
npm install --save-dev vite@^5.0.0
npm install --save-dev @vitejs/plugin-legacy
npm install --save-dev vite-plugin-html
```

**Step 3: Create vite.config.js**

```javascript
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  root: './', // Project root is current directory
  publicDir: 'public', // Static assets (images, tokens, etc.)

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,

    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },

  server: {
    port: 8443,
    https: {
      key: './key.pem',
      cert: './cert.pem'
    },
    open: true
  },

  plugins: [
    // Support older browsers (optional, can remove if targeting modern only)
    legacy({
      targets: ['defaults', 'not IE 11']
    }),

    // HTML processing
    createHtmlPlugin({
      minify: true
    })
  ],

  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
      '@app': '/src/app',
      '@core': '/src/core',
      '@network': '/src/network',
      '@ui': '/src/ui',
      '@utils': '/src/utils'
    }
  }
});
```

**Step 4: Update package.json scripts**

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "jest",
    "test:e2e": "playwright test",
    "test:all": "npm test && npm run test:e2e"
  }
}
```

**Step 5: Verify Vite installation**

```bash
npx vite --version
```

Expected: "vite/5.x.x"

**Step 6: Commit**

```bash
git add package.json vite.config.js
git commit -m "build: add Vite build infrastructure"
```

---

### Task 1.2: Install Playwright

**Files:**
- Create: `playwright.config.js`
- Create: `tests/e2e/` directory structure

**Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test@latest
```

**Step 2: Install browser binaries**

```bash
npx playwright install chromium firefox
```

**Step 3: Create Playwright configuration**

Create file: `playwright.config.js`

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  // Timeout for each test
  timeout: 30000,

  // Run tests in parallel
  fullyParallel: true,

  // Fail on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI
  retries: process.env.CI ? 2 : 0,

  // Workers (parallel execution)
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Shared settings
  use: {
    // Base URL for tests - Vite dev server
    baseURL: 'https://localhost:8443',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Trace on failure
    trace: 'retain-on-failure',

    // Accept self-signed certs (for local HTTPS)
    ignoreHTTPSErrors: true,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    port: 8443,
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
  },
});
```

**Step 4: Create E2E test directory structure**

```bash
mkdir -p tests/e2e/specs
mkdir -p tests/e2e/helpers
mkdir -p tests/e2e/fixtures
```

**Step 5: Create baseline E2E test**

Create file: `tests/e2e/specs/00-baseline.spec.js`

```javascript
import { test, expect } from '@playwright/test';

test.describe('Baseline - Current Architecture', () => {
  test('should load index.html', async ({ page }) => {
    await page.goto('/');

    // Wait for loading screen to disappear
    await page.waitForSelector('#loadingScreen.active', { state: 'detached', timeout: 5000 });

    // Verify game mode screen appears
    const gameModeScreen = await page.locator('#gameModeScreen.active');
    await expect(gameModeScreen).toBeVisible();
  });

  test('should have all script tags loaded', async ({ page }) => {
    await page.goto('/');

    // Check that classes are available globally
    const classesAvailable = await page.evaluate(() => {
      return {
        App: typeof window.App !== 'undefined',
        UIManager: typeof window.UIManager !== 'undefined',
        TokenManager: typeof window.TokenManager !== 'undefined',
        Settings: typeof window.Settings !== 'undefined',
      };
    });

    expect(classesAvailable.App).toBe(true);
    expect(classesAvailable.UIManager).toBe(true);
    expect(classesAvailable.TokenManager).toBe(true);
    expect(classesAvailable.Settings).toBe(true);
  });

  test.skip('should handle networked mode selection', async ({ page }) => {
    // SKIP: Currently broken - will fix during migration
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen.active');

    await page.click('#selectNetworkedMode');

    // This currently crashes - will verify fix later
  });
});
```

**Step 6: Run baseline E2E test**

```bash
npx playwright test tests/e2e/specs/00-baseline.spec.js
```

Expected: 2 tests pass, 1 skipped

**Step 7: Commit**

```bash
git add playwright.config.js tests/e2e/
git commit -m "test: add Playwright E2E test infrastructure with baseline tests"
```

---

### Task 1.3: Setup Development Server

**Files:**
- Modify: `package.json`
- Create: `.gitignore` updates

**Step 1: Update .gitignore**

Add to `.gitignore`:

```
# Build outputs
dist/
.vite/

# Playwright
playwright-report/
test-results/

# Node modules
node_modules/

# Environment files
.env.local
.env.*.local
```

**Step 2: Test Vite dev server**

```bash
npm run dev
```

Expected:
- Server starts on https://localhost:8443
- Browser opens automatically
- Current (broken) app loads

**Step 3: Verify hot reload works**

1. Keep dev server running
2. Edit `js/utils/config.js` - change a constant
3. Save file
4. Verify browser reloads automatically

**Step 4: Stop dev server and commit**

```bash
# Ctrl+C to stop
git add .gitignore
git commit -m "build: configure development environment with hot reload"
```

---

## Phase 2: Module Conversion - Utilities

### Task 2.1: Create src/ Directory Structure

**Files:**
- Create: `src/` directory tree
- Move: No files moved yet (will happen in later tasks)

**Step 1: Create src directory structure**

```bash
mkdir -p src/app
mkdir -p src/core
mkdir -p src/network
mkdir -p src/ui
mkdir -p src/utils
```

**Step 2: Create placeholder main.js**

Create file: `src/main.js`

```javascript
/**
 * ALNScanner - Main Entry Point
 * ES6 Module Architecture
 *
 * This file will orchestrate the application initialization
 * once all modules are converted.
 */

console.log('ALNScanner ES6 - Module entry point loaded');

// TODO: Import and initialize app
```

**Step 3: Verify structure**

```bash
tree src/
```

Expected:
```
src/
├── app/
├── core/
├── main.js
├── network/
├── ui/
└── utils/
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: create ES6 module directory structure"
```

---

### Task 2.2: Convert config.js to ES6 Module

**Files:**
- Copy: `js/utils/config.js` → `src/utils/config.js`
- Modify: `src/utils/config.js` (convert to ES6 export)
- Create: `tests/unit/utils/config.test.js` (updated test)

**Step 1: Copy existing file to src/**

```bash
cp js/utils/config.js src/utils/config.js
```

**Step 2: Convert to ES6 module**

Edit `src/utils/config.js`:

```javascript
/**
 * Application Configuration Constants
 * ES6 Module Export
 */

export const CONFIG = {
    MAX_TEAM_ID_LENGTH: 6,
    MODE_TOGGLE_SCALE: 1.1,
    ANIMATION_DURATION: 200,

    // Storage keys
    STORAGE_KEY_TRANSACTIONS: 'transactions',
    STORAGE_KEY_MODE: 'gameSessionMode',
    STORAGE_KEY_SETTINGS: 'aln_settings',

    // Network configuration
    DEFAULT_ORCHESTRATOR_URL: 'https://localhost:3000',
    CONNECTION_TIMEOUT: 5000,
    RETRY_DELAY: 1000,
    MAX_RETRIES: 5,

    // NFC configuration
    NFC_TIMEOUT: 10000,

    // UI configuration
    TOAST_DURATION: 3000,
    ERROR_DISPLAY_DURATION: 5000,
};

// Export as default as well for convenience
export default CONFIG;
```

**Step 3: Create test for ES6 module**

Create file: `tests/unit/utils/config.test.js`

```javascript
import { describe, it, expect } from '@jest/globals';
import CONFIG from '../../../src/utils/config.js';

describe('CONFIG - ES6 Module', () => {
  it('should export CONFIG object', () => {
    expect(CONFIG).toBeDefined();
    expect(typeof CONFIG).toBe('object');
  });

  it('should have MAX_TEAM_ID_LENGTH', () => {
    expect(CONFIG.MAX_TEAM_ID_LENGTH).toBe(6);
  });

  it('should have network configuration', () => {
    expect(CONFIG.DEFAULT_ORCHESTRATOR_URL).toBeDefined();
    expect(CONFIG.CONNECTION_TIMEOUT).toBeDefined();
    expect(CONFIG.MAX_RETRIES).toBeDefined();
  });

  it('should have storage keys', () => {
    expect(CONFIG.STORAGE_KEY_TRANSACTIONS).toBe('transactions');
    expect(CONFIG.STORAGE_KEY_MODE).toBe('gameSessionMode');
  });
});
```

**Step 4: Update Jest configuration for ES6**

Edit `jest.config.js`:

```javascript
export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@network/(.*)$': '<rootDir>/src/network/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  collectCoverageFrom: ['src/**/*.js'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80
    }
  }
};
```

**Step 5: Install Babel for Jest ES6 support**

```bash
npm install --save-dev @babel/core @babel/preset-env babel-jest
```

**Step 6: Run test to verify ES6 module import works**

```bash
npm test -- config.test.js
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add src/utils/config.js tests/unit/utils/config.test.js jest.config.js
git commit -m "refactor(utils): convert config.js to ES6 module with tests"
```

---

### Task 2.3: Convert debug.js to ES6 Module

**Files:**
- Copy: `js/utils/debug.js` → `src/utils/debug.js`
- Modify: `src/utils/debug.js`
- Create: `tests/unit/utils/debug.test.js`

**Step 1: Copy and convert to ES6**

```bash
cp js/utils/debug.js src/utils/debug.js
```

Edit `src/utils/debug.js`:

```javascript
/**
 * Debug Logging System
 * ES6 Module Export
 */

class DebugLogger {
  constructor() {
    this.debugEnabled = localStorage.getItem('debugMode') === 'true';
    this.logs = [];
    this.maxLogs = 100;
  }

  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, message, isError };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.debugEnabled) {
      if (isError) {
        console.error(`[${timestamp}]`, message);
      } else {
        console.log(`[${timestamp}]`, message);
      }
    }

    this._updateDebugPanel();
  }

  enable() {
    this.debugEnabled = true;
    localStorage.setItem('debugMode', 'true');
    console.log('Debug mode enabled');
  }

  disable() {
    this.debugEnabled = false;
    localStorage.setItem('debugMode', 'false');
  }

  clear() {
    this.logs = [];
    this._updateDebugPanel();
  }

  _updateDebugPanel() {
    const panel = document.getElementById('debugContent');
    if (panel) {
      panel.textContent = this.logs
        .map(log => `[${log.timestamp}] ${log.message}`)
        .join('\n');
    }
  }
}

// Create singleton instance
const Debug = new DebugLogger();

export default Debug;
export { DebugLogger };
```

**Step 2: Create test**

Create file: `tests/unit/utils/debug.test.js`

```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';
import Debug, { DebugLogger } from '../../../src/utils/debug.js';

describe('Debug - ES6 Module', () => {
  beforeEach(() => {
    Debug.clear();
    Debug.disable();
  });

  it('should export Debug singleton', () => {
    expect(Debug).toBeDefined();
    expect(Debug).toBeInstanceOf(DebugLogger);
  });

  it('should log messages', () => {
    Debug.log('Test message');
    expect(Debug.logs).toHaveLength(1);
    expect(Debug.logs[0].message).toBe('Test message');
  });

  it('should respect max logs limit', () => {
    Debug.maxLogs = 3;

    Debug.log('Message 1');
    Debug.log('Message 2');
    Debug.log('Message 3');
    Debug.log('Message 4');

    expect(Debug.logs).toHaveLength(3);
    expect(Debug.logs[0].message).toBe('Message 2');
  });

  it('should enable/disable debug mode', () => {
    expect(Debug.debugEnabled).toBe(false);

    Debug.enable();
    expect(Debug.debugEnabled).toBe(true);

    Debug.disable();
    expect(Debug.debugEnabled).toBe(false);
  });
});
```

**Step 3: Run tests**

```bash
npm test -- debug.test.js
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add src/utils/debug.js tests/unit/utils/debug.test.js
git commit -m "refactor(utils): convert debug.js to ES6 module with tests"
```

---

### Task 2.4: Convert Remaining Utils (nfcHandler, adminModule)

**Note**: Following same pattern as Tasks 2.2 and 2.3. I'll provide abbreviated instructions for brevity.

**Files to convert**:
- `js/utils/nfcHandler.js` → `src/utils/nfcHandler.js`
- `js/utils/adminModule.js` → `src/utils/adminModule.js`

**Pattern for each**:
1. Copy file to `src/utils/`
2. Convert to ES6 `export`
3. Remove `window.XXX =` assignments
4. Create test file
5. Run test
6. Commit individually

**Step 1: Convert nfcHandler.js**

```bash
cp js/utils/nfcHandler.js src/utils/nfcHandler.js
```

Edit to add at end:

```javascript
export default NFCHandler;
export { NFCHandler };
```

Test, commit:

```bash
git add src/utils/nfcHandler.js
git commit -m "refactor(utils): convert nfcHandler.js to ES6 module"
```

**Step 2: Convert adminModule.js**

This file exports multiple classes. Convert each to named export:

```javascript
export class SessionManager { /* ... */ }
export class VideoController { /* ... */ }
export class SystemMonitor { /* ... */ }
export class AdminOperations { /* ... */ }
export class MonitoringDisplay { /* ... */ }
```

Test, commit:

```bash
git add src/utils/adminModule.js
git commit -m "refactor(utils): convert adminModule.js to ES6 module with named exports"
```

---

## Phase 3: Module Conversion - Core & UI

### Task 3.1: Convert TokenManager to ES6

**Files:**
- Copy: `js/core/tokenManager.js` → `src/core/tokenManager.js`
- Modify: Convert to ES6 class export

**Step 1: Copy and convert**

```bash
cp js/core/tokenManager.js src/core/tokenManager.js
```

Edit `src/core/tokenManager.js`:

```javascript
/**
 * Token Database Manager
 * ES6 Module Export
 */

class TokenManager {
  constructor() {
    this.database = {};
    this.loaded = false;
  }

  async loadTokenDatabase() {
    // Existing implementation...
  }

  findToken(rfid) {
    // Existing implementation...
  }

  // ... other methods
}

// Create singleton
const tokenManager = new TokenManager();

export default tokenManager;
export { TokenManager };
```

**Step 2: Create test**

Create file: `tests/unit/core/tokenManager.test.js`

**Step 3: Run test and commit**

```bash
npm test -- tokenManager.test.js
git add src/core/tokenManager.js tests/unit/core/tokenManager.test.js
git commit -m "refactor(core): convert TokenManager to ES6 module"
```

---

### Task 3.2: Convert DataManager to ES6

**Files:**
- Copy: `js/core/dataManager.js` → `src/core/dataManager.js`
- Modify: Convert to ES6 class export

**Pattern**: Same as Task 3.1

1. Copy to `src/core/`
2. Convert to ES6 export
3. Create test
4. Commit

```bash
git commit -m "refactor(core): convert DataManager to ES6 module"
```

---

### Task 3.3: Convert UI Modules (UIManager, Settings)

**Files:**
- `js/ui/uiManager.js` → `src/ui/uiManager.js`
- `js/ui/settings.js` → `src/ui/settings.js`

**Pattern**: Same as previous tasks

1. Copy each to `src/ui/`
2. Convert to ES6 exports
3. Create tests
4. Commit individually

```bash
git commit -m "refactor(ui): convert UIManager and Settings to ES6 modules"
```

---

## Phase 4: Module Conversion - Network Layer

### Task 4.1: Fix OrchestratorClient - Remove global Fallback

**Files:**
- Copy: `js/network/OrchestratorClient.js` → `src/network/OrchestratorClient.js`
- Modify: Remove `global` fallback, pure ES6

**Step 1: Copy file**

```bash
cp js/network/OrchestratorClient.js src/network/OrchestratorClient.js
```

**Step 2: Convert to pure ES6 module**

Edit `src/network/OrchestratorClient.js`:

```javascript
/**
 * OrchestratorClient - WebSocket Communication Layer
 * ES6 Module - Browser Only
 *
 * Responsibilities:
 * - Socket.io connection management
 * - Message send/receive
 * - Event forwarding
 */

export class OrchestratorClient extends EventTarget {
  constructor(config) {
    super();
    this.url = config.url;
    this.deviceId = config.deviceId;
    this.socket = null;
    this.isConnected = false;
  }

  // ... rest of implementation (unchanged)
}

// Default export for convenience
export default OrchestratorClient;
```

**Key Changes**:
- Add `export` keyword to class
- Remove `if (typeof module !== 'undefined')` block
- Remove `window.OrchestratorClient = ` assignment
- Pure browser code

**Step 3: Update tests to use ES6 import**

Edit `tests/unit/network/OrchestratorClient.test.js`:

```javascript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import OrchestratorClient from '../../../src/network/OrchestratorClient.js';

// ... rest of tests unchanged
```

**Step 4: Run tests**

```bash
npm test -- OrchestratorClient.test.js
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/network/OrchestratorClient.js tests/unit/network/OrchestratorClient.test.js
git commit -m "refactor(network): convert OrchestratorClient to pure ES6 module"
```

---

### Task 4.2: Fix ConnectionManager - Remove global Fallback

**Files:**
- Copy: `js/network/ConnectionManager.js` → `src/network/ConnectionManager.js`
- Modify: Remove `global` fallback, add proper imports

**Step 1: Copy and convert**

```bash
cp js/network/ConnectionManager.js src/network/ConnectionManager.js
```

**Step 2: Add ES6 imports and exports**

Edit `src/network/ConnectionManager.js`:

```javascript
/**
 * ConnectionManager - Connection Lifecycle Management
 * ES6 Module - Browser Only
 */

import OrchestratorClient from './OrchestratorClient.js';

export class ConnectionManager extends EventTarget {
  constructor(config) {
    super();
    this.url = config.url;
    this.deviceId = config.deviceId;
    this.token = config.token;
    this.client = config.client; // OrchestratorClient instance

    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryTimer = null;
  }

  // ... rest of implementation (unchanged)
}

export default ConnectionManager;
```

**Step 3: Update tests**

```bash
npm test -- ConnectionManager.test.js
```

**Step 4: Commit**

```bash
git add src/network/ConnectionManager.js tests/unit/network/ConnectionManager.test.js
git commit -m "refactor(network): convert ConnectionManager to pure ES6 module"
```

---

### Task 4.3: Fix NetworkedSession - Remove global, Add Imports

**Files:**
- Copy: `js/network/NetworkedSession.js` → `src/network/NetworkedSession.js`
- Modify: **THIS IS THE CRITICAL FIX for the `global is not defined` bug**

**Step 1: Copy file**

```bash
cp js/network/NetworkedSession.js src/network/NetworkedSession.js
```

**Step 2: Add ES6 imports at top**

Edit `src/network/NetworkedSession.js`:

```javascript
/**
 * NetworkedSession - Service Factory and Lifecycle Orchestrator
 * ES6 Module - Browser Only
 */

// Import dependencies
import OrchestratorClient from './OrchestratorClient.js';
import ConnectionManager from './ConnectionManager.js';
import NetworkedQueueManager from './networkedQueueManager.js';
import AdminController from '../app/AdminController.js';

export class NetworkedSession extends EventTarget {
  constructor(config) {
    super();
    this.config = config;
    this.services = null;
    this.state = 'disconnected';
  }

  // ... (other methods unchanged)

  /**
   * Create all services in correct order
   * @private
   */
  _createServices() {
    // ✅ FIXED: No more typeof checks, no more global fallback
    // Trust that imports work (fail-fast if they don't)

    this.services = {};

    // 1. OrchestratorClient (no dependencies)
    this.services.client = new OrchestratorClient({
      url: this.config.url,
      deviceId: this.config.deviceId
    });

    // 2. ConnectionManager (depends on client)
    this.services.connectionManager = new ConnectionManager({
      url: this.config.url,
      deviceId: this.config.deviceId,
      token: this.config.token,
      client: this.services.client
    });

    // 3. NetworkedQueueManager (depends on client)
    this.services.queueManager = new NetworkedQueueManager(this.services.client);

    // 4. AdminController (depends on client)
    this.services.adminController = new AdminController(this.services.client);
  }

  // ... (rest unchanged)
}

export default NetworkedSession;
```

**Key Changes**:
- Add imports at top
- Remove lines 125-128 (the buggy `global` fallback code)
- Use imported classes directly (no `typeof` checks)
- Pure ES6 module pattern

**Step 3: Update tests**

```bash
npm test -- NetworkedSession.test.js
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add src/network/NetworkedSession.js tests/unit/network/NetworkedSession.test.js
git commit -m "fix(network): remove global fallback, use ES6 imports in NetworkedSession

BREAKING CHANGE: NetworkedSession now requires ES6 module environment.
Fixes 'global is not defined' error when clicking Networked Mode button.

This eliminates the root cause identified in manual E2E testing where
the code attempted to access global.OrchestratorClient in browser context.
Now uses proper ES6 imports that are validated at build time."
```

---

### Task 4.4: Convert NetworkedQueueManager

**Files:**
- Copy: `js/network/networkedQueueManager.js` → `src/network/networkedQueueManager.js`

**Pattern**: Same as previous network modules

```bash
git commit -m "refactor(network): convert NetworkedQueueManager to ES6 module"
```

---

## Phase 5: Module Conversion - App Layer

### Task 5.1: Convert AdminController

**Files:**
- Copy: `js/app/AdminController.js` → `src/app/AdminController.js`
- Modify: Add imports for admin modules

**Step 1: Copy and convert**

```bash
cp js/app/AdminController.js src/app/AdminController.js
```

**Step 2: Add imports**

Edit `src/app/AdminController.js`:

```javascript
/**
 * AdminController - Admin Module Lifecycle Management
 * ES6 Module
 */

import {
  SessionManager,
  VideoController,
  SystemMonitor,
  AdminOperations,
  MonitoringDisplay
} from '../utils/adminModule.js';

export class AdminController extends EventTarget {
  constructor(client) {
    super();
    this.client = client;
    this.modules = null;
    this.initialized = false;
  }

  initialize() {
    // Re-initialization guard
    if (this.initialized) {
      console.warn('AdminController already initialized');
      return;
    }

    // Create admin modules
    this.modules = {
      sessionManager: new SessionManager(this.client),
      videoController: new VideoController(this.client),
      systemMonitor: new SystemMonitor(this.client),
      adminOperations: new AdminOperations(this.client),
      monitoringDisplay: new MonitoringDisplay()
    };

    this.initialized = true;
    console.log('AdminController initialized');

    this.dispatchEvent(new CustomEvent('initialized'));
  }

  // ... rest of implementation
}

export default AdminController;
```

**Step 3: Test and commit**

```bash
npm test -- AdminController.test.js
git commit -m "refactor(app): convert AdminController to ES6 module with imports"
```

---

### Task 5.2: Convert SessionModeManager

**Files:**
- Copy: `js/app/sessionModeManager.js` → `src/app/SessionModeManager.js`
- Modify: Add imports

**Step 1: Copy and convert**

```bash
cp js/app/sessionModeManager.js src/app/SessionModeManager.js
```

**Step 2: Add imports and export**

Edit `src/app/SessionModeManager.js`:

```javascript
/**
 * SessionModeManager - Game Mode Selection and Lifecycle
 * ES6 Module
 */

import NetworkedSession from '../network/NetworkedSession.js';
import Debug from '../utils/debug.js';

export class SessionModeManager {
  constructor() {
    this.mode = null; // 'networked' | 'standalone' | null
    this.locked = false;
  }

  // ... rest of implementation unchanged
}

export default SessionModeManager;
```

**Step 3: Test and commit**

```bash
npm test -- SessionModeManager.test.js
git commit -m "refactor(app): convert SessionModeManager to ES6 module"
```

---

### Task 5.3: Convert InitializationSteps

**Files:**
- Copy: `js/app/initializationSteps.js` → `src/app/initializationSteps.js`

**Step 1: Convert to ES6**

```javascript
/**
 * Initialization Steps - Application Bootstrap Sequence
 * ES6 Module
 */

import Debug from '../utils/debug.js';
import UIManager from '../ui/uiManager.js';

export const InitializationSteps = {
  // ... existing implementation
};

export default InitializationSteps;
```

**Step 2: Test and commit**

```bash
git commit -m "refactor(app): convert InitializationSteps to ES6 module"
```

---

### Task 5.4: Convert App.js - Main Application

**Files:**
- Copy: `js/app/app.js` → `src/app/App.js`
- Modify: Convert to ES6 class, add imports, **fix admin initialization**

**Step 1: Copy file**

```bash
cp js/app/app.js src/app/App.js
```

**Step 2: Convert to ES6 class with imports**

Edit `src/app/App.js`:

```javascript
/**
 * App - Main Application Controller
 * ES6 Module
 */

import Debug from '../utils/debug.js';
import UIManager from '../ui/uiManager.js';
import Settings from '../ui/settings.js';
import TokenManager from '../core/tokenManager.js';
import DataManager from '../core/dataManager.js';
import NFCHandler from '../utils/nfcHandler.js';
import CONFIG from '../utils/config.js';
import InitializationSteps from './initializationSteps.js';
import SessionModeManager from './SessionModeManager.js';

export class App {
  constructor() {
    this.currentTeamId = '';
    this.nfcSupported = false;
    this.viewController = this._createViewController();
  }

  async init() {
    Debug.log('App initializing...');

    // Initialize UI (Phase 1D)
    InitializationSteps.initializeUIManager(UIManager);

    // Show loading screen (Phase 0)
    await InitializationSteps.showLoadingScreen(UIManager);

    // CRITICAL: Initialize SessionModeManager BEFORE viewController (Phase 1E)
    InitializationSteps.createSessionModeManager(SessionModeManager, window);

    // Initialize view controller (Phase 1F)
    InitializationSteps.initializeViewController(this.viewController);

    // ... rest of initialization steps

    // Wire event listeners for networked session
    this._wireNetworkedSessionEvents();
  }

  /**
   * Wire event listeners for NetworkedSession lifecycle
   * @private
   */
  _wireNetworkedSessionEvents() {
    // Listen for session:ready from NetworkedSession
    window.addEventListener('session:ready', () => {
      Debug.log('NetworkedSession ready - initializing admin modules');

      // Initialize admin modules when session is ready
      if (this.viewController) {
        this.viewController.initAdminModules();
      }
    });

    // Listen for auth:required from NetworkedSession
    window.addEventListener('auth:required', () => {
      Debug.log('Authentication required - showing connection wizard');
      if (typeof showConnectionWizard === 'function') {
        showConnectionWizard();
      }
    });
  }

  /**
   * Create view controller
   * @private
   */
  _createViewController() {
    return {
      currentView: 'scanner',
      views: ['scanner', 'admin', 'debug'],
      adminInstances: null,

      init() {
        if (window.sessionModeManager?.isNetworked()) {
          document.getElementById('viewSelector').style.display = 'flex';
        }
      },

      switchView(viewName) {
        if (!this.views.includes(viewName)) {
          console.error('Invalid view:', viewName);
          UIManager.showError(`Invalid view: ${viewName}`);
          return;
        }

        // Hide all views
        document.querySelectorAll('.view-content').forEach(view => {
          view.style.display = 'none';
        });

        // Show selected view
        const selectedView = document.getElementById(`${viewName}-view`);
        if (selectedView) {
          selectedView.style.display = 'block';
        }

        // Update tab highlighting
        document.querySelectorAll('.view-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-view="${viewName}"]`);
        if (activeTab) {
          activeTab.classList.add('active');
        }

        this.currentView = viewName;

        // ✅ FIXED: Initialize admin modules if switching to admin view
        if (viewName === 'admin') {
          // Initialize if not already done
          if (!this.adminInstances) {
            this.initAdminModules();
          }

          // Refresh admin panel
          if (this.adminInstances) {
            this.adminInstances.systemMonitor.refresh();
            this.fetchCurrentSession();
          }

          // Update admin panel displays
          if (typeof App !== 'undefined') {
            App.updateAdminPanel();
          }
        }
      },

      initAdminModules() {
        // Only initialize in networked mode
        if (!window.sessionModeManager?.isNetworked()) {
          Debug.log('Admin modules only available in networked mode');
          return;
        }

        if (!window.networkedSession) {
          console.error('NetworkedSession not initialized');
          UIManager.showError('Network session not available. Check connection.');
          return;
        }

        // Get AdminController from NetworkedSession
        const adminController = window.networkedSession.getService('adminController');

        // Initialize if not already done (safe to call multiple times)
        if (!adminController.initialized) {
          Debug.log('Initializing admin modules via AdminController...');
          adminController.initialize();
        }

        // Store references to individual modules
        this.adminInstances = {
          sessionManager: adminController.getModule('sessionManager'),
          videoController: adminController.getModule('videoController'),
          systemMonitor: adminController.getModule('systemMonitor'),
          adminOps: adminController.getModule('adminOperations'),
          monitoring: adminController.getModule('monitoringDisplay')
        };

        Debug.log('Admin modules referenced from AdminController');
      },

      // ... rest of viewController methods
    };
  }

  // ... rest of App methods (team entry, NFC, etc.)
}

// Create singleton instance
const app = new App();

export default app;
export { App };
```

**Key Changes**:
1. Convert from object literal to ES6 class
2. Add all necessary imports
3. Add `_wireNetworkedSessionEvents()` method to listen for `session:ready`
4. Fix `switchView()` to call `initAdminModules()` when switching to admin view
5. Export both class and singleton instance

**Step 3: Test and commit**

```bash
npm test -- App.test.js
git commit -m "refactor(app): convert App to ES6 class with event-driven admin init

FIXES: Admin modules now initialize properly via session:ready event
and when switching to admin view. This completes the event-driven
architecture refactor started in Phase 4."
```

---

## Phase 6: Entry Point & HTML

### Task 6.1: Create Main Entry Point

**Files:**
- Modify: `src/main.js` (complete implementation)

**Step 1: Implement main.js**

Edit `src/main.js`:

```javascript
/**
 * ALNScanner - Main Entry Point
 * ES6 Module Architecture
 *
 * This file orchestrates application initialization in the new
 * ES6 module architecture with Vite build system.
 */

// Import core dependencies
import './utils/config.js'; // CONFIG constants
import Debug from './utils/debug.js';
import app from './app/App.js';

// Import and expose on window for HTML onclick handlers
// (Will be removed once we convert to proper event listeners)
window.App = app;

// Import other globals needed by HTML
import UIManager from './ui/uiManager.js';
import Settings from './ui/settings.js';
import TokenManager from './core/tokenManager.js';
import DataManager from './core/dataManager.js';

window.UIManager = UIManager;
window.Settings = Settings;
window.TokenManager = TokenManager;
window.DataManager = DataManager;

// Expose connection wizard function (defined in HTML script block)
// This is temporary - will be refactored to module in later phase
// window.showConnectionWizard is defined in index.html

/**
 * Initialize application
 */
async function initializeApp() {
  Debug.log('=== ALNScanner ES6 Module Architecture ===');
  Debug.log('Initializing application...');

  try {
    await app.init();
    Debug.log('Application initialization complete');
  } catch (error) {
    Debug.log(`Initialization error: ${error.message}`, true);
    console.error('App initialization failed:', error);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded
  initializeApp();
}

// Export app for debugging in console
export default app;
```

**Step 2: Test main.js loads without errors**

```bash
npm run dev
```

Open browser console, check for:
- "ALNScanner ES6 Module Architecture" log
- No module loading errors

**Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: implement main.js entry point with ES6 module orchestration"
```

---

### Task 6.2: Simplify index.html to Module Loader

**Files:**
- Modify: `index.html` (major restructure)

**Step 1: Backup current index.html**

```bash
cp index.html index.html.backup
git add index.html.backup
git commit -m "backup: save original index.html before ES6 module migration"
```

**Step 2: Replace script loading section**

Edit `index.html` - find the script section (lines ~1956-1982) and replace with:

```html
<!-- ============================================
     ES6 MODULE ENTRY POINT
     Vite handles all module loading
     ============================================ -->
<script type="module" src="/src/main.js"></script>
```

**Step 3: Remove individual script tags**

Delete these sections from index.html:
- Lines 1957-1981 (all the individual `<script src="js/..."` tags)

Keep:
- All CSS (inline styles)
- All HTML structure
- Socket.io script tag (still needed for WebSocket)
- Connection wizard functions (will refactor later)

**Step 4: Update HTML comment**

At top of file, update:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Memory Transaction Station</title>

    <!-- ============================================
         ES6 MODULE ARCHITECTURE
         Built with Vite - See src/main.js
         ============================================ -->
```

**Step 5: Test with Vite dev server**

```bash
npm run dev
```

Open browser:
1. Should load without errors
2. Game mode selection should appear
3. Check console for module loads

**Step 6: Update beforeunload handler**

Find line 2230 and replace:

```javascript
// OLD:
if (window.connectionManager?.orchestratorClient?.socket) {
    window.connectionManager.orchestratorClient.disconnect();
}

// NEW:
if (window.networkedSession?.services?.client) {
    window.networkedSession.services.client.disconnect();
}
```

**Step 7: Commit**

```bash
git add index.html
git commit -m "refactor: convert index.html to ES6 module loader with Vite

BREAKING CHANGE: index.html now loads a single ES6 module entry point
instead of 20+ individual script tags. Vite handles all module bundling.

- Removed individual script tags
- Added single module script: src/main.js
- Updated beforeunload handler to use new architecture
- Reduced index.html from 2287 to ~2100 lines

This completes the migration to modern ES6 module architecture."
```

---

### Task 6.3: Verify Development Mode Works

**Files:**
- None (testing task)

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test basic functionality**

Open browser (https://localhost:8443):

1. ✅ Page loads without errors
2. ✅ Game mode selection screen appears
3. ✅ Can click "Standalone Mode" → proceeds to team entry
4. ✅ Console shows ES6 module logs

**Step 3: Test networked mode (the fix!)**

1. Reload page
2. Click "Networked Mode" button
3. **CRITICAL TEST**: Should NOT crash with "global is not defined"
4. Connection wizard should appear
5. Console should show NetworkedSession initialization

**Expected Result**: No errors! (This is the fix for your original issue)

**Step 4: Test hot reload**

1. Keep browser open
2. Edit `src/utils/config.js` - change a value
3. Save file
4. Browser should auto-reload
5. Verify change appears

**Step 5: Document test results**

Create file: `docs/plans/es6-migration-test-results.md`

```markdown
# ES6 Migration Test Results

## Development Mode Tests

**Date**: [Current Date]
**Branch**: feature/es6-module-migration
**Tester**: Claude

### Basic Functionality
- ✅ Page loads without errors
- ✅ Game mode selection screen appears
- ✅ Standalone mode works
- ✅ ES6 modules load correctly

### Networked Mode (Critical Bug Fix)
- ✅ Click "Networked Mode" - NO CRASH
- ✅ No "global is not defined" error
- ✅ Connection wizard appears
- ✅ NetworkedSession initializes

### Hot Reload
- ✅ File changes trigger reload
- ✅ Changes appear immediately

### Outstanding Issues
- [ ] Admin panel not tested yet (need backend running)
- [ ] NFC not tested (need HTTPS on real device)

## Next Steps
- Add Playwright E2E tests
- Test with real orchestrator backend
- Test admin panel functionality
```

**Step 6: Commit test results**

```bash
git add docs/plans/es6-migration-test-results.md
git commit -m "test: document ES6 migration development mode test results"
```

---

## Phase 7: E2E Testing with Playwright

### Task 7.1: Create Networked Mode E2E Test

**Files:**
- Create: `tests/e2e/specs/01-networked-mode.spec.js`

**Step 1: Create test file**

Create file: `tests/e2e/specs/01-networked-mode.spec.js`

```javascript
import { test, expect } from '@playwright/test';

test.describe('Networked Mode - ES6 Architecture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen.active', { timeout: 5000 });
  });

  test('should load ES6 modules without errors', async ({ page }) => {
    // Check console for errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(1000);

    // Should have no module loading errors
    const moduleErrors = errors.filter(e =>
      e.includes('module') ||
      e.includes('import') ||
      e.includes('global is not defined')
    );

    expect(moduleErrors).toEqual([]);
  });

  test('should handle networked mode click without crashing', async ({ page }) => {
    // This is the critical fix test!
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Click networked mode button
    await page.click('#selectNetworkedMode, button:has-text("Networked")');

    // Wait for connection wizard or error
    await page.waitForTimeout(1000);

    // Should NOT have "global is not defined" error
    const globalError = errors.find(e => e.includes('global is not defined'));
    expect(globalError).toBeUndefined();

    // Connection wizard should appear (or error if backend not running)
    const modalVisible = await page.isVisible('#connectionModal');

    // Either modal appears OR we get connection error (both OK)
    expect(modalVisible).toBe(true);
  });

  test('should initialize NetworkedSession', async ({ page }) => {
    // Click networked mode
    await page.click('#selectNetworkedMode, button:has-text("Networked")');

    await page.waitForTimeout(1000);

    // Check that NetworkedSession was created
    const sessionExists = await page.evaluate(() => {
      return typeof window.networkedSession !== 'undefined';
    });

    expect(sessionExists).toBe(true);
  });

  test('should have all services available', async ({ page }) => {
    // Click networked mode
    await page.click('#selectNetworkedMode, button:has-text("Networked")');

    await page.waitForTimeout(1000);

    // Check services (even if not connected, they should be created)
    const services = await page.evaluate(() => {
      if (!window.networkedSession) return null;

      return {
        hasClient: window.networkedSession.services?.client !== undefined,
        hasConnectionManager: window.networkedSession.services?.connectionManager !== undefined,
        hasQueueManager: window.networkedSession.services?.queueManager !== undefined,
        hasAdminController: window.networkedSession.services?.adminController !== undefined,
      };
    });

    // Services should exist (even if connection fails)
    expect(services).not.toBeNull();
    expect(services.hasClient).toBe(true);
    expect(services.hasConnectionManager).toBe(true);
    expect(services.hasQueueManager).toBe(true);
    expect(services.hasAdminController).toBe(true);
  });
});
```

**Step 2: Run E2E test**

```bash
npm run test:e2e -- 01-networked-mode
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/e2e/specs/01-networked-mode.spec.js
git commit -m "test(e2e): add Playwright test for networked mode initialization

Validates the critical bug fix:
- No 'global is not defined' error
- NetworkedSession initializes
- All services created properly
- Connection wizard appears"
```

---

### Task 7.2: Create Admin Panel E2E Test

**Files:**
- Create: `tests/e2e/specs/02-admin-panel.spec.js`
- Create: `tests/e2e/helpers/mock-backend.js`

**Step 1: Create mock backend helper** (from Phase 6 plan)

Copy from original Phase 6 Completion Plan - Task 10.1

**Step 2: Create admin panel test**

Create file: `tests/e2e/specs/02-admin-panel.spec.js`

```javascript
import { test, expect } from '@playwright/test';
import { MockBackend } from '../helpers/mock-backend.js';

test.describe('Admin Panel - Event-Driven Initialization', () => {
  let mockBackend;

  test.beforeEach(async ({ page }) => {
    mockBackend = new MockBackend(page);
    await mockBackend.setup();
    await mockBackend.mockWebSocket();

    await page.goto('/');
    await page.waitForSelector('#gameModeScreen.active');

    // Click networked mode
    await page.click('#selectNetworkedMode, button:has-text("Networked")');
    await page.waitForTimeout(1500); // Wait for connection
  });

  test('should initialize AdminController via session:ready event', async ({ page }) => {
    // Check that AdminController was initialized
    const adminController = await page.evaluate(() => {
      if (!window.networked Session) return null;

      const controller = window.networkedSession.getService('adminController');
      return {
        initialized: controller.initialized,
        hasModules: controller.modules !== null,
      };
    });

    expect(adminController).not.toBeNull();
    expect(adminController.initialized).toBe(true);
    expect(adminController.hasModules).toBe(true);
  });

  test('should initialize admin modules when switching to admin view', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Switch to admin view (if tabs visible)
    const adminTab = await page.$('[data-view="admin"]');
    if (adminTab) {
      await adminTab.click();
      await page.waitForTimeout(500);
    }

    // Should NOT have "Admin modules not initialized" error
    const initError = errors.find(e =>
      e.includes('not initialized') ||
      e.includes('Admin modules')
    );

    expect(initError).toBeUndefined();
  });

  test('should have all admin modules created', async ({ page }) => {
    const modules = await page.evaluate(() => {
      if (!window.networkedSession) return null;

      const controller = window.networkedSession.getService('adminController');
      if (!controller.initialized) return null;

      return {
        sessionManager: controller.modules.sessionManager !== undefined,
        videoController: controller.modules.videoController !== undefined,
        systemMonitor: controller.modules.systemMonitor !== undefined,
        adminOperations: controller.modules.adminOperations !== undefined,
        monitoringDisplay: controller.modules.monitoringDisplay !== undefined,
      };
    });

    expect(modules).not.toBeNull();
    expect(modules.sessionManager).toBe(true);
    expect(modules.videoController).toBe(true);
    expect(modules.systemMonitor).toBe(true);
    expect(modules.adminOperations).toBe(true);
    expect(modules.monitoringDisplay).toBe(true);
  });
});
```

**Step 3: Run test**

```bash
npm run test:e2e -- 02-admin-panel
```

**Step 4: Commit**

```bash
git add tests/e2e/specs/02-admin-panel.spec.js tests/e2e/helpers/mock-backend.js
git commit -m "test(e2e): add admin panel initialization tests with mock backend"
```

---

### Task 7.3: Run Full E2E Test Suite

**Files:**
- None (verification task)

**Step 1: Run all E2E tests**

```bash
npm run test:e2e
```

Expected: All Playwright tests pass

**Step 2: Generate HTML report**

```bash
npm run test:e2e:report
```

Review report in browser

**Step 3: Run full test suite**

```bash
npm run test:all
```

Expected:
- Jest: 116+ unit tests pass
- Playwright: 10+ E2E tests pass

**Step 4: Document test results**

Update `docs/plans/es6-migration-test-results.md`:

```markdown
## E2E Test Results (Playwright)

**Baseline Tests (00-baseline.spec.js)**
- ✅ Page loads without errors
- ✅ All scripts load
- ✅ (Skipped) Networked mode - will test after fix

**Networked Mode Tests (01-networked-mode.spec.js)**
- ✅ ES6 modules load without errors
- ✅ No "global is not defined" error
- ✅ NetworkedSession initializes
- ✅ All services created

**Admin Panel Tests (02-admin-panel.spec.js)**
- ✅ AdminController initializes via session:ready event
- ✅ Admin view switches without errors
- ✅ All admin modules created

**Total**: 10+ E2E tests passing in Chromium and Firefox
```

**Step 5: Commit**

```bash
git add docs/plans/es6-migration-test-results.md
git commit -m "test: document complete E2E test results for ES6 migration"
```

---

## Phase 8: Production Build & Deployment

### Task 8.1: Configure Production Build

**Files:**
- Modify: `vite.config.js` (add production optimizations)

**Step 1: Update Vite config for production**

Edit `vite.config.js`, add optimizations:

```javascript
export default defineConfig({
  // ... existing config

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,

    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      }
    },

    // Chunk splitting for better caching
    rollupOptions: {
      input: {
        main: './index.html'
      },
      output: {
        manualChunks: {
          // Vendor chunk for dependencies
          vendor: ['socket.io-client'],

          // Network layer
          network: [
            './src/network/OrchestratorClient.js',
            './src/network/ConnectionManager.js',
            './src/network/NetworkedSession.js',
            './src/network/networkedQueueManager.js',
          ],

          // Core and UI
          core: [
            './src/core/tokenManager.js',
            './src/core/dataManager.js',
            './src/ui/uiManager.js',
            './src/ui/settings.js',
          ]
        }
      }
    },

    // Target modern browsers
    target: 'es2015',

    // Asset size warnings
    chunkSizeWarningLimit: 500,
  },
});
```

**Step 2: Build for production**

```bash
npm run build
```

Expected:
- Build succeeds
- Creates `dist/` directory
- Shows bundle sizes

**Step 3: Verify build output**

```bash
ls -lh dist/
tree dist/
```

Expected structure:
```
dist/
├── index.html
├── assets/
│   ├── main-[hash].js
│   ├── vendor-[hash].js
│   ├── network-[hash].js
│   └── core-[hash].js
└── (other assets)
```

**Step 4: Test production build locally**

```bash
npm run preview
```

Open browser, test:
1. Page loads
2. Networked mode works
3. No console errors
4. Minified code (check Network tab)

**Step 5: Commit**

```bash
git add vite.config.js
git commit -m "build: configure production build with code splitting and minification"
```

---

### Task 8.2: Setup GitHub Pages Deployment

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `vite.config.js` (add base path)

**Step 1: Configure base path for GitHub Pages**

Edit `vite.config.js`:

```javascript
export default defineConfig({
  // Set base path for GitHub Pages
  // Change this to match your repository name
  base: process.env.NODE_ENV === 'production'
    ? '/ALNScanner/'
    : '/',

  // ... rest of config
});
```

**Step 2: Create GitHub Actions workflow**

Create file: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build production
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

**Step 3: Update .gitignore**

```
dist/
```

**Step 4: Commit**

```bash
git add .github/workflows/deploy.yml vite.config.js
git commit -m "ci: add GitHub Pages deployment workflow

Automated deployment:
- Runs tests before deploy
- Builds production bundle
- Deploys to GitHub Pages on push to main"
```

---

### Task 8.3: Smoke Test Production Deployment

**Files:**
- Update: `docs/plans/es6-migration-test-results.md`

**Step 1: Build and preview production**

```bash
npm run build
npm run preview
```

**Step 2: Run E2E tests against production build**

```bash
# Change baseURL temporarily
npm run test:e2e
```

**Step 3: Manual smoke test checklist**

Test in production preview:
- [ ] Page loads without errors
- [ ] Game mode selection works
- [ ] Standalone mode: token scanning
- [ ] Networked mode: connection wizard
- [ ] Admin panel (if backend running)
- [ ] Mobile view (responsive)
- [ ] HTTPS certificate accepted
- [ ] NFC API available (on real device)

**Step 4: Document production readiness**

Update `docs/plans/es6-migration-test-results.md`:

```markdown
## Production Build

**Build Date**: [Current Date]
**Build Size**:
- main.js: XXX KB
- vendor.js: XXX KB
- network.js: XXX KB
- core.js: XXX KB
- Total: XXX KB

**Tests Against Production Build**:
- ✅ All E2E tests pass
- ✅ Smoke test checklist complete
- ✅ Mobile responsive
- ✅ HTTPS works

**Deployment Status**:
- ✅ GitHub Actions workflow configured
- ✅ Ready for merge to main
```

**Step 5: Commit**

```bash
git add docs/plans/es6-migration-test-results.md
git commit -m "test: verify production build readiness"
```

---

## Phase 9: Cleanup & Documentation

### Task 9.1: Remove Deprecated Code

**Files:**
- Delete: `js/` directory (entire legacy codebase)
- Delete: `index.html.backup`
- Update: `.gitignore`

**Step 1: Verify all code migrated**

```bash
# Check that src/ has all modules
find src/ -name "*.js" | wc -l

# Should be 20+ files
```

**Step 2: Remove legacy code**

```bash
# Delete old js/ directory
rm -rf js/

# Delete backup
rm index.html.backup
```

**Step 3: Update .gitignore**

Remove references to old structure if any.

**Step 4: Verify tests still pass**

```bash
npm run test:all
```

Expected: All tests pass (using src/)

**Step 5: Commit**

```bash
git add .
git commit -m "chore: remove deprecated legacy code after ES6 migration

Deleted:
- js/ directory (entire legacy codebase)
- index.html.backup

All functionality now in src/ with ES6 modules."
```

---

### Task 9.2: Update Documentation

**Files:**
- Update: `docs/plans/CLAUDE.md` (if exists in scanner)
- Update: `README.md`
- Create: `MIGRATION.md`

**Step 1: Update CLAUDE.md**

Add new section at top:

```markdown
# CLAUDE.md - ALNScanner (ES6 Module Architecture)

## ⚠️ IMPORTANT: Modern Architecture (Nov 2025)

**This scanner now uses ES6 modules with Vite build system.**

Previous architecture (script tags) was migrated to modern stack. See `docs/plans/2025-11-11-es6-module-migration.md` for details.

## Development Commands

```bash
# Development (with hot reload)
npm run dev

# Run tests
npm test              # Jest unit tests
npm run test:e2e      # Playwright E2E tests
npm run test:all      # All tests

# Build for production
npm run build         # Output to dist/
npm run preview       # Test production build locally

# Deploy
git push origin main  # GitHub Actions deploys automatically
```

## Project Structure

```
ALNScanner/
├── src/                    # ES6 modules (source code)
│   ├── main.js            # Entry point
│   ├── app/               # Application layer
│   ├── core/              # Core business logic
│   ├── network/           # Network layer (WebSocket)
│   ├── ui/                # UI management
│   └── utils/             # Utilities
├── tests/
│   ├── unit/              # Jest unit tests
│   └── e2e/               # Playwright E2E tests
├── dist/                  # Build output (gitignored)
├── index.html             # Minimal HTML (loads ES6 module)
├── vite.config.js         # Build configuration
└── playwright.config.js   # E2E test configuration
```

## Key Architectural Changes

### ES6 Modules
- All code uses `import`/`export`
- No more `window.XXX` assignments
- Vite handles bundling

### Build System
- **Vite 5.x**: Fast dev server with hot reload
- **Production**: Minified, code-split bundles
- **Deployment**: GitHub Pages (automated)

### Testing
- **Unit Tests**: Jest with ES6 support
- **E2E Tests**: Playwright (real browsers)
- **Contract Tests**: Backend still has 141 tests

### Event-Driven Architecture
- NetworkedSession emits `session:ready`
- App listens and initializes admin modules
- No more imperative initialization

## Module Loading

**Old (Deprecated)**:
```html
<script src="js/utils/config.js"></script>
<script src="js/network/OrchestratorClient.js"></script>
<!-- 20+ script tags -->
```

**New**:
```html
<script type="module" src="/src/main.js"></script>
```

Vite handles all imports automatically.

## Critical Fixes from Migration

1. **global vs window**: Removed Node.js `global` fallback that crashed browsers
2. **Admin initialization**: Fixed orphaned admin modules via event-driven approach
3. **Test coverage**: Added real browser E2E tests (Playwright)

## Troubleshooting

**"Module not found" errors**:
- Check import paths use `.js` extension
- Verify file exists in `src/`
- Restart dev server: `npm run dev`

**Hot reload not working**:
- Check Vite dev server is running
- Try hard refresh: Ctrl+Shift+R
- Check browser console for errors

**Build fails**:
- Run `npm run lint` to check syntax
- Run `npm test` to validate code
- Check `vite.config.js` for errors

(... rest of CLAUDE.md updated with new patterns ...)
```

**Step 2: Update README.md**

```markdown
# ALNScanner - Game Master Scanner

**Modern ES6 Module Architecture**
Built with Vite for fast development and optimized production builds.

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server (https://localhost:8443)
npm run dev

# Run tests
npm test
```

### Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to GitHub Pages
git push origin main  # Auto-deploys via GitHub Actions
```

## Architecture

This is a **single-page progressive web app (PWA)** built with:
- **ES6 Modules**: Modern JavaScript with `import`/`export`
- **Vite**: Lightning-fast build tool
- **Playwright**: Real browser E2E testing
- **Event-Driven**: Clean service coordination

See `docs/plans/2025-11-11-es6-module-migration.md` for migration details.

## Testing

```bash
# Unit tests (Jest)
npm test

# E2E tests (Playwright)
npm run test:e2e

# All tests
npm run test:all
```

## Deployment

Automatic deployment to GitHub Pages on push to `main`.

Manual: `npm run build` → copy `dist/` to server.

(... rest of README ...)
```

**Step 3: Create MIGRATION.md**

Create file: `MIGRATION.md`

```markdown
# ES6 Module Migration - Completed

**Date**: November 2025
**Branch**: `feature/es6-module-migration` → `main`

## What Changed

### Before (Legacy)
- 20+ `<script>` tags in index.html
- Global namespace pollution (`window.XXX`)
- No build system
- Tests in jsdom only

### After (Modern)
- Single ES6 module entry point
- Import/export modules
- Vite build system
- Playwright E2E tests in real browsers

## Breaking Changes

1. **No more global variables**: Code must import modules
2. **Build step required**: Cannot open index.html directly
3. **Dev server needed**: Use `npm run dev` for development

## Migration Benefits

1. ✅ **Fixed critical bugs**:
   - "global is not defined" error resolved
   - Admin modules now initialize properly

2. ✅ **Better testing**:
   - Real browser E2E tests catch issues jsdom missed
   - Faster test execution with Playwright

3. ✅ **Improved developer experience**:
   - Hot module reload (instant updates)
   - Better IDE support (module imports)
   - Smaller production bundles (code splitting)

4. ✅ **Modern architecture**:
   - ES6 modules (standard JavaScript)
   - Event-driven initialization
   - No more `window` pollution

## Rollback Instructions

If issues arise:

```bash
git checkout pre-es6-migration
git push origin main --force
```

## For Developers

Read `CLAUDE.md` for:
- New project structure
- Development workflow
- Testing procedures
- Troubleshooting guide
```

**Step 4: Commit**

```bash
git add CLAUDE.md README.md MIGRATION.md
git commit -m "docs: update documentation for ES6 module architecture"
```

---

### Task 9.3: Final Verification & Merge Prep

**Files:**
- Create: `docs/plans/MERGE_CHECKLIST.md`

**Step 1: Create merge checklist**

Create file: `docs/plans/MERGE_CHECKLIST.md`

```markdown
# Merge Checklist - ES6 Module Migration

## Pre-Merge Verification

### Code Quality
- [ ] All linting passes: `npm run lint`
- [ ] No TypeScript errors (if applicable)
- [ ] No console warnings in production build
- [ ] Code coverage >= 70% branches

### Testing
- [ ] All unit tests pass: `npm test`
- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] Backend contract tests pass: 141 tests
- [ ] Manual smoke test on real device

### Build & Deploy
- [ ] Production build succeeds: `npm run build`
- [ ] Build output size reasonable (<500KB main)
- [ ] GitHub Actions workflow configured
- [ ] Deploy preview tested

### Documentation
- [ ] CLAUDE.md updated
- [ ] README.md updated
- [ ] MIGRATION.md created
- [ ] Migration plan documented

### Critical Features
- [ ] Networked mode: No "global is not defined" error
- [ ] Admin panel: Initializes on view switch
- [ ] Standalone mode: Still works
- [ ] NFC scanning: Works on real device (HTTPS)
- [ ] Offline queue: Syncs on reconnect

## Git Hygiene
- [ ] Clean commit history (squash if needed)
- [ ] Descriptive commit messages
- [ ] All files added (no forgotten files)
- [ ] No secrets in commits

## Post-Merge Plan
1. Monitor GitHub Actions deploy
2. Test deployed GitHub Pages site
3. Verify on real Android device
4. Watch for error reports
5. Document any issues

## Rollback Plan

If critical issues after merge:

```bash
git revert [merge-commit-hash]
git push origin main
```

Or restore from tag:

```bash
git checkout pre-es6-migration
git push origin main --force
```
```

**Step 2: Complete checklist**

Go through each item, verify it passes.

**Step 3: Run final full test suite**

```bash
# Lint
npm run lint

# Unit tests with coverage
npm test -- --coverage

# E2E tests
npm run test:e2e

# Production build
npm run build

# Backend contract tests
cd ../../backend && npm run test:contract && cd ../ALNScanner-es6-migration
```

**Step 4: Manual smoke test**

1. `npm run dev`
2. Test each mode
3. Test admin panel
4. Check mobile responsiveness

**Step 5: Document final status**

Update `docs/plans/es6-migration-test-results.md` with final results.

**Step 6: Commit**

```bash
git add docs/plans/MERGE_CHECKLIST.md
git commit -m "chore: add merge checklist for ES6 migration verification"
```

---

### Task 9.4: Squash Commits & Prepare PR

**Files:**
- None (git operations)

**Step 1: Review commit history**

```bash
git log --oneline feature/es6-module-migration ^main | wc -l
```

Shows number of commits (likely 40+)

**Step 2: Interactive rebase (optional)**

If you want cleaner history:

```bash
git rebase -i main
```

Squash commits into logical groups:
1. Infrastructure setup (Vite, Playwright)
2. Utils migration
3. Core & UI migration
4. Network layer fixes
5. App layer event-driven architecture
6. E2E tests
7. Production build
8. Documentation

**Step 3: Push to remote**

```bash
git push origin feature/es6-module-migration --force-with-lease
```

**Step 4: Create Pull Request**

```markdown
# [ALNScanner] ES6 Module Migration - Modern Architecture

## Overview

Complete migration from legacy script tag architecture to modern ES6 modules with Vite build system and real browser E2E testing.

## Critical Fixes

1. ✅ **"global is not defined" bug**: Fixed NetworkedSession trying to access Node.js `global` in browser
2. ✅ **Admin panel initialization**: Implemented event-driven architecture via `session:ready` event
3. ✅ **Test coverage gap**: Added Playwright E2E tests that run in real browsers (caught issues jsdom missed)

## What Changed

### Architecture
- **Before**: 20+ script tags, global namespace, no build system
- **After**: Single ES6 module entry point, Vite build, code splitting

### File Structure
- **src/**: All source code (ES6 modules)
- **dist/**: Build output (gitignored)
- **tests/e2e/**: Playwright E2E tests
- **Deleted**: Legacy `js/` directory

### Developer Experience
- Hot module reload (instant updates)
- Real browser testing (Playwright)
- Automated deployment (GitHub Actions)

## Testing Results

**Unit Tests (Jest)**:
- 116+ tests passing
- Coverage >= 70% branches

**E2E Tests (Playwright)**:
- 10+ tests passing in Chromium, Firefox
- Tests actual browser module loading
- Validates networked mode initialization
- Validates admin panel event wiring

**Backend Contract Tests**:
- 141 tests passing (unchanged)

## Breaking Changes

None for end users. Developers must:
- Use `npm run dev` (not opening index.html directly)
- Import modules (not rely on window.XXX globals)

## Migration Path

See `docs/plans/2025-11-11-es6-module-migration.md` for:
- Complete task-by-task breakdown
- Rollback procedures
- Testing strategy

## Deployment

Automated via GitHub Actions on merge to main.

## Rollback

If issues:
```bash
git checkout pre-es6-migration
git push origin main --force
```

---

**Ready to merge**: All tests passing, documented, production-ready.
```

**Step 5: Verify PR checklist**

Review all items in `MERGE_CHECKLIST.md`.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-11-11-es6-module-migration.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration with quality gates

2. **Parallel Session (separate)** - Open new session with `executing-plans` skill, batch execution with checkpoints

**Which approach do you prefer?**
