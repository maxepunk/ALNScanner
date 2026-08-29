/**
 * Initialization Steps - Application Bootstrap Sequence
 * ES6 Module
 *
 * Provides 11-phase initialization sequence for ALNScanner application.
 * Coordinates loading of all app modules with proper dependency ordering.
 *
 * Phase 0: Show loading screen
 * Phase 1A: Token Database Loading
 * Phase 1B: URL Parameter Mode Override
 * Phase 1C: Connection Restoration Logic (with State Validation)
 * Phase 1D: Initialize UIManager
 * Phase 1E: Create SessionModeManager
 * Phase 1F: Initialize view controller
 * Phase 1G: Load settings
 * Phase 1H: Load DataManager
 * Phase 1I: Detect NFC support
 * Phase 1J: Register service worker
 */

import Debug from '../utils/debug.js';
import { isTokenValid } from '../utils/jwtUtils.js';
import stateValidationService from '../services/StateValidationService.js';
import packLoader from '../core/packLoader.js';
import { SCORING_SOURCE } from '../core/scoring.js';
import { wireModeIds, defaultModeId, entityLabel, entityLabelPlural } from '../core/modeSemantics.js';
import { getString } from '../core/strings.js';
import { formatCurrency } from '../utils/formatCurrency.js';

/**
 * Initialize UIManager
 * Simple wrapper for UIManager.init()
 *
 * @param {Object} uiManager - UIManager instance
 */
export function initializeUIManager(uiManager) {
  uiManager.init();
}

/**
 * Create SessionModeManager singleton
 * Returns instance for storage on app object (no window global assignment)
 * CRITICAL: Must be called before viewController.init()
 *
 * @param {Function} SessionModeManagerClass - SessionModeManager constructor
 * @returns {Object} The created SessionModeManager instance
 */
export function createSessionModeManager(SessionModeManagerClass) {
  const instance = new SessionModeManagerClass();
  Debug.log('SessionModeManager initialized');
  return instance;
}

/**
 * Initialize view controller
 * Depends on window.sessionModeManager existing
 *
 * @param {Object} viewController - ViewController instance
 */
export function initializeViewController(viewController) {
  viewController.init();
}

/**
 * Load settings from localStorage
 *
 * @param {Object} settings - Settings object
 */
export function loadSettings(settings) {
  settings.load();
}

/**
 * Initialize DataManager UI state (data loading deferred to sync:full / loadLocalSession)
 */
export function loadDataManager(dataManager, uiManager) {
  uiManager.updateHistoryBadge();
}

/**
 * Detect NFC support
 *
 * @param {Object} nfcHandler - NFCHandler instance
 * @returns {Promise<boolean>} True if NFC is supported
 */
export async function detectNFCSupport(nfcHandler) {
  const supported = await nfcHandler.init();
  Debug.log(`NFC support: ${supported}`);
  return supported;
}

/**
 * Register service worker for PWA functionality
 *
 * @param {Object} navigatorObj - Navigator object
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<boolean>} True if registration succeeded
 */
export async function registerServiceWorker(navigatorObj, uiManager) {
  if (!('serviceWorker' in navigatorObj)) {
    return false;
  }

  try {
    // Use dynamic base path to support orchestrator subdirectory serving
    // If served from https://IP:3000/gm-scanner/, this resolves to /gm-scanner/sw.js
    // If served locally, resolves to /sw.js or ./sw.js
    const swPath = new URL('sw.js', window.location.href).pathname;

    const registration = await navigatorObj.serviceWorker.register(swPath);
    Debug.log('Service Worker registered successfully');
    console.log('Service Worker registration successful:', registration.scope);
    return true;
  } catch (error) {
    // Check if this is an SSL certificate error (expected with self-signed certs)
    const isSSLError = error.name === 'SecurityError' &&
      error.message.includes('SSL certificate error');

    if (isSSLError) {
      // SSL errors are expected when using self-signed certificates
      // Service Worker provides offline PWA functionality, not critical for networked mode
      Debug.log('Service Worker registration skipped due to SSL certificate (self-signed cert)');
      console.warn('Service Worker not available due to self-signed certificate. Offline features disabled.');
      return false;
    } else {
      // Non-critical: a missing/failed service worker only disables offline PWA
      // features. NEVER surface this to the operator mid-show (SW-3) — it is noise
      // that erodes trust and can mask real errors.
      Debug.log(`Service Worker registration failed: ${error.message}`, true);
      console.warn('Service Worker registration failed:', error);
      return false;
    }
  }
}

