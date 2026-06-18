/**
 * @jest-environment jsdom
 *
 * QueueStatusManager wiring (F-GMS-11)
 *
 * The queue:changed listener was registered only if app.networkedSession
 * already existed when init() ran (startup auto-connect restore path). In the
 * common fresh-launch flow (user picks Networked Mode AFTER init), the
 * listener was never attached — the offline-queue indicator
 * (#queueStatusIndicator) never updated for the whole session.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QueueStatusManager } from '../../../src/ui/connectionWizard.js';

describe('QueueStatusManager (F-GMS-11)', () => {
  let app;
  let manager;
  let queueManager;

  function makeQueueManager(count = 0) {
    const qm = new EventTarget();
    qm.getStatus = jest.fn(() => ({ queuedCount: count, syncing: false }));
    return qm;
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="queueStatusIndicator"><span id="queueCount"></span></div>
    `;
    app = { networkedSession: null };
    manager = new QueueStatusManager(app);
  });

  it('updates the indicator when queue:changed fires after networked mode initializes post-startup', () => {
    // 1. Fresh launch: init() runs with NO networkedSession (no listener possible)
    manager.init();

    // 2. User picks Networked Mode later — session + queueManager now exist
    queueManager = makeQueueManager(0);
    app.networkedSession = { services: { queueManager } };
    manager.attach(); // called by App._initializeNetworkedMode

    // 3. A scan is queued offline
    queueManager.getStatus.mockReturnValue({ queuedCount: 3, syncing: false });
    queueManager.dispatchEvent(new CustomEvent('queue:changed', {
      detail: { queuedCount: 3, syncing: false }
    }));

    expect(document.getElementById('queueCount').textContent).toBe('3');
    expect(document.getElementById('queueStatusIndicator').classList.contains('visible')).toBe(true);
  });

  it('still attaches on the startup auto-connect restore path (init with existing session)', () => {
    queueManager = makeQueueManager(0);
    app.networkedSession = { services: { queueManager } };

    manager.init();

    queueManager.getStatus.mockReturnValue({ queuedCount: 1, syncing: false });
    queueManager.dispatchEvent(new CustomEvent('queue:changed', {
      detail: { queuedCount: 1, syncing: false }
    }));

    expect(document.getElementById('queueCount').textContent).toBe('1');
  });

  it('attach() is idempotent — no duplicate listeners on repeated attach', () => {
    queueManager = makeQueueManager(0);
    app.networkedSession = { services: { queueManager } };
    const addSpy = jest.spyOn(queueManager, 'addEventListener');

    manager.init();
    manager.attach();
    manager.attach();

    const queueChangedRegistrations = addSpy.mock.calls.filter(c => c[0] === 'queue:changed');
    expect(queueChangedRegistrations).toHaveLength(1);
  });

  it('re-attaches to a NEW queue manager (e.g. session recreated) and detaches the old one', () => {
    const first = makeQueueManager(0);
    app.networkedSession = { services: { queueManager: first } };
    manager.init();

    const second = makeQueueManager(0);
    app.networkedSession = { services: { queueManager: second } };
    manager.attach();

    second.getStatus.mockReturnValue({ queuedCount: 2, syncing: false });
    second.dispatchEvent(new CustomEvent('queue:changed', { detail: {} }));

    expect(document.getElementById('queueCount').textContent).toBe('2');
  });
});
