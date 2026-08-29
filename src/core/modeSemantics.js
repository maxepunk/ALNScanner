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
import { escapeHtml } from '../utils/escapeHtml.js';

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
        claimedLabel: 'SOLD to {entity}',
        icon: '💰',
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
        claimedLabel: 'EXPOSED by {entity}',
        icon: '🔍',
    }),
]);

// The entity NOUN the screens print ("Team", "Select Team", "Team
// Rankings"…). Pack-declared via game.json entities.label (R-Q1, owner
// ruling 2026-08-22: ALN's Account rebrand IS the intended fiction and is
// DELIVERED BY THE PACK). This bake therefore deliberately does NOT
// mirror the real ALN game.json (which declares Account/Accounts): the
// packless/no-game.json tier keeps the legacy Team wording byte-identical
// — so no drift tripwire pins this table to game.json, unlike the modes
// bake above.
const LEGACY_ENTITY_LABEL = Object.freeze({ singular: 'Team', plural: 'Teams' });

let activeModes = null; // null = shim (legacy ALN table)
let activeEntityLabel = null; // null = baked Team/Teams
let warnedLegacy = false;
let warnedUndrivableModes = new Set();
let warnedDeclinedPresentation = new Set();

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

// C0 controls + bidi controls (LRM/RLM, embeddings/overrides, isolates):
// stripped from presentation fields before validation — a control char
// must never reach the DOM or defeat the {entity} template check.
const CONTROL_AND_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function _warnDeclined(modeId, field, reason) {
    const key = `${modeId}:${field}`;
    if (warnedDeclinedPresentation.has(key)) return;
    warnedDeclinedPresentation.add(key);
    console.warn(
        `[modeSemantics] mode '${modeId}': declared ${field} is not usable (${reason}) — ` +
        'declining the declaration (engine fallback applies). The orchestrator\'s ' +
        'activation gate refuses this pack; fix the declaration.'
    );
}

/**
 * Normalize a declared claimedLabel (R-Q2 #1/#5): a TEMPLATE containing
 * exactly one `{entity}` token and no other braces. Declared-but-broken
 * DECLINEs to null with a once-per-mode warn (the activation gate's
 * refusal twin — a standalone scanner never passes that gate).
 */
function _normalizeClaimedLabel(mode) {
    if (mode.claimedLabel === undefined) return null; // absent = silent fallback
    if (typeof mode.claimedLabel !== 'string') {
        _warnDeclined(mode.id, 'claimedLabel', 'not a string');
        return null;
    }
    const cleaned = mode.claimedLabel.replace(CONTROL_AND_BIDI, '');
    // Exactly one {entity}, and the braces may spell nothing else.
    const stripped = cleaned.split('{entity}');
    if (stripped.length !== 2 || stripped.some((part) => /[{}]/.test(part))) {
        _warnDeclined(mode.id, 'claimedLabel', 'must contain exactly one {entity} and no other braces');
        return null;
    }
    return cleaned;
}

/**
 * Normalize a declared icon (R-Q2 #1): a short TEXT GLYPH rendered as
 * content — NEVER a class/attribute key. Markup characters or over-long
 * values DECLINE to null (gate refusal twin, once-per-mode warn).
 */
