/**
 * Unit Test: SessionRenderer
 *
 * Verifies template rendering for all session states, differential updates,
 * game clock ticking, and overtime display.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { SessionRenderer } from '../../../../src/ui/renderers/SessionRenderer.js';

describe('SessionRenderer', () => {
  let container;
  let renderer;

  beforeEach(() => {
    jest.useFakeTimers();

    container = document.createElement('div');
    container.id = 'session-status-container';
    document.body.appendChild(container);

    renderer = new SessionRenderer({ container });
  });

  afterEach(() => {
    renderer.destroy();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('render() - session states', () => {
    it('should render no-session state with Create button', () => {
      renderer.render(null);

      expect(container.querySelector('.session-status--empty')).toBeTruthy();
      expect(container.querySelector('[data-action="app.adminCreateSession"]')).toBeTruthy();
      expect(container.textContent).toContain('No Active Session');
    });

    it('should render setup state with Start Game button', () => {
      renderer.render({ name: 'Test Game', status: 'setup' });

      expect(container.querySelector('.session-status--setup')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.startGame"]')).toBeTruthy();
      expect(container.querySelector('#session-name').textContent).toBe('Test Game');
    });

    it('should render active state with Pause and End buttons', () => {
      renderer.render({ name: 'Live Game', status: 'active' });

      expect(container.querySelector('.session-status--active')).toBeTruthy();
      expect(container.querySelector('[data-action="app.adminPauseSession"]')).toBeTruthy();
      expect(container.querySelector('[data-action="app.adminEndSession"]')).toBeTruthy();
    });

    it('should render paused state with Resume button', () => {
      renderer.render({ name: 'Paused Game', status: 'paused' });

      expect(container.querySelector('.session-status--paused')).toBeTruthy();
      expect(container.querySelector('[data-action="app.adminResumeSession"]')).toBeTruthy();
    });

    it('should render ended state with Download Report and Reset buttons', () => {
      renderer.render({ name: 'Done Game', status: 'ended' });

      expect(container.querySelector('.session-status--ended')).toBeTruthy();
      expect(container.querySelector('[data-action="app.downloadSessionReport"]')).toBeTruthy();
      expect(container.querySelector('[data-action="app.adminResetAndCreateNew"]')).toBeTruthy();
    });

    it('should show status badge with correct class for active', () => {
      renderer.render({ name: 'Game', status: 'active' });

      const badge = container.querySelector('#session-status-badge');
      expect(badge.textContent).toBe('Active');
      expect(badge.classList.contains('badge-success')).toBe(true);
    });

    it('should show status badge with warning class for paused', () => {
      renderer.render({ name: 'Game', status: 'paused' });

      const badge = container.querySelector('#session-status-badge');
      expect(badge.textContent).toBe('Paused');
      expect(badge.classList.contains('badge-warning')).toBe(true);
    });

    it('should show status badge with danger class for ended', () => {
      renderer.render({ name: 'Game', status: 'ended' });

      const badge = container.querySelector('#session-status-badge');
      expect(badge.textContent).toBe('Ended');
      expect(badge.classList.contains('badge-danger')).toBe(true);
    });

    it('should use fallback session name when missing', () => {
      renderer.render({ status: 'active' });

      expect(container.querySelector('#session-name').textContent).toBe('New Session');
    });

    it('should handle null state as no-session', () => {
      renderer.render(null);

      expect(container.querySelector('.session-status--empty')).toBeTruthy();
    });

    it('should handle empty state as no-session', () => {
      renderer.render({});

      expect(container.querySelector('.session-status--empty')).toBeTruthy();
    });

    it('should include game clock display in setup/active/paused', () => {
      for (const status of ['setup', 'active', 'paused']) {
        renderer.render({ name: 'Game', status });
        expect(container.querySelector('#game-clock-display')).toBeTruthy();
        renderer._viewState = null; // Reset for next iteration
      }
    });

    it('should NOT include game clock display in ended state', () => {
      renderer.render({ name: 'Game', status: 'ended' });
      expect(container.querySelector('#game-clock-display')).toBeFalsy();
    });
  });

  describe('render() - template transitions', () => {
    it('should swap template when viewState changes', () => {
      renderer.render({ name: 'Game', status: 'active' });
      expect(container.querySelector('.session-status--active')).toBeTruthy();

      renderer.render({ name: 'Game', status: 'paused' });
      expect(container.querySelector('.session-status--paused')).toBeTruthy();
      expect(container.querySelector('.session-status--active')).toBeFalsy();
    });

    it('should swap from no-session to setup', () => {
      renderer.render(null);
      expect(container.querySelector('.session-status--empty')).toBeTruthy();

      renderer.render({ name: 'New Game', status: 'setup' });
      expect(container.querySelector('.session-status--setup')).toBeTruthy();
      expect(container.querySelector('.session-status--empty')).toBeFalsy();
    });

    it('should swap from active to ended', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.render({ name: 'Game', status: 'ended' });

      expect(container.querySelector('.session-status--ended')).toBeTruthy();
      expect(container.textContent).toContain('Session completed');
    });
  });

  describe('render() - differential updates', () => {
    it('should update session name without template swap', () => {
      const state1 = { name: 'Game Alpha', status: 'active' };
      renderer.render(state1);

      const containerBefore = container.querySelector('.session-status--active');

      const state2 = { name: 'Game Beta', status: 'active' };
      renderer.render(state2, state1);

      // Same template preserved (not rebuilt)
      expect(container.querySelector('.session-status--active')).toBe(containerBefore);
      // Name updated
      expect(container.querySelector('#session-name').textContent).toBe('Game Beta');
    });

    it('should use Untitled Session as fallback name', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.render({ name: null, status: 'active' }, { name: 'Game', status: 'active' });

      expect(container.querySelector('#session-name').textContent).toBe('Untitled Session');
    });

    it('should not touch DOM if nothing changed', () => {
      const state = { name: 'Game', status: 'active' };
      renderer.render(state);

      const nameEl = container.querySelector('#session-name');
      const nameContent = nameEl.textContent;

      // Re-render same state
      renderer.render(state, state);

      expect(nameEl.textContent).toBe(nameContent);
    });
  });

  describe('renderGameClock()', () => {
    it('should display formatted time', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 125 });

      const display = container.querySelector('#game-clock-display');
      expect(display.textContent).toBe('02:05');
    });

    it('should display zero time', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 0 });

      expect(container.querySelector('#game-clock-display').textContent).toBe('00:00');
    });

    it('should display placeholder for null elapsed', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'stopped', elapsed: null });

      expect(container.querySelector('#game-clock-display').textContent).toBe('--:--');
    });

    it('should add clock-running class when running', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 60 });

      const display = container.querySelector('#game-clock-display');
      expect(display.classList.contains('clock-running')).toBe(true);
    });

    it('should add clock-paused class when paused', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'paused', elapsed: 60 });

      expect(container.querySelector('#game-clock-display').classList.contains('clock-paused')).toBe(true);
    });

    it('should replace clock classes on state change', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 60 });
      renderer.renderGameClock({ state: 'paused', elapsed: 65 });

      const display = container.querySelector('#game-clock-display');
      expect(display.classList.contains('clock-paused')).toBe(true);
      expect(display.classList.contains('clock-running')).toBe(false);
    });

    it('should skip update when nothing changed', () => {
      renderer.render({ name: 'Game', status: 'active' });
      const prev = { state: 'running', elapsed: 60 };
      renderer.renderGameClock(prev);

      // Same state with prev
      renderer.renderGameClock({ state: 'running', elapsed: 60 }, prev);
      // No error, display unchanged
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:00');
    });

    it('should handle missing clock display gracefully', () => {
      renderer.render({ name: 'Game', status: 'ended' }); // No clock in ended
      expect(() => renderer.renderGameClock({ state: 'running', elapsed: 60 })).not.toThrow();
    });
  });

  describe('game clock ticking', () => {
    it('should start ticking when state is running', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 60 });

      expect(container.querySelector('#game-clock-display').textContent).toBe('01:00');

      // Advance 3 seconds
      jest.advanceTimersByTime(3000);

      expect(container.querySelector('#game-clock-display').textContent).toBe('01:03');
    });

    it('should stop ticking when state is paused', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 60 });

      jest.advanceTimersByTime(2000);
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:02');

      // Pause
      renderer.renderGameClock({ state: 'paused', elapsed: 62 });

      jest.advanceTimersByTime(5000);
      // Should not have advanced
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:02');
    });

    it('should resync on new status event', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 60 });

      jest.advanceTimersByTime(5000);
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:05');

      // Backend resync (maybe correcting drift)
      renderer.renderGameClock({ state: 'running', elapsed: 67 });
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:07');
    });

    it('should not tick when stopped', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'stopped', elapsed: 120 });

      jest.advanceTimersByTime(5000);
      expect(container.querySelector('#game-clock-display').textContent).toBe('02:00');
    });
  });

  describe('clock restoration after template swap', () => {
    it('should restore clock state after viewState change', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 90 });
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:30');

      // Template swap: active → paused
      renderer.render({ name: 'Game', status: 'paused' });

      // Clock should be restored
      expect(container.querySelector('#game-clock-display').textContent).toBe('01:30');
    });

    it('should not restore clock when no cached value', () => {
      renderer.render({ name: 'Game', status: 'active' });

      // No renderGameClock called yet — clock shows template default
      expect(container.querySelector('#game-clock-display').textContent).toBe('--:--');
    });
  });

  describe('renderOvertime()', () => {
    it('should show overtime duration', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderOvertime({ overtimeDuration: 15.7 });

      const overtimeContainer = container.querySelector('#session-overtime-container');
      expect(overtimeContainer.style.display).toBe('block');
      expect(container.querySelector('#session-overtime-text').textContent).toBe('+16m');
    });

    it('should hide overtime when duration is zero', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderOvertime({ overtimeDuration: 15 });
      renderer.renderOvertime({ overtimeDuration: 0 });

      expect(container.querySelector('#session-overtime-container').style.display).toBe('none');
    });

    it('should hide overtime when null', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderOvertime(null);

      expect(container.querySelector('#session-overtime-container').style.display).toBe('none');
    });

    it('should handle missing overtime container gracefully', () => {
      renderer.render({ name: 'Game', status: 'paused' }); // No overtime container in paused
      expect(() => renderer.renderOvertime({ overtimeDuration: 5 })).not.toThrow();
    });
  });

  describe('DI and edge cases', () => {
    it('should accept DI container via constructor', () => {
      const customContainer = document.createElement('div');
      const r = new SessionRenderer({ container: customContainer });

      r.render({ name: 'Custom', status: 'active' });
      expect(customContainer.querySelector('.session-status--active')).toBeTruthy();
      r.destroy();
    });

    it('should handle null container gracefully', () => {
      const r = new SessionRenderer({ container: null });
      expect(() => r.render({ name: 'Game', status: 'active' })).not.toThrow();
      r.destroy();
    });

    it('should clean up timer on destroy', () => {
      renderer.render({ name: 'Game', status: 'active' });
      renderer.renderGameClock({ state: 'running', elapsed: 0 });

      renderer.destroy();
      expect(renderer._clockTimer).toBeNull();
    });
  });
});
