/**
 * Per-domain WebSocket message routers
 *
 * Extracted from NetworkedSession._messageHandler's monolithic switch.
 * Each router handles the message types owned by its domain and returns
 * true if it consumed the message, false otherwise.
 *
 * Domain assignments (decision C1):
 *   gameOpsRouter     — transaction data, scores, player scans, group:completed
 *   gameAdminRouter   — session lifecycle, sync:full session section
 *   showControlRouter — display:mode (scoreboard echo)
 *   sharedInfraRouter — sync:full bulk restore, error, service:state (store)
 *
 * Usage: NetworkedSession._messageHandler iterates routers in priority order.
 * A message may pass through multiple routers if it touches multiple domains
 * (sync:full is the primary example — sharedInfraRouter handles bulk restore,
 * gameAdminRouter updates session state, then sharedInfraRouter flushes queue).
 *
 * @module network/messageRouters
 */

/**
 * Game Ops router — transactions, scores, player scans, group completion
 * @param {string} type
 * @param {Object} payload
 * @param {Object} dataManager
 * @param {EventTarget} session - NetworkedSession (for group:completed/scoreboard:page events)
 * @returns {boolean} true if handled
 */
export function gameOpsRouter(type, payload, dataManager, session) {
  switch (type) {
    case 'score:adjusted':
      if (payload.teamScore) {
        dataManager.updateTeamScoreFromBackend(payload.teamScore);
      }
      return true;

    case 'transaction:new':
      if (payload.transaction) {
        dataManager.addTransactionFromBroadcast(payload.transaction);
      }
      if (payload.teamScore) {
        dataManager.updateTeamScoreFromBackend(payload.teamScore);
      }
      return true;

    case 'transaction:deleted':
      if (payload.transactionId) {
        dataManager.removeTransactionFromBroadcast(payload.transactionId);
      }
      if (payload.updatedTeamScore) {
        dataManager.updateTeamScoreFromBackend(payload.updatedTeamScore);
      }
      return true;

    case 'scores:reset':
      dataManager.clearBackendScores();
      return true;

    case 'player:scan':
      dataManager.handlePlayerScan(payload);
      return true;

    case 'group:completed':
      session.dispatchEvent(new CustomEvent('group:completed', { detail: payload }));
      return true;

    case 'scoreboard:page':
      // Echo of GM scoreboard navigation; forwarded for operator toast only.
      session.dispatchEvent(new CustomEvent('scoreboard:page', { detail: payload }));
      return true;

    default:
      return false;
  }
}

/**
 * Shared-infra router — sync:full bulk restore, error events, service:state → StateStore.
 * Also triggers queue sync after sync:full (deferred from _connectedHandler).
 * @param {string} type
 * @param {Object} payload
 * @param {Object} dataManager
 * @param {EventTarget} session
 * @param {Object|null} store - StateStore (null in standalone)
 * @param {Object|null} services - { queueManager, client }
 * @param {Function} handleSessionBoundary
 * @returns {boolean} true if handled (fully or partially — sync:full always returns true)
 */