/**
 * Load token database from TokenManager
 *
 * @param {Object} tokenManager - TokenManager instance
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<boolean>} True if database loaded successfully
 * @throws {Error} If database load fails
 */
export async function loadTokenDatabase(tokenManager, uiManager) {
  const dbLoaded = await tokenManager.loadDatabase();

  if (!dbLoaded) {
    const errorMsg = 'CRITICAL: Token database failed to load. Cannot initialize scanner.';
    Debug.log(errorMsg, true);
    uiManager.showError(errorMsg);
    throw new Error('Token database initialization failed');
  }

  Debug.log('Token database loaded successfully');
  renderPackInfo();
  applyPackStringsToDom();
  return true;
}

/**
 * Slice 3a: reword the static shell from the ACTIVE pack's strings
 * sidecar (applied in tokenManager.loadDatabase just before this runs).
 * The shell ships the baked ALN wording, so for ALN this is a no-op
 * rewrite; a second game's pack rebrands with NO rebuild. Runtime
 * re-renders (uiManager stats toggle, EvidencePickerRenderer) read the
 * same getString() source, so the wording stays consistent after this
 * first pass. Null-guarded per element (headless harnesses, partial DOM).
 */
export function applyPackStringsToDom(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const title = getString('scanner.appTitle');
  if (title) doc.title = title;
  const prompt = doc.getElementById('scanPrompt');
  if (prompt) prompt.textContent = getString('scanner.scanPrompt');
  const valueLabel = doc.getElementById('teamValueLabel');
  if (valueLabel) valueLabel.textContent = getString('scanner.statLabels.totalValue');
  // History screen's summary label (static, never mode-toggled — same
  // wording key; review found it as a missed consumer)
  const historyLabel = doc.getElementById('historyValueLabel');
  if (historyLabel) historyLabel.textContent = getString('scanner.statLabels.totalValue');
  const evidenceHint = doc.getElementById('scoreboard-evidence-hint');
  if (evidenceHint) evidenceHint.textContent = getString('scoreboard.emptyEvidence');
  // Slice 3b: the static money seeds re-render under the PACK's money
  // spec (same static-shell rewrite class as the wording above) — the
  // renderers overwrite them on first update, but a pack with a
  // non-dollar spec must never flash '$0'.
  for (const id of ['teamBaseScore', 'teamBonusScore', 'teamTotalScore']) {
    const el = doc.getElementById(id);
    if (el) el.textContent = formatCurrency(0);
  }

  // Q1 (owner ruling 2026-08-22): the entity NOUN in the static shell is
  // pack-declared via game.json entities.label (applied by
  // applyPackEntities in the same loadDatabase pass) — ALN rebrands
  // Team → Account. The shell ships the baked Team/Teams wording, so
  // packless this is a byte-identical rewrite.
  const noun = entityLabel();
  const nounPlural = entityLabelPlural();
  const nounLower = noun.toLowerCase();
  const setText = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('teamEntryTitle', `Select ${noun}`);
  setText('currentTeamNoun', noun);
  setText('uniqueTeamsLabel', nounPlural);
  setText('scoreboardSubtitle', `${noun} Rankings`);
  setText('adminScoreboardTitle', `${noun} Scores`);
  // Rewritten per-entity by renderTeamDetails; this is the pre-open static.
  setText('teamDetailsTitle', `${noun} Details`);
  const teamNameInput = doc.getElementById('teamNameInput');
  if (teamNameInput) teamNameInput.placeholder = `Enter ${nounLower} name...`;
  doc.querySelectorAll('button[data-action="app.finishTeam"]').forEach((btn) => {
    btn.textContent = `Finish ${noun}`;
  });
  // The team-list empty state is CSS-rendered (.team-list:empty::after
  // reads this custom property); JSON.stringify yields a valid quoted
  // CSS <string> for any normalized label.
  if (doc.documentElement?.style?.setProperty) {
    doc.documentElement.style.setProperty(
      '--entity-empty-team-list', JSON.stringify(`No ${nounPlural.toLowerCase()} yet`));
  }
}

