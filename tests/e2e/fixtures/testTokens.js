/**
 * Test Fixtures for E2E Tests
 *
 * Provides helper functions for generating test JWT tokens and mock RFID tokens.
 */

/**
 * Create a valid JWT token for testing
 * @param {number} expiresInSeconds - Token expiry time (default: 1 hour)
 * @returns {string} JWT token
 */
function createValidToken(expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    deviceId: 'TEST_GM_E2E',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000)
  };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'test-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Create an expired JWT token for testing
 * @returns {string} Expired JWT token
 */
function createExpiredToken() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    deviceId: 'TEST_GM_E2E',
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200
  };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'test-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Mock RFID tokens for testing
 */
const mockTokens = {
  // Valid test tokens (must exist in data/tokens.json)
  valid: {
    rat002: {
      SF_RFID: 'rat002',
      SF_ValueRating: 5,
      SF_MemoryType: 'Technical',
      SF_Group: 'Server Logs (x5)'
    },
    sof002: {
      SF_RFID: 'sof002',
      SF_ValueRating: 4,
      SF_MemoryType: 'Business',
      SF_Group: 'Financial Records (x3)'
    },
    mab002: {
      SF_RFID: 'mab002',
      SF_ValueRating: 3,
      SF_MemoryType: 'Personal',
      SF_Group: null
    }
  },

  // Invalid token (doesn't exist in database)
  invalid: {
    SF_RFID: 'INVALID_TOKEN_999',
    SF_ValueRating: null,
    SF_MemoryType: null,
    SF_Group: null
  }
};

/**
 * Helper function to wait for element with timeout
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise<ElementHandle>}
 */
async function waitForElement(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    return page.locator(selector);
  } catch (error) {
    throw new Error(`Element "${selector}" not found within ${timeout}ms`);
  }
}

/**
 * Helper function to simulate manual token entry
 * @param {Page} page - Playwright page object
 * @param {string} tokenId - Token ID to enter
 */
async function enterTokenManually(page, tokenId) {
  // Click "Manual Entry" button
  await page.click('button:has-text("Manual Entry")');

  // Wait for input dialog
  await waitForElement(page, '#manualTokenInput');

  // Enter token ID
  await page.fill('#manualTokenInput', tokenId);

  // Submit
  await page.click('button:has-text("Submit")');
}

/**
 * Helper function to select game mode
 * @param {Page} page - Playwright page object
 * @param {string} mode - 'networked' or 'standalone'
 */
async function selectGameMode(page, mode) {
  await waitForElement(page, `button:has-text("${mode === 'networked' ? 'Networked' : 'Standalone'}")`);
  await page.click(`button:has-text("${mode === 'networked' ? 'Networked' : 'Standalone'}"`);
}

/**
 * Helper function to enter team ID
 * @param {Page} page - Playwright page object
 * @param {string} teamId - 6-digit team ID (e.g., '000001')
 */
async function enterTeamId(page, teamId) {
  // Wait for team entry screen
  await waitForElement(page, '#teamEntryScreen.active');

  // Click digits
  for (const digit of teamId) {
    await page.click(`button[data-digit="${digit}"]`);
  }

  // Click confirm
  await page.click('button:has-text("Confirm")');
}

module.exports = {
  createValidToken,
  createExpiredToken,
  mockTokens,
  waitForElement,
  enterTokenManually,
  selectGameMode,
  enterTeamId
};