export function sharedInfraRouter(type, payload, dataManager, session, store, services, handleSessionBoundary) {
  switch (type) {
    case 'sync:full': {
      // Session boundary detection
      handleSessionBoundary(payload.session?.id);

      // Restore scanned tokens
      if (payload.deviceScannedTokens) {
        dataManager.setScannedTokensFromServer(payload.deviceScannedTokens);
      }

      // Sync scores and transactions
      if (payload.scores) {
        payload.scores.forEach(s => dataManager.updateTeamScoreFromBackend(s));
      }
      if (payload.recentTransactions) {
        if (typeof dataManager.setTransactions === 'function') {
          dataManager.setTransactions(payload.recentTransactions);
        } else {
          payload.recentTransactions.forEach(tx => dataManager.addTransactionFromBroadcast(tx));
        }
      }

      // Sync player scans
      if (payload.playerScans) {
        dataManager.setPlayerScansFromServer(payload.playerScans);
      }

      // Update session state
      if (payload.session) {
        dataManager.updateSessionState(payload.session);
      } else if ('session' in payload && payload.session === null) {
        dataManager.updateSessionState(null);
      }

      // Populate StateStore from sync:full (authoritative snapshot — use replace())
      if (store) {
        if (payload.music) store.replace('music', payload.music);
        if (payload.serviceHealth) store.replace('health', payload.serviceHealth);
        if (payload.environment?.bluetooth) store.replace('bluetooth', payload.environment.bluetooth);
        if (payload.environment?.audio) store.replace('audio', payload.environment.audio);
        if (payload.environment?.lighting) store.replace('lighting', payload.environment.lighting);
        if (payload.gameClock) store.replace('gameclock', payload.gameClock);
        if (payload.cueEngine) store.replace('cueengine', payload.cueEngine);
        if (payload.heldItems) store.replace('held', { items: payload.heldItems });
        if (payload.videoStatus) store.replace('video', payload.videoStatus);
        if (payload.sound) store.replace('sound', payload.sound);
      }

      // Restore display mode (routes to MonitoringDisplay via client re-emit)
      if (payload.displayStatus && services?.client) {
        services.client.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'display:mode', payload: { mode: payload.displayStatus.currentMode } },
        }));
      }

      // Queue reconciliation and flush (TQ-6: deferred until after server state applied)
      if (services?.queueManager) {
        if (Array.isArray(payload.deviceScannedTokens)) {
          services.queueManager.reconcileWithServerState(payload.deviceScannedTokens);
        }
        services.queueManager.syncQueue();
      }

      return true;
    }

    case 'error': {
      // AUTH-7: post-connection auth failures → auth:required + token clear
      const code = payload?.code;
      if (typeof code === 'string' && (code.startsWith('AUTH_') || code === 'PERMISSION_DENIED')) {
        try { localStorage.removeItem('aln_auth_token'); } catch (_e) { /* private mode */ }
        session.dispatchEvent(new CustomEvent('auth:required'));
      }
      session.dispatchEvent(new CustomEvent('backend:error', {
        detail: { code, message: payload?.message },
      }));
      return true;
    }

    case 'service:state':
      // All service domain state → StateStore (incremental update)
      if (store && payload.domain && payload.state) {
        store.update(payload.domain, payload.state);
      }
      return true;

    default:
      return false;
  }
}

/**
 * Game Admin router — session lifecycle updates.
 * sync:full session section is handled by sharedInfraRouter (which calls
 * dataManager.updateSessionState). This router handles the incremental
 * session:update message only. (session:overtime arrives on the wire —
 * see orchestratorClient messageTypes — but no router consumes it yet;
 * overtime visibility is the game-clock display's job.)
 * @param {string} type
 * @param {Object} payload
 * @param {Object} dataManager
 * @param {Function} handleSessionBoundary
 * @returns {boolean}
 */
export function gameAdminRouter(type, payload, dataManager, handleSessionBoundary) {
  switch (type) {
    case 'session:update':
      if (payload.status !== 'ended') {
        handleSessionBoundary(payload.id);
      }
      dataManager.updateSessionState(payload);
      return true;

    default:
      return false;
  }
}

/**
 * Show Control router — display mode messages (scoreboard echo, idle loop).
 * The actual scoreboard:page echo is forwarded as a CustomEvent in gameOpsRouter
 * (since it's also a Game Ops concern — scoreboard navigation). Display mode
 * state changes are a Show Control concern and are handled here as a pass-through
 * to MonitoringDisplay via the client re-emit pattern.
 *
 * Note: display:mode is re-emitted by sharedInfraRouter for the sync:full restore
 * path. Live display:mode events (incremental) arrive directly and are handled
 * by MonitoringDisplay's own message handler — networkedSession does not need
 * to intercept them here. This router is a placeholder for future Show Control
 * coordination at the session level.
 * @returns {boolean}
 */
export function showControlRouter(_type, _payload) {
  // No session-level Show Control routing needed currently.
  // display:mode is consumed by MonitoringDisplay._handleMessage directly.
  return false;
}