/**
 * A2 staleness visibility: surface the loaded pack in the settings header
 * as `pack <version> (<hash-prefix>) · <source>`, with a warning badge
 * when running from the build-time bundle (never refreshed). Null-guarded
 * on both pack state and DOM (headless harnesses have neither).
 */
export function renderPackInfo(loader = packLoader, scoringSource = undefined) {
  const info = loader.getActivePack();
  if (!info || typeof document === 'undefined') return;
  const line = document.getElementById('packInfoLine');
  if (!line) return;
  const display = document.getElementById('packInfoDisplay');
  const badge = document.getElementById('packBundledBadge');
  const hashPrefix = info.contentHash
    ? info.contentHash.replace('sha256:', '').slice(0, 8)
    : 'no-hash';
  // Scoring provenance rides the same line: a network-sourced pack can
  // still be scoring on the baked shim (pack ships no game.json) — the
  // operator should see that here, not only in the console warn.
  const source = scoringSource !== undefined ? scoringSource : SCORING_SOURCE;
  const scoringNote = source === 'baked' ? ' · scoring: baked' : '';
  if (display) display.textContent = `${info.version || 'unknown'} (${hashPrefix}) · ${info.source}${scoringNote}`;
  if (badge) badge.style.display = info.source === 'bundled' ? '' : 'none';
  line.style.display = '';
}

/**
 * Validate the persisted station mode against the ACTIVE pack's declared
 * modes (slice 1, design §6). Runs after Phase 1A (the pack's mode table
 * is applied there) and before the URL override. A stale saved id — the
 * pack changed underneath a saved setting, or a pre-pack device meeting a
 * non-ALN pack — resets to the pack's FIRST declared mode with a LOUD log.
 * The settings.js 'detective' seed is only ever a legacy starting value;
 * this step is what makes the effective mode pack-driven.
 *
 * @param {Object} settings - Settings object with mode and save()
 * @returns {boolean} True when the persisted mode was stale and reset
 */
export function validateSettingsMode(settings) {
  const valid = wireModeIds();
  if (valid.includes(settings.mode)) return false;

  const fallback = defaultModeId();
  Debug.log(
    `STALE MODE RESET: persisted mode '${settings.mode}' is not declared by the active pack ` +
    `(valid: ${valid.join(', ')}) — resetting to '${fallback}'`, true);
  settings.mode = fallback;
  settings.save();
  return true;
}

/**
 * Apply URL parameter mode override (slice 1: any pack-declared mode id;
 * the historical ?mode=black-market alias still maps to 'blackmarket').
 * An id the active pack does not declare is REFUSED with a loud log —
 * never applied blind.
 *
 * @param {string} locationSearch - window.location.search (query string)
 * @param {Object} settings - Settings object with mode and save()
 * @returns {boolean} True if mode was applied, false otherwise
 */
export function applyURLModeOverride(locationSearch, settings) {
  const urlParams = new URLSearchParams(locationSearch);
  let modeParam = urlParams.get('mode');
  if (!modeParam) return false;

  if (modeParam === 'black-market') modeParam = 'blackmarket';

  if (!wireModeIds().includes(modeParam)) {
    Debug.log(`URL mode override REFUSED: '${modeParam}' is not declared by the active pack (valid: ${wireModeIds().join(', ')})`, true);
    return false;
  }

  settings.mode = modeParam;
  settings.save();
  Debug.log(`Station mode set to ${modeParam} via URL parameter`);
  return true;
}

