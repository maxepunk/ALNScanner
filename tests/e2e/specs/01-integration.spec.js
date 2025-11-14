/**
 * Browser Integration Tests - Refactored Components
 *
 * Simplified tests focusing on what can be effectively tested in browser.
 * Full networked flow testing requires mock orchestrator (beyond scope).
 */

const { test, expect } = require('@playwright/test');
const { createValidToken } = require('../fixtures/testTokens');
const { injectMockSocketIo } = require('../fixtures/mockWebSocket');

test.describe('Browser Integration - Component Loading', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockSocketIo(page);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.App !== 'undefined', { timeout: 10000 });
  });

  test('should load all refactored network components', async ({ page }) => {
    const result = await page.evaluate(() => {
      return {
        NetworkedSession: typeof window.NetworkedSession === 'function',
        OrchestratorClient: typeof window.OrchestratorClient === 'function',
        ConnectionManager: typeof window.ConnectionManager === 'function',
        AdminController: typeof window.AdminController === 'function',
        SessionModeManager: typeof window.SessionModeManager === 'function'
      };
    });

    expect(result.NetworkedSession).toBe(true);
    expect(result.OrchestratorClient).toBe(true);
    expect(result.ConnectionManager).toBe(true);
    expect(result.AdminController).toBe(true);
    expect(result.SessionModeManager).toBe(true);
  });

  test('should create NetworkedSession instance', async ({ page }) => {
    const result = await page.evaluate((token) => {
      try {
        const session = new window.NetworkedSession({
          url: 'https://localhost:3000',
          deviceId: 'TEST_E2E',
          stationName: 'E2E Test',
          token: token
        });

        return {
          success: true,
          hasConfig: session.config !== null,
          initialState: session.state,
          servicesNull: session.services === null,
          isEventTarget: session instanceof EventTarget
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, createValidToken());

    expect(result.success).toBe(true);
    expect(result.hasConfig).toBe(true);
    expect(result.initialState).toBe('disconnected');
    expect(result.servicesNull).toBe(true);
    expect(result.isEventTarget).toBe(true);
  });

  test('should create OrchestratorClient instance', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        const client = new window.OrchestratorClient({
          url: 'https://localhost:3000',
          deviceId: 'TEST_E2E'
        });

        return {
          success: true,
          hasConfig: client.config !== null,
          socketNull: client.socket === null,
          isConnected: client.isConnected,
          isEventTarget: client instanceof EventTarget
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasConfig).toBe(true);
    expect(result.socketNull).toBe(true);
    expect(result.isConnected).toBe(false);
    expect(result.isEventTarget).toBe(true);
  });

  test('should create ConnectionManager instance', async ({ page }) => {
    const result = await page.evaluate((token) => {
      try {
        const mockClient = { test: 'client' };
        const manager = new window.ConnectionManager({
          url: 'https://localhost:3000',
          deviceId: 'TEST_E2E',
          token: token,
          client: mockClient
        });

        return {
          success: true,
          hasConfig: manager.config !== null,
          hasClient: manager.client !== null,
          initialState: manager.state,
          hasToken: manager.token !== null,
          isEventTarget: manager instanceof EventTarget
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, createValidToken());

    expect(result.success).toBe(true);
    expect(result.hasConfig).toBe(true);
    expect(result.hasClient).toBe(true);
    expect(result.initialState).toBe('disconnected');
    expect(result.hasToken).toBe(true);
    expect(result.isEventTarget).toBe(true);
  });

  test('should create AdminController instance', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        const mockClient = { test: 'client' };
        const controller = new window.AdminController(mockClient);

        return {
          success: true,
          hasClient: controller.client !== null,
          notInitialized: controller.initialized === false,
          modulesNull: controller.modules === null
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasClient).toBe(true);
    expect(result.notInitialized).toBe(true);
    expect(result.modulesNull).toBe(true);
  });

  test('should create SessionModeManager instance', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        const manager = new window.SessionModeManager();

        return {
          success: true,
          modeNull: manager.mode === null,
          notLocked: manager.locked === false,
          hasInitMethod: typeof manager.initNetworkedMode === 'function',
          hasStandaloneMethod: typeof manager.initStandaloneMode === 'function'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.modeNull).toBe(true);
    expect(result.notLocked).toBe(true);
    expect(result.hasInitMethod).toBe(true);
    expect(result.hasStandaloneMethod).toBe(true);
  });

  test('should have NetworkedSession getService method', async ({ page }) => {
    const result = await page.evaluate((token) => {
      const session = new window.NetworkedSession({
        url: 'https://localhost:3000',
        deviceId: 'TEST_E2E',
        token: token
      });

      try {
        session.getService('connectionManager');
        return { threw: false };
      } catch (error) {
        return {
          threw: true,
          errorMessage: error.message,
          isCorrectError: error.message.includes('not initialized')
        };
      }
    }, createValidToken());

    expect(result.threw).toBe(true);
    expect(result.isCorrectError).toBe(true);
  });

  test('should have NetworkedSession destroy method', async ({ page }) => {
    const result = await page.evaluate(async (token) => {
      const session = new window.NetworkedSession({
        url: 'https://localhost:3000',
        deviceId: 'TEST_E2E',
        token: token
      });

      try {
        await session.destroy();
        return {
          success: true,
          state: session.state,
          servicesNull: session.services === null
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, createValidToken());

    expect(result.success).toBe(true);
    expect(result.state).toBe('disconnected');
    expect(result.servicesNull).toBe(true);
  });
});
