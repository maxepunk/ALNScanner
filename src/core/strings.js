/**
 * Pack-declared display strings (Phase 3 A3 slice 3a).
 *
 * The pack's strings.json sidecar (declared by game.json `strings`,
 * fetched by packLoader under the manifest `strings` role) rewords the
 * scanner shell at RUNTIME — a pack publish changes wording with NO
 * rebuild, same delivery as scoring/modes.
 *
 * Doctrine — the BENIGN wording class: a pack that declares nothing
 * keeps the baked ALN wording with NO loud shim. Unlike scoring's L2
 * warn, wrong wording cannot corrupt a game, so the fallback is silent
 * per-key (the backend's getStrings()-null posture mirrored client-side).
 * Declared-but-broken sidecars are refused at the BACKEND activation
 * gate; this module's kind/schemaVersion mirror only guards the ungated
 * tiers (bundled / Pages-static) — and it DECLINES the sidecar rather
 * than failing the load, because baked wording is always a safe landing.
 *
 * @module core/strings
 */

import Debug from '../utils/debug.js';

// Sidecar schemaVersion this module reads (matches strings.schema.json's
// const and the backend gate's exact check).
export const STRINGS_SCHEMA_VERSION = 2;

// Baked ALN wording, frozen at build time. Drift-tripwired against the
// real data/strings.json in tests/unit/core/strings.test.js — if the
// pack rewords, this bake must follow.
const BAKED_STRINGS = Object.freeze({
    scanner: Object.freeze({
        appTitle: 'Memory Transaction Station',
        scanPrompt: 'Tap Memory Token',
        statLabels: Object.freeze({
            score: 'Score',
            totalValue: 'Total Value',
        }),
    }),
    scoreboard: Object.freeze({
        emptyEvidence: 'Awaiting evidence...',
    }),
    // Session-report wording (A3 slice 7). This bake IS ALN's report
    // voice: ALN's strings.json deliberately declares NO report section
    // (the LEGACY_ENTITY_LABEL bake-is-the-voice pattern), so the
    // contract goldens — which render with no pack applied — prove the
    // exact bytes the pipeline consumes. A structural snapshot pin in
    // sessionReport.contract.test.js fails loudly on any drift here.
    report: Object.freeze({
        labels: Object.freeze({
            teams: 'Teams',
            totalTransactions: 'Total Transactions',
            playerScans: 'Player Scans',
            uniqueTokens: 'Unique Tokens Processed',
            mostActiveDevices: 'Most Active Devices',
            mostScannedTokens: 'Most Scanned Tokens',
            neverTurnedIn: 'Tokens Scanned but Never Turned In',
        }),
        classLabels: Object.freeze({
            evidence: 'detective',
            scoring: 'black market',
            other: 'other',
        }),
        empty: Object.freeze({
            evidence: 'No detective transactions this session.',
            scoring: 'No scoring events this session.',
            playerScans: 'No player scans this session.',
        }),
        breakdown: Object.freeze({
            transactions: 'transactions',
            adjustments: 'adjustments',
            sales: 'sales',
        }),
        fallback: Object.freeze({
            dash: '—',
            unknownOwner: 'Unknown',
            unknownDuration: 'Unknown',
            unknownDate: 'Unknown Date',
        }),
        duration: Object.freeze({
            hours: 'h',
            minutes: 'm',
        }),
        adjustmentLabel: 'Adjustment',
        scanNoun: 'scan',
        scanNounPlural: 'scans',
    }),
});

// The applied pack sidecar's sections (kind/schemaVersion stripped), or
// null when no usable sidecar is applied (baked wording only).
let PACK_STRINGS = null;

/**
 * Apply a pack strings sidecar (or clear with null). Called from
 * tokenManager.loadDatabase() with packLoader's `strings` result.
 * @param {Object|null} sidecar - parsed strings.json content
 * @returns {boolean} true when the sidecar was applied
 */
export function applyPackStrings(sidecar) {
    if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
        PACK_STRINGS = null;
        return false;
    }
    const { kind, schemaVersion, ...sections } = sidecar;
    if (kind !== undefined && kind !== 'strings') {
        Debug.log(`strings: sidecar kind '${kind}' is not 'strings' — declining (baked wording stays)`, true);
        PACK_STRINGS = null;
        return false;
    }
    if (schemaVersion !== undefined && schemaVersion !== STRINGS_SCHEMA_VERSION) {
        Debug.log(
            `strings: sidecar schemaVersion ${schemaVersion} — this scanner reads `
            + `${STRINGS_SCHEMA_VERSION} only. Declining (baked wording stays).`, true);
        PACK_STRINGS = null;
        return false;
    }
    PACK_STRINGS = sections;
    return true;
}

/**
 * Look up one string by dotted path (e.g. 'scanner.statLabels.score').
 * Pack-declared NON-EMPTY STRING leaves win; anything else (missing key,
 * empty string, non-string leaf, undeclared sidecar) falls back to the
 * baked wording. Returns null only when no baked default exists either.
 * @param {string} path
 * @returns {string|null}
 */
export function getString(path) {
    const segments = path.split('.');
    const fromPack = _walk(PACK_STRINGS, segments);
    if (typeof fromPack === 'string' && fromPack.length > 0) return fromPack;
    const baked = _walk(BAKED_STRINGS, segments);
    return typeof baked === 'string' && baked.length > 0 ? baked : null;
}

/**
 * Look up one string from the APPLIED PACK ONLY — no baked fallback.
 * For layered resolution where one concept has more than one legitimate
 * declaration site (slice 7: report.fallback.unknownOwner falls back to
 * the pack's scoreboard.unknownOwner before the bake). Returns null for
 * anything but a declared non-empty string leaf.
 * @param {string} path
 * @returns {string|null}
 */
export function getPackString(path) {
    const fromPack = _walk(PACK_STRINGS, path.split('.'));
    return typeof fromPack === 'string' && fromPack.length > 0 ? fromPack : null;
}

// Object.hasOwn at every step: a section or key named 'constructor'
// must never resolve through the prototype chain (same doctrine as
// scoring's parseGroupInfo / the backend's _normalizeScoring).
function _walk(root, segments) {
    let node = root;
    for (const seg of segments) {
        if (!node || typeof node !== 'object' || !Object.hasOwn(node, seg)) return undefined;
        node = node[seg];
    }
    return node;
}