/**
 * Sync the mode display to the effective settings (Phase 1B follow-up)
 *
 * index.html hardcodes the Detective pill and hides the scoreboard button;
 * the only other caller of updateModeDisplay is the manual toggle. Without
 * this step, any load where the persisted (or URL-overridden) mode is
 * blackmarket scores correctly while DISPLAYING "Detective Mode" until the
 * GM happens to click the toggle.
 *
 * @param {Object} settings - Settings object (effective mode source of truth)
 * @param {Object} uiManager - UIManager instance
 */
export function syncModeDisplay(settings, uiManager) {
  uiManager.updateModeDisplay(settings.mode);
  Debug.log(`Mode display synced to effective mode: ${settings.mode}`);
}

/**
 * Determine initial screen based on connection restoration logic
 * Pure function - no side effects, only decision logic
 *
 * NOTE: For networked mode, use validateAndDetermineInitialScreen() instead
 * to perform full state validation (token + orchestrator + session).
 *
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @returns {Object} Decision object with {screen, action, savedMode}
 */
export function determineInitialScreen(sessionModeManager) {
  const savedMode = sessionModeManager.restoreMode();

  // Case 1: No saved mode (first-time user)
  if (!savedMode) {
    return { screen: 'gameModeScreen', action: null, savedMode: null };
  }

  // Case 2: Standalone mode - initialize and go to team entry
  if (savedMode === 'standalone') {
    return { screen: 'teamEntry', action: 'initStandalone', savedMode };
  }

  // Case 3: Networked mode - check if we have valid token for auto-connect
  if (savedMode === 'networked') {
    const token = localStorage.getItem('aln_auth_token');

    if (token && isTokenValid(token)) {
      // Valid token - try auto-connect
      return { screen: 'loading', action: 'autoConnect', savedMode };
    } else {
      // No valid token - need to show wizard
      return { screen: 'gameModeScreen', action: 'clearModeAndShowWizard', savedMode };
    }
  }

  // Fallback
  return { screen: 'gameModeScreen', action: null, savedMode: null };
}

/**
 * Validate system state and determine initial screen for networked mode
 * Async version that performs full validation before deciding action.
 *
 * Validates orchestrator + session in addition to token.
 * If any validation fails, clears stale state and shows mode selection screen.
 *
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @returns {Promise<Object>} Decision object with {screen, action, savedMode, validationResult}
 */
export async function validateAndDetermineInitialScreen(sessionModeManager) {
  const savedMode = sessionModeManager.restoreMode();

  // Case 1: No saved mode (first-time user)
  if (!savedMode) {
    return { screen: 'gameModeScreen', action: null, savedMode: null, validationResult: null };
  }

  // Case 2: Standalone mode - no validation needed
  if (savedMode === 'standalone') {
    return { screen: 'teamEntry', action: 'initStandalone', savedMode, validationResult: null };
  }

  // Case 3: Networked mode - perform full validation
  if (savedMode === 'networked') {
    const orchestratorUrl = localStorage.getItem('aln_orchestrator_url');

    // Validate full system state: token + orchestrator + session
    Debug.log('[InitSteps] Performing full state validation for networked mode...');
    const validationResult = await stateValidationService.validateAll(orchestratorUrl);

    if (validationResult.valid) {
      // All validations passed - try auto-connect
      Debug.log('[InitSteps] Validation passed - attempting auto-connect');
      return { screen: 'loading', action: 'autoConnect', savedMode, validationResult };
    } else {
      // Validation failed - clear stale state and show wizard
      Debug.log(`[InitSteps] Validation failed: ${validationResult.reason}`);
      stateValidationService.clearStaleState();
      return {
        screen: 'gameModeScreen',
        action: 'clearModeAndShowWizard',
        savedMode,
        validationResult
      };
    }
  }

  // Fallback
  return { screen: 'gameModeScreen', action: null, savedMode: null, validationResult: null };
}


