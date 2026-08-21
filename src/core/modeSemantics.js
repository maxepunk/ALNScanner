/**
 * Mode semantics — the modes seam, scanner side (Phase 3 A3 slice 1)
 *
 * The scanner asks "what does this mode DO" (per-mode semantics flags from
 * the loaded pack's game.json `modes` block), never "which of the two known
 * modes is this" (string equality on 'blackmarket'/'detective'). Every
 * mode-behavior branch point resolves through this module; the backend
 * carries the mirror seam (backend/src/gameRules/modeSemantics.js) —
 * together they are the mode half of the parity surface.
 *
 * Scanner idiom (matches scoring.js/applyPackScoring): the ACTIVE mode
 * table is module state, applied once at pack load (Phase 1A —
 * tokenManager.loadDatabase calls applyPackModes right after
 * applyPackScoring). Call sites then use the argless helpers.
 *
 * LEGACY SHIM (debt ledger L6, mirrors the backend row): when the loaded
 * pack ships no game.json modes block, resolution falls back to the baked
 * ALN table below with a LOUD once-per-load console warning. Retires when
 * every pack in play ships game.json. The table mirrors
 * ALN-TokenData/game.json's modes block exactly — a drift between them is
 * a bug (the unit suite pins them equal).
 *
 * Unknown-mode semantics at the CLIENT (design §3): resolveMode() returns
 * null for an undeclared id; callers log loudly and DISABLE the affordance
 * (score nothing, count nothing, render the raw id). The server gate is
 * the authority; the client defends in depth.
 */

import Debug from '../utils/debug.js';
import { slugifyId } from '../utils/slugify.js';

// Mirrors ALN-TokenData/game.json `modes` — the pre-pack ALN game, baked.
export const LEGACY_ALN_MODES = Object.freeze([
    Object.freeze({
        id: 'blackmarket',
        label: 'Black Market',
        verb: 'Sell',
        scoringPolicy: 'standard',
        entityRole: 'ledger',
        countsTowardGroups: true,
        displayBehavior: Object.freeze({ surface: 'scoreboard-rankings', when: 'immediate' }),
    }),
    Object.freeze({
        id: 'detective',
        label: 'Detective',
        verb: 'Expose',
        scoringPolicy: 'none',
        entityRole: 'attribution',
        defaultEntity: 'Nova',
        countsTowardGroups: false,
        displayBehavior: Object.freeze({ surface: 'scoreboard-evidence', fields: Object.freeze(['summary', 'owner']), when: 'immediate' }),
    }),
]);

let activeModes = null; // null = shim (legacy ALN table)
let warnedLegacy = false;
let warnedUndrivableModes = new Set();

/**
 * Apply the loaded pack's mode table (Phase 1A, after applyPackScoring).
 * A config without a usable modes block clears to the shim and returns
 * false — the caller's pack line / console then show the truth.
 * @param {Object|null} gameConfig - packLoader's loaded game.json (or null)
 * @returns {boolean} true when pack modes are active, false on the shim
 */
export function applyPackModes(gameConfig) {
    if (gameConfig && Array.isArray(gameConfig.modes) && gameConfig.modes.length > 0) {
        activeModes = gameConfig.modes;
        Debug.log(`[modes] pack mode table active: ${gameConfig.modes.map((m) => m.id).join(', ')}`);
        return true;
    }
    activeModes = null;
    return false;
}

function _modes() {
    if (activeModes) return activeModes;
    if (!warnedLegacy) {
        warnedLegacy = true;
        // Mirrors the scoring shim's loud console warn (same ledger family).
        console.warn(
            '[modes] LEGACY SHIM ACTIVE (debt ledger L6): the loaded pack ships no ' +
            'game.json modes block — mode behavior is running on the baked ALN table. ' +
            'Fine for pre-pack deployments; a real pack should declare its modes.'
        );
    }
    return LEGACY_ALN_MODES;
}

/**
 * Client defense-in-depth (D3s2 review finding): non-consuming ∧
 * countsTowardGroups is refused by the ORCHESTRATOR's activation gate,
 * but a STANDALONE scanner (Pages deploy, bundled pack) never passes
 * that gate — driving the combination here would count non-consumed
 * group presence with undefined semantics. Per the slice-1 client
 * doctrine (log loudly, disable the affordance), the undrivable half is
 * normalized OFF: the mode still works, its claims still don't consume,
 * it just builds no group progress. The backend needs no mirror — a pack
 * declaring this never activates there.
 */
