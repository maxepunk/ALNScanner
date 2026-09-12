/**
 * domEventBindings - admin.toggleHealthDetail wiring test
 *
 * Passthrough test at the wiring layer: `data-action="admin.toggleHealthDetail"`
 * (src/ui/renderers/HealthRenderer.js) must resolve to
 * `monitoringDisplay.toggleHealthDetail()` (src/utils/domEventBindings.js
 * `handleAdminAction`'s 'toggleHealthDetail' case). Neither the module-name
 * string ('monitoringDisplay') nor the method name was directly exercised
 * before this (PR #17 review coverage note) — either one going stale under
 * a rename would fail silently (the optional-chaining call is a no-op) and
 * this is the test that would catch it.
 *
 * Pattern follows domEventBindings-safeAction.test.js: bindDOMEvents() once
 * in beforeAll against long-lived mock objects, mutated (not replaced)
 * between tests so only one set of document-level listeners ever exists.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';

import { bindDOMEvents } from '../../../src/utils/domEventBindings.js';

describe('domEventBindings - admin.toggleHealthDetail', () => {
  const mockMonitoringDisplay = {
    toggleHealthDetail: jest.fn()
  };

  const mockAdminController = {
    initialized: true,
    getModule: jest.fn((name) => (name === 'monitoringDisplay' ? mockMonitoringDisplay : {}))
  };

  const mockApp = {
    networkedSession: {
      getService: jest.fn(() => mockAdminController)
    }
  };

  const mockDebug = {
    log: jest.fn()
  };

  beforeAll(() => {
    bindDOMEvents(mockApp, {}, {}, mockDebug, {}, {}, {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminController.initialized = true;
    mockApp.networkedSession = {
      getService: jest.fn(() => mockAdminController)
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function clickAction(element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('routes a click to monitoringDisplay.toggleHealthDetail()', () => {
    const btn = document.createElement('button');
    btn.dataset.action = 'admin.toggleHealthDetail';
    document.body.appendChild(btn);

    clickAction(btn);

    expect(mockAdminController.getModule).toHaveBeenCalledWith('monitoringDisplay');
    expect(mockMonitoringDisplay.toggleHealthDetail).toHaveBeenCalledTimes(1);
  });

  it('does nothing when admin is not initialized, like every other admin action', () => {
    mockAdminController.initialized = false;

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.toggleHealthDetail';
    document.body.appendChild(btn);

    expect(() => clickAction(btn)).not.toThrow();
    expect(mockMonitoringDisplay.toggleHealthDetail).not.toHaveBeenCalled();
  });
});