/**
 * Apply initial screen decision (executes side effects)
 * Handles UI changes, mode clearing, wizard display, and auto-connect
 *
 * @param {Object} decision - Decision from determineInitialScreen()
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @param {Object} uiManager - UIManager instance
 * @param {Function} showWizardFn - showConnectionWizard function
 * @param {Function} initNetworkedModeFn - Async function to initialize networked mode (from app._initializeNetworkedMode)
 * @param {Function} initStandaloneModeFn - Async function to fully initialize standalone mode (from app._initializeStandaloneMode)
 */
export async function applyInitialScreenDecision(decision, sessionModeManager, uiManager, showWizardFn, initNetworkedModeFn = null, initStandaloneModeFn = null) {
  Debug.log(`Applying screen decision: screen=${decision.screen}, action=${decision.action}`);

  if (decision.action === 'clearModeAndShowWizard') {
    // Networked mode restored but no valid token - clear and show wizard
    Debug.log('Networked mode restored but no valid token - showing wizard');
    sessionModeManager.clearMode();
    uiManager.showScreen(decision.screen);
    showWizardFn();

  } else if (decision.action === 'initStandalone') {
    // Standalone mode restore — must run the FULL standalone initializer
    // (storage strategy, registry wiring, body class, team entry), not just
    // setMode + showScreen. F-GMS-01 / C7: anything less bricks scanning
    // after a mid-show reload.
    Debug.log('Restoring standalone mode');
    if (initStandaloneModeFn) {
      // preserveSession: keep the persisted standalone session across reload
      await initStandaloneModeFn({ preserveSession: true });
    } else {
      // Legacy fallback (no initializer injected)
      sessionModeManager.setMode('standalone');
      uiManager.showScreen(decision.screen);
    }

  } else if (decision.action === 'autoConnect') {
    // Networked mode with valid token - attempt auto-connect
    Debug.log('Valid token found - attempting auto-connect');
    uiManager.showScreen(decision.screen); // Show loading screen

    try {
      // Lock networked mode and initialize NetworkedSession
      sessionModeManager.setMode('networked');

      if (initNetworkedModeFn) {
        await initNetworkedModeFn();
        Debug.log('Auto-connect successful - showing team entry');
        uiManager.showScreen('teamEntry');
      } else {
        throw new Error('initNetworkedModeFn not provided for auto-connect');
      }
    } catch (error) {
      Debug.log('Auto-connect failed - showing wizard');
      console.error('Auto-connect error:', error);
      sessionModeManager.clearMode();
      uiManager.showScreen('gameModeScreen');
      showWizardFn();
    }

  } else {
    // Simple screen change, no special action needed
    Debug.log(`Showing initial screen: ${decision.screen}`);
    uiManager.showScreen(decision.screen);
  }
}

/**
 * Show loading screen with paint delay
 * Ensures loading screen is visible before JavaScript continues executing
 *
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<void>}
 */
export async function showLoadingScreen(uiManager) {
  uiManager.showScreen('loading');
  // Ensure browser paints the loading screen before continuing
  await new Promise(resolve => setTimeout(resolve, 100));
  Debug.log('Loading screen displayed');
}

// Default export for convenience
export default {
  initializeUIManager,
  createSessionModeManager,
  initializeViewController,
  loadSettings,
  loadDataManager,
  detectNFCSupport,
  registerServiceWorker,
  loadTokenDatabase,
  renderPackInfo,
  applyPackStringsToDom,
  validateSettingsMode,
  applyURLModeOverride,
  syncModeDisplay,
  determineInitialScreen,
  validateAndDetermineInitialScreen,
  applyInitialScreenDecision,
  showLoadingScreen
};
