/**
 * ScreenUpdateManager Unit Tests
 *
 * Phase 3: Event Architecture Standardization
 *
 * Tests the centralized event-to-screen routing system.
 */

import { ScreenUpdateManager } from '../../../src/ui/ScreenUpdateManager.js';

describe('ScreenUpdateManager', () => {
  let screenUpdateManager;
  let mockUIManager;
  let mockDataManager;
  let mockDebug;
  let mockApp;

  beforeEach(() => {
    // Create mock dependencies
    mockUIManager = {
      updateHistoryBadge: jest.fn(),
      updateSessionStats: jest.fn(),
      updateHistoryStats: jest.fn(),
      renderTransactions: jest.fn(),
      renderTeamDetails: jest.fn(),
      renderScoreboard: jest.fn()
    };

    mockDataManager = {
      getTeamTransactions: jest.fn().mockReturnValue([]),
      addEventListener: jest.fn()
    };

    mockDebug = {
      log: jest.fn()
    };

    mockApp = {
      currentInterventionTeamId: '001'
    };

    screenUpdateManager = new ScreenUpdateManager({
      uiManager: mockUIManager,
      dataManager: mockDataManager,
      debug: mockDebug
    });
  });

  describe('constructor', () => {
    it('should initialize with empty handlers', () => {
      expect(screenUpdateManager.globalHandlers).toEqual({});
      expect(screenUpdateManager.screenHandlers.size).toBe(0);
      expect(screenUpdateManager.appContext).toBeNull();
    });

    it('should store injected dependencies', () => {
      expect(screenUpdateManager.uiManager).toBe(mockUIManager);
      expect(screenUpdateManager.dataManager).toBe(mockDataManager);
      expect(screenUpdateManager.debug).toBe(mockDebug);
    });
  });

  describe('setAppContext()', () => {
    it('should store the app reference', () => {
      screenUpdateManager.setAppContext(mockApp);
      expect(screenUpdateManager.appContext).toBe(mockApp);
    });

    it('should log when setting context', () => {
      screenUpdateManager.setAppContext(mockApp);
      expect(mockDebug.log).toHaveBeenCalledWith('[ScreenUpdateManager] App context set');
    });
  });

  describe('registerGlobalHandler()', () => {
    it('should register a global handler for an event type', () => {
      const handler = jest.fn();
      screenUpdateManager.registerGlobalHandler('transaction:added', handler);

      expect(screenUpdateManager.globalHandlers['transaction:added']).toContain(handler);
    });

    it('should allow multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      screenUpdateManager.registerGlobalHandler('transaction:added', handler1);
      screenUpdateManager.registerGlobalHandler('transaction:added', handler2);

      expect(screenUpdateManager.globalHandlers['transaction:added']).toHaveLength(2);
    });

    it('should log registration', () => {
      screenUpdateManager.registerGlobalHandler('transaction:added', jest.fn());
      expect(mockDebug.log).toHaveBeenCalledWith(
        '[ScreenUpdateManager] Registered global handler for transaction:added'
      );
    });
  });

  describe('registerScreen()', () => {
    it('should register screen handlers', () => {
      const handlers = {
        'transaction:added': jest.fn(),
        'transaction:deleted': jest.fn()
      };

      screenUpdateManager.registerScreen('history', handlers);

      expect(screenUpdateManager.screenHandlers.get('history')).toBe(handlers);
    });

    it('should log registration with event types', () => {
      screenUpdateManager.registerScreen('history', {
        'transaction:added': jest.fn(),
        'transaction:deleted': jest.fn()
      });

      expect(mockDebug.log).toHaveBeenCalledWith(
        expect.stringContaining("Registered screen 'history' for events")
      );
    });
  });

  describe('getActiveScreenId()', () => {
    beforeEach(() => {
      // Mock document.querySelector
      document.body.innerHTML = `
        <div id="loadingScreen" class="screen"></div>
        <div id="historyScreen" class="screen active"></div>
        <div id="scanScreen" class="screen"></div>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('should return the active screen ID without "Screen" suffix', () => {
      expect(screenUpdateManager.getActiveScreenId()).toBe('history');
    });

    it('should return null if no screen is active', () => {
      document.querySelector('.screen.active').classList.remove('active');
      expect(screenUpdateManager.getActiveScreenId()).toBeNull();
    });
  });

  describe('onDataUpdate()', () => {
    beforeEach(() => {
      // Set up DOM with active screen
      document.body.innerHTML = `
        <div id="historyScreen" class="screen active"></div>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('should call all global handlers for the event type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      screenUpdateManager.registerGlobalHandler('transaction:added', handler1);
      screenUpdateManager.registerGlobalHandler('transaction:added', handler2);

      screenUpdateManager.onDataUpdate('transaction:added', { foo: 'bar' });

      expect(handler1).toHaveBeenCalledWith({ foo: 'bar' });
      expect(handler2).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should call screen handler if screen is active', () => {
      const screenHandler = jest.fn();
      screenUpdateManager.registerScreen('history', {
        'transaction:added': screenHandler
      });
      screenUpdateManager.setAppContext(mockApp);

      screenUpdateManager.onDataUpdate('transaction:added', { foo: 'bar' });

      expect(screenHandler).toHaveBeenCalledWith({ foo: 'bar' }, mockApp);
    });

    it('should NOT call screen handler if different screen is active', () => {
      const screenHandler = jest.fn();
      screenUpdateManager.registerScreen('scoreboard', {
        'transaction:added': screenHandler
      });

      // historyScreen is active, not scoreboardScreen
      screenUpdateManager.onDataUpdate('transaction:added', { foo: 'bar' });

      expect(screenHandler).not.toHaveBeenCalled();
    });

    it('should handle errors in global handlers gracefully', () => {
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = jest.fn();

      screenUpdateManager.registerGlobalHandler('transaction:added', errorHandler);
      screenUpdateManager.registerGlobalHandler('transaction:added', goodHandler);

      // Should not throw, and should continue to next handler
      expect(() => {
        screenUpdateManager.onDataUpdate('transaction:added', {});
      }).not.toThrow();

      expect(goodHandler).toHaveBeenCalled();
    });

    it('should handle errors in screen handlers gracefully', () => {
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Screen handler error');
      });

      screenUpdateManager.registerScreen('history', {
        'transaction:added': errorHandler
      });

      // Should not throw
      expect(() => {
        screenUpdateManager.onDataUpdate('transaction:added', {});
      }).not.toThrow();
    });

    it('should log the event type', () => {
      screenUpdateManager.onDataUpdate('transaction:added', {});
      expect(mockDebug.log).toHaveBeenCalledWith(
        '[ScreenUpdateManager] transaction:added event received'
      );
    });
  });

  describe('connectToDataSource()', () => {
    it('should add event listeners to the data source', () => {
      const mockSource = {
        addEventListener: jest.fn()
      };

      screenUpdateManager.connectToDataSource(mockSource, [
        'transaction:added',
        'transaction:deleted'
      ]);

      expect(mockSource.addEventListener).toHaveBeenCalledTimes(2);
      expect(mockSource.addEventListener).toHaveBeenCalledWith(
        'transaction:added',
        expect.any(Function)
      );
      expect(mockSource.addEventListener).toHaveBeenCalledWith(
        'transaction:deleted',
        expect.any(Function)
      );
    });

    it('should route events through onDataUpdate', () => {
      const mockSource = new EventTarget();
      const globalHandler = jest.fn();

      screenUpdateManager.registerGlobalHandler('test:event', globalHandler);
      screenUpdateManager.connectToDataSource(mockSource, ['test:event']);

      // Dispatch event
      const event = new CustomEvent('test:event', { detail: { data: 'test' } });
      mockSource.dispatchEvent(event);

      expect(globalHandler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should log the connection', () => {
      const mockSource = {
        addEventListener: jest.fn()
      };

      screenUpdateManager.connectToDataSource(mockSource, ['event1', 'event2']);

      expect(mockDebug.log).toHaveBeenCalledWith(
        '[ScreenUpdateManager] Connected to data source for events: event1, event2'
      );
    });
  });

  describe('integration: full event flow', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="historyScreen" class="screen active"></div>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('should handle complete transaction:added flow', () => {
      // Register global handler
      screenUpdateManager.registerGlobalHandler('transaction:added', () => {
        mockUIManager.updateHistoryBadge();
        mockUIManager.updateSessionStats();
      });

      // Register screen handler
      screenUpdateManager.registerScreen('history', {
        'transaction:added': () => {
          mockUIManager.updateHistoryStats();
          mockUIManager.renderTransactions();
        }
      });

      // Trigger event
      screenUpdateManager.onDataUpdate('transaction:added', {});

      // Verify all handlers ran
      expect(mockUIManager.updateHistoryBadge).toHaveBeenCalled();
      expect(mockUIManager.updateSessionStats).toHaveBeenCalled();
      expect(mockUIManager.updateHistoryStats).toHaveBeenCalled();
      expect(mockUIManager.renderTransactions).toHaveBeenCalled();
    });

    it('should handle team details screen with app context', () => {
      document.body.innerHTML = `
        <div id="teamDetailsScreen" class="screen active"></div>
      `;

      mockDataManager.getTeamTransactions.mockReturnValue([{ id: 1 }, { id: 2 }]);

      screenUpdateManager.registerScreen('teamDetails', {
        'transaction:added': (eventData, app) => {
          const teamId = app?.currentInterventionTeamId;
          if (teamId) {
            const transactions = mockDataManager.getTeamTransactions(teamId);
            mockUIManager.renderTeamDetails(teamId, transactions);
          }
        }
      });

      screenUpdateManager.setAppContext(mockApp);
      screenUpdateManager.onDataUpdate('transaction:added', {});

      expect(mockDataManager.getTeamTransactions).toHaveBeenCalledWith('001');
      expect(mockUIManager.renderTeamDetails).toHaveBeenCalledWith(
        '001',
        [{ id: 1 }, { id: 2 }]
      );
    });
  });
});