function _normalizeIcon(mode) {
    if (mode.icon === undefined) return null; // absent = silent no-icon
    if (typeof mode.icon !== 'string') {
        _warnDeclined(mode.id, 'icon', 'not a string');
        return null;
    }
    const cleaned = mode.icon.replace(CONTROL_AND_BIDI, '');
    // Mirrors the schema pattern: 1-4 code points, no markup/brace chars.
    if (cleaned.length === 0 || [...cleaned].length > 4 || /[<>&"'{}]/.test(cleaned)) {
        _warnDeclined(mode.id, 'icon', 'must be 1-4 plain text glyphs (no markup characters)');
        return null;
    }
    return cleaned;
}

/**
 * Resolve a mode id to its normalized semantics record, or null when the
 * active table does not declare it. The record always carries every flag:
 * absent displayBehavior normalizes to {surface:'none'}, absent fields to
 * [], absent `when` to 'immediate' — identical to the backend resolver.
 * Presentation fields (R-Q2): claimedLabel/icon normalize to null when
 * absent or declined; consumers apply the engine-generic fallback.
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
        claimedLabel: _normalizeClaimedLabel(mode),
        icon: _normalizeIcon(mode),
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
// Slugs whose mode-<slug> class would forge a SEMANTIC class or collide
// with a STRUCTURAL one (review B): schema-legal ids like 'scoring' or
// 'indicator' must never fabricate styling their flags don't grant —
// such an id simply gets no id class (its true semantic classes still
// apply).
const RESERVED_MODE_CLASS_SLUGS = new Set(['scoring', 'evidence', 'indicator', 'segment', 'selector']);

export function modeClassNames(modeId) {
    if (modeId === null || modeId === undefined || modeId === '') return [];
    const slug = slugifyId(modeId);
    const classes = RESERVED_MODE_CLASS_SLUGS.has(slug) ? [] : [`mode-${slug}`];
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

// Engine-generic claim wording — the fallback tier between a declared
// claimedLabel and nothing (R-Q2 #3). Semantics-derived, never id-keyed.
const GENERIC_CLAIMED_LABEL = 'CLAIMED by {entity}';

/**
 * The claim ANNOUNCEMENT for a mode (R-Q2): the pack-declared
 * claimedLabel template rendered with the claiming entity's NAME
 * (`{entity}` = the instance — a team/account name or defaultEntity —
 * not the entity noun). Per-field fallback: no usable claimedLabel →
 * engine-generic wording; no usable icon → no icon. Unresolvable mode
 * ids get the generic phrase with no icon.
 *
 * Substitution is GetSubstitution-safe (function replacement — an entity
 * named '$&' renders literally) and BOTH halves are escaped, so `html`
 * is safe to interpolate into innerHTML as-is. `icon` is a plain text
 * glyph (already normalized markup-free); render it as CONTENT, never as
 * a class or attribute key.
 *
 * @param {string} modeId
 * @param {string} entityName - the claiming entity instance's name
 * @returns {{html: string, icon: string|null}}
 */
export function claimAnnouncement(modeId, entityName) {
    const record = resolveMode(modeId);
    const template = record?.claimedLabel || GENERIC_CLAIMED_LABEL;
    const icon = record?.icon || null;
    const html = escapeHtml(template).replaceAll('{entity}', () => escapeHtml(String(entityName)));
    return { html, icon };
}

/**
 * Apply the loaded pack's entity label (Q1 — same Phase 1A moment as
 * applyPackModes). Absent block = silent baked Team/Teams (benign
 * wording class); declared-but-broken DECLINEs loudly to baked (the
 * gate refusal twin). Non-empty-string singular AND plural required.
 * @param {Object|null} gameConfig - packLoader's loaded game.json (or null)
 * @returns {boolean} true when a declared label is active
 */
export function applyPackEntities(gameConfig) {
    const label = gameConfig?.entities?.label;
    if (label === undefined) {
        activeEntityLabel = null;
        return false;
    }
    const singular = typeof label?.singular === 'string' ? label.singular.replace(CONTROL_AND_BIDI, '').trim() : '';
    const plural = typeof label?.plural === 'string' ? label.plural.replace(CONTROL_AND_BIDI, '').trim() : '';
    if (!singular || !plural) {
        console.warn(
            '[modeSemantics] declared entities.label is not usable (singular and plural must be ' +
            'non-empty strings) — declining to the baked Team/Teams wording. The orchestrator\'s ' +
            'activation gate refuses this pack; fix the declaration.'
        );
        activeEntityLabel = null;
        return false;
    }
    activeEntityLabel = Object.freeze({ singular, plural });
    return true;
}

/** The entity noun, singular ("Team" baked; ALN's pack declares "Account"). */
export function entityLabel() {
    return (activeEntityLabel || LEGACY_ENTITY_LABEL).singular;
}

/** The entity noun, plural ("Teams" baked; ALN's pack declares "Accounts"). */
export function entityLabelPlural() {
    return (activeEntityLabel || LEGACY_ENTITY_LABEL).plural;
}

/** Test-only: clear the applied tables and re-arm the warn latches. */
export function _resetForTesting() {
    activeModes = null;
    activeEntityLabel = null;
    warnedLegacy = false;
    warnedUndrivableModes = new Set();
    warnedDeclinedPresentation = new Set();
}
