/**
 * Mock WebSocket Server for E2E Tests
 *
 * Provides a browser-injectable mock Socket.io client for testing
 * without requiring a real orchestrator backend.
 */

/**
 * Create a mock Socket.io client that can be injected into the browser
 * @returns {string} JavaScript code to inject
 */
function getMockSocketIoClientCode() {
  return `
    // Mock Socket.io client for testing
    window.mockSocketEvents = [];
    window.mockSocketEmissions = [];

    window.io = function(url, options) {
      const mockSocket = {
        connected: false,
        _handlers: {},

        on: function(event, handler) {
          if (!this._handlers[event]) {
            this._handlers[event] = [];
          }
          this._handlers[event].push(handler);
          return this;
        },

        once: function(event, handler) {
          const wrappedHandler = (...args) => {
            this.off(event, wrappedHandler);
            handler(...args);
          };
          return this.on(event, wrappedHandler);
        },

        off: function(event, handler) {
          if (this._handlers[event]) {
            this._handlers[event] = this._handlers[event].filter(h => h !== handler);
          }
          return this;
        },

        emit: function(event, data) {
          window.mockSocketEmissions.push({ event, data, timestamp: Date.now() });
          return this;
        },

        disconnect: function() {
          this.connected = false;
          this._trigger('disconnect', 'client namespace disconnect');
          return this;
        },

        removeAllListeners: function() {
          this._handlers = {};
          return this;
        },

        _trigger: function(event, ...args) {
          if (this._handlers[event]) {
            this._handlers[event].forEach(handler => {
              try {
                handler(...args);
              } catch (error) {
                console.error('Mock socket handler error:', error);
              }
            });
          }
        },

        // Test helpers (called from Playwright)
        _simulateConnect: function() {
          this.connected = true;
          setTimeout(() => this._trigger('connect'), 0);
        },

        _simulateError: function(error) {
          setTimeout(() => this._trigger('connect_error', error), 0);
        },

        _simulateDisconnect: function(reason) {
          this.connected = false;
          setTimeout(() => this._trigger('disconnect', reason), 0);
        },

        _simulateMessage: function(type, data) {
          setTimeout(() => this._trigger(type, data), 0);
        }
      };

      window.mockSocket = mockSocket;
      window.mockSocketEvents.push({ url, options, timestamp: Date.now() });

      return mockSocket;
    };

    // Mock fetch for health checks
    window.originalFetch = window.fetch;
    window.fetch = function(url, options) {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'ok' })
        });
      }
      return window.originalFetch(url, options);
    };
  `;
}

/**
 * Helper to inject mock Socket.io into page
 * @param {Page} page - Playwright page object
 */
async function injectMockSocketIo(page) {
  await page.addInitScript(getMockSocketIoClientCode());
}

/**
 * Helper to simulate socket connection from test
 * @param {Page} page - Playwright page object
 */
async function simulateSocketConnect(page) {
  await page.evaluate(() => {
    if (window.mockSocket) {
      window.mockSocket._simulateConnect();
    }
  });
}

/**
 * Helper to simulate socket error from test
 * @param {Page} page - Playwright page object
 * @param {string} message - Error message
 */
async function simulateSocketError(page, message) {
  await page.evaluate((msg) => {
    if (window.mockSocket) {
      window.mockSocket._simulateError(new Error(msg));
    }
  }, message);
}

/**
 * Helper to simulate socket message from test
 * @param {Page} page - Playwright page object
 * @param {string} type - Message type
 * @param {Object} data - Message data
 */
async function simulateSocketMessage(page, type, data) {
  await page.evaluate(({ msgType, msgData }) => {
    if (window.mockSocket) {
      window.mockSocket._simulateMessage(msgType, msgData);
    }
  }, { msgType: type, msgData: data });
}

/**
 * Get all socket emissions from test
 * @param {Page} page - Playwright page object
 * @returns {Promise<Array>}
 */
async function getSocketEmissions(page) {
  return await page.evaluate(() => {
    return window.mockSocketEmissions || [];
  });
}

/**
 * Clear socket emission history
 * @param {Page} page - Playwright page object
 */
async function clearSocketEmissions(page) {
  await page.evaluate(() => {
    window.mockSocketEmissions = [];
  });
}

module.exports = {
  getMockSocketIoClientCode,
  injectMockSocketIo,
  simulateSocketConnect,
  simulateSocketError,
  simulateSocketMessage,
  getSocketEmissions,
  clearSocketEmissions
};