function _drivableCountsTowardGroups(mode) {
    const counts = mode.countsTowardGroups === true;
    if (counts && mode.claims === 'non-consuming') {
        if (!warnedUndrivableModes.has(mode.id)) {
            warnedUndrivableModes.add(mode.id);
            console.warn(
                `[modeSemantics] mode '${mode.id}': claims 'non-consuming' with countsTowardGroups ` +
                'is not driveable by this engine yet — driving it with countsTowardGroups: false ' +
                "(the orchestrator's activation gate refuses this pack; fix the declaration)"
            );
        }
        return false;
    }
    return counts;
}

/**
 * Resolve a mode id to its normalized semantics record, or null when the
 * active table does not declare it. The record always carries every flag:
 * absent displayBehavior normalizes to {surface:'none'}, absent fields to
 * [], absent `when` to 'immediate' — identical to the backend resolver.
 * @param {string} modeId
 * @returns {Object|null}
 */
export function resolveMode(modeId) {
    const mode = _modes().find((m) => m.id === modeId);
    if (!mode) return null;

    const db = mode.displayBehavior || {};
    return {
        id: mode.id,
        label: mode.label,
        verb: mode.verb || null,
        scoringPolicy: mode.scoringPolicy,
        entityRole: mode.entityRole,
        defaultEntity: mode.defaultEntity || null,
        countsTowardGroups: _drivableCountsTowardGroups(mode),
        claims: mode.claims === undefined ? 'consuming' : mode.claims,
        displayBehavior: {
            surface: db.surface || 'none',
            fields: Array.isArray(db.fields) ? [...db.fields] : [],
            when: db.when || 'immediate',
        },
    };
}

/** The valid mode ids, in the pack's declaration order. */
export function wireModeIds() {
    return _modes().map((m) => m.id);
}

/** The pack's first declared mode — the reset target for a stale saved mode. */
export function defaultModeId() {
    return _modes()[0].id;
}

// ── Call-site sugar (keeps the 31 migrated sites one-liners) ───────────────

/** Does this mode pay token value? (scoringPolicy === 'standard') */
export function isScoringMode(modeId) {
    return resolveMode(modeId)?.scoringPolicy === 'standard';
}

/** Do this mode's claims build group progress? */
export function countsTowardGroups(modeId) {
    return resolveMode(modeId)?.countsTowardGroups === true;
}

/** Does this mode publish to the evidence surface? */
export function isEvidenceMode(modeId) {
    return resolveMode(modeId)?.displayBehavior.surface === 'scoreboard-evidence';
}

/**
 * CSS classes for a mode (A3 slice 3c, R-3c-1): the slugged id class
 * (pack-specific theming hook) plus ENGINE-DERIVED semantic classes —
 * the same flags that gate behavior now key the visual-role rules, so
 * a pack-open id renders styled instead of falling through the baked
 * ALN selectors. Unresolvable ids get only their id class; null/empty
 * ids get nothing.
 * @param {*} modeId
 * @returns {string[]} e.g. ['mode-blackmarket', 'mode-scoring']
 */
export function modeClassNames(modeId) {
    if (modeId === null || modeId === undefined || modeId === '') return [];
    const classes = [`mode-${slugifyId(modeId)}`];
    if (isScoringMode(modeId)) classes.push('mode-scoring');
    if (isEvidenceMode(modeId)) classes.push('mode-evidence');
    return classes;
}

/**
 * Does a transaction in this mode register a consuming claim? (D3s2)
 * Unresolvable modes are CONSUMING — legacy history keeps blocking, the
 * same safe reading as the backend's duplicatePolicy.isConsumingClaim.
 */
export function isConsumingMode(modeId) {
    const record = resolveMode(modeId);
    return record === null || record.claims !== 'non-consuming';
}

/** Does this mode's display surface match? (absent displayBehavior = 'none') */
export function modeHasSurface(modeId, surface) {
    return resolveMode(modeId)?.displayBehavior.surface === surface;
}

/**
 * Presentation label for a mode id. Unknown ids render as their raw id —
 * visible but never styled as a known mode (defense in depth; the server
 * gate should make this unreachable).
 */
export function modeLabel(modeId) {
    return resolveMode(modeId)?.label ?? String(modeId);
}

/** Test-only: clear the applied table and re-arm the shim warn latch. */
export function _resetForTesting() {
    activeModes = null;
    warnedLegacy = false;
    warnedUndrivableModes = new Set();
}
