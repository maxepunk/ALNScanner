/**
 * @jest-environment jsdom
 *
 * F-GMS-04 — Hostile-input escaping at user/NFC-controlled interpolation sites.
 *
 * Team names are explicitly unvalidated free text ("O'Brien & Co." is valid)
 * and tokenId/group/rfid/memoryType can carry arbitrary NDEF text from any
 * NFC tag. Every innerHTML interpolation of those values must escape HTML.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UIManager } from '../../../src/ui/uiManager.js';
import { App } from '../../../src/app/app.js';
import { GameOpsRenderer } from '../../../src/ui/renderers/GameOpsRenderer.js';

const XSS_PAYLOAD = '<img src=x onerror="window.__pwned=true">';
const QUOTE_PAYLOAD = `O'Brien & "Co." <b>bold</b>`;

describe('XSS escaping (F-GMS-04)', () => {
  describe('UIManager.renderScoreboard', () => {
    let uiManager;
    let mockDataManager;

    beforeEach(() => {
      document.body.innerHTML = '<div id="scoreboardContainer"></div>';

      mockDataManager = {
        backendScores: new Map(),
        SCORING_CONFIG: {
          BASE_VALUES: { 1: 10000, 3: 50000 },
          TYPE_MULTIPLIERS: { Personal: 1, Technical: 5, UNKNOWN: 0 }
        },
        getTeamScores: jest.fn(() => [
          { teamId: XSS_PAYLOAD, score: 5000, tokenCount: 1, isFromBackend: false },
          { teamId: QUOTE_PAYLOAD, score: 1000, tokenCount: 1, isFromBackend: false }
        ]),
        calculateTokenValue: jest.fn(() => 5000),
        parseGroupInfo: jest.fn(() => ({ name: 'G', multiplier: 1 }))
      };

      uiManager = new UIManager({
        settings: { mode: 'blackmarket' },
        dataManager: mockDataManager,
        sessionModeManager: { isNetworked: () => false, isStandalone: () => true },
        app: {}
      });
    });

    it('escapes teamId in scoreboard entry text (no element injection)', () => {
      uiManager.renderScoreboard();

      const container = document.getElementById('scoreboardContainer');
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('b')).toBeNull();
      // Visible text preserved verbatim
      expect(container.textContent).toContain('O\'Brien & "Co." <b>bold</b>');
    });

    it('escapes teamId in the data-arg attribute (quotes cannot break out)', () => {
      uiManager.renderScoreboard();

      const entries = document.querySelectorAll('.scoreboard-entry');
      expect(entries).toHaveLength(2);
      // getAttribute returns the decoded value — round-trip intact means the
      // quote/markup stayed INSIDE the attribute instead of breaking out
      expect(entries[0].getAttribute('data-arg')).toBe(XSS_PAYLOAD);
      expect(entries[1].getAttribute('data-arg')).toBe(QUOTE_PAYLOAD);
    });
  });

  describe('UIManager.renderTokenCard', () => {
    let uiManager;

    beforeEach(() => {
      document.body.innerHTML = '<div id="cardSink"></div>';
      uiManager = new UIManager({
        settings: { mode: 'blackmarket' },
        dataManager: {
          backendScores: new Map(),
          SCORING_CONFIG: {
            BASE_VALUES: { 3: 50000 },
            TYPE_MULTIPLIERS: { Technical: 5, UNKNOWN: 0 }
          },
          calculateTokenValue: jest.fn(() => 0),
          parseGroupInfo: jest.fn(() => ({ name: 'x', multiplier: 1 }))
        },
        sessionModeManager: { isNetworked: () => false, isStandalone: () => true },
        app: {}
      });
    });

    it('escapes NFC-controlled group, rfid and memoryType', () => {
      // Unknown token: group is "Unknown: <raw NDEF text>" — fully attacker-controlled
      const hostileToken = {
        id: 't1',
        rfid: `${XSS_PAYLOAD}rfid`,
        memoryType: `${XSS_PAYLOAD}type`,
        group: `Unknown: ${XSS_PAYLOAD}`,
        valueRating: 0,
        isUnknown: true
      };

      const html = uiManager.renderTokenCard(hostileToken, false, true, false);
      const sink = document.getElementById('cardSink');
      sink.innerHTML = html;

      expect(sink.querySelector('img')).toBeNull();
      expect(sink.textContent).toContain('rfid');
      expect(sink.textContent).toContain('type');
    });

    it('escapes memoryType in the calculation text of known tokens', () => {
      const hostileToken = {
        id: 't2',
        rfid: 'ok001',
        memoryType: XSS_PAYLOAD,
        group: 'Group (x2)',
        valueRating: 3,
        isUnknown: false
      };

      const html = uiManager.renderTokenCard(hostileToken, false, false, false);
      const sink = document.getElementById('cardSink');
      sink.innerHTML = html;

      expect(sink.querySelector('img')).toBeNull();
    });
  });

  describe('UIManager.renderTeamDetails group headers', () => {
    it('escapes group displayName in completed and in-progress headers', () => {
      document.body.innerHTML = `
        <div id="teamDetailsTitle"></div>
        <div id="teamDetailsSummary"></div>
        <div id="teamDetailsContainer"></div>
        <div id="teamBaseScore"></div>
        <div id="teamBonusScore"></div>
        <div id="teamTotalScore"></div>
        <div id="teamAdminAdjustmentsSection"></div>
        <div id="teamInterventionControls"></div>
      `;

      const uiManager = new UIManager({
        settings: { mode: 'blackmarket' },
        dataManager: {
          backendScores: new Map(),
          SCORING_CONFIG: {
            BASE_VALUES: { 3: 50000 },
            TYPE_MULTIPLIERS: { Technical: 5, UNKNOWN: 0 }
          },
          getEnhancedTeamTransactions: jest.fn(() => ({
            hasCompletedGroups: true,
            completedGroups: [{
              displayName: `${XSS_PAYLOAD} Logs`,
              bonusValue: 1000, multiplier: 2, tokens: []
            }],
            hasIncompleteGroups: true,
            incompleteGroups: [{
              displayName: `${QUOTE_PAYLOAD} Files`,
              progress: '1/2', percentage: 50, tokens: []
            }],
            hasUngroupedTokens: false,
            hasUnknownTokens: false
          })),
          calculateTeamScoreWithBonuses: jest.fn(() => ({ baseScore: 0, bonusScore: 0, totalScore: 0 })),
          calculateTokenValue: jest.fn(() => 0),
          parseGroupInfo: jest.fn(() => ({ name: 'x', multiplier: 1 }))
        },
        sessionModeManager: { isNetworked: () => false, isStandalone: () => true },
        app: {}
      });

      uiManager.renderTeamDetails('Team A', []);

      const container = document.getElementById('teamDetailsContainer');
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('b')).toBeNull();
      expect(container.textContent).toContain('Logs');
      expect(container.textContent).toContain('O\'Brien & "Co." <b>bold</b> Files');
    });
  });

  describe('App.showDuplicateError', () => {
    it('escapes NFC-controlled tokenId injected into resultStatus innerHTML', () => {
      document.body.innerHTML = `
        <div id="resultStatus"></div>
        <span id="resultRfid"></span>
        <span id="resultType"></span>
        <span id="resultGroup"></span>
        <span id="resultValue"></span>
      `;

      const app = new App({
        debug: { log: jest.fn() },
        uiManager: { showScreen: jest.fn() },
        settings: {},
        tokenManager: {},
        dataManager: {},
        nfcHandler: {}
      });

      app.showDuplicateError(XSS_PAYLOAD);

      const statusEl = document.getElementById('resultStatus');
      expect(statusEl.querySelector('img')).toBeNull();
      // tokenId still legible to the operator
      expect(statusEl.textContent).toContain('ID: <img src=x onerror="window.__pwned=true">');
    });
  });

  describe('GameOpsRenderer.renderGameActivity token cards', () => {
    const ATTR_BREAKOUT_PAYLOAD = '" onmouseover="x';

    const activityToken = (tokenId) => ({
      tokenId,
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
      events: [],
      status: 'available',
      discoveredByPlayers: false,
      potentialValue: 250000
    });

    it('contains hostile tokenId inside the data-token-id attribute (no breakout)', () => {
      document.body.innerHTML = '<div id="activitySink"></div>';
      const container = document.getElementById('activitySink');

      const renderer = new GameOpsRenderer({
        dataManager: {
          getGameActivity: jest.fn(() => ({
            tokens: [activityToken(ATTR_BREAKOUT_PAYLOAD), activityToken(XSS_PAYLOAD)],
            stats: { totalTokens: 2, available: 2, claimed: 0, claimedWithoutDiscovery: 0 }
          }))
        },
        sessionModeManager: { isNetworked: () => true, isStandalone: () => false },
        app: {}
      });

      renderer.renderGameActivity(container, { showSummary: false, showFilters: false });

      // Rendered HTML carries the ESCAPED form — the quote never closes the attribute
      expect(container.innerHTML).toContain('&quot; onmouseover=&quot;x');

      const cards = container.querySelectorAll('.token-card');
      expect(cards).toHaveLength(2);

      // getAttribute returns the decoded value — round-trip intact means the
      // quote/markup stayed INSIDE the attribute instead of breaking out
      expect(cards[0].getAttribute('data-token-id')).toBe(ATTR_BREAKOUT_PAYLOAD);
      expect(cards[1].getAttribute('data-token-id')).toBe(XSS_PAYLOAD);

      // No injected elements or stray event-handler attributes
      expect(container.querySelector('img')).toBeNull();
      cards.forEach(card => expect(card.hasAttribute('onmouseover')).toBe(false));
    });
  });

  describe('GameOpsRenderer.showGroupCompletionNotification', () => {
    it('escapes hostile teamId and groupId in the group-completion toast', () => {
      jest.useFakeTimers();
      document.body.innerHTML = '';

      const renderer = new GameOpsRenderer({
        dataManager: {},
        sessionModeManager: { isNetworked: () => true, isStandalone: () => false },
        app: {}
      });

      renderer.showGroupCompletionNotification({
        teamId: XSS_PAYLOAD,
        groupId: QUOTE_PAYLOAD,
        bonus: 60000,
        multiplier: 5
      });

      expect(document.body.querySelector('img')).toBeNull();
      expect(document.body.querySelector('b')).toBeNull();
      // Both values still legible to the operator
      expect(document.body.textContent).toContain('<img src=x onerror="window.__pwned=true">');
      expect(document.body.textContent).toContain('O\'Brien & "Co." <b>bold</b>');

      // Drain auto-dismiss timers so the toast removes itself cleanly
      jest.runAllTimers();
      expect(document.body.children).toHaveLength(0);
      jest.useRealTimers();
    });
  });
});
