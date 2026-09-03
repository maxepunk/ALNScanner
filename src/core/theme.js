/**
 * Pack-declared visual identity (Phase 3 theme unit).
 *
 * The pack's theme.json sidecar (declared by game.json `theme`, fetched
 * by packLoader under the manifest `theme` role) re-points the engine's
 * visual identity at RUNTIME: semantic mode colors, the rating
 * display/glyph choice for the three GM-scanner rating sites, and the
 * scoreboard accent (server-side, not this module). A pack publish
 * changes identity with NO rebuild — the strings delivery, applied to
 * pixels.
 *
 * Doctrine — BENIGN visual class: an UNDECLARED theme keeps the baked
 * engine identity with NO warn (benign emptiness; wrong colors cannot
 * corrupt a game). A DECLARED-but-broken sidecar DECLINEs LOUDLY — the
 * standalone tiers (Pages/bundled) never pass the backend activation
 * gate, so this mirror is their only barrier. One deliberate divergence
 * from the strings mirror (design §4a O2): kind/schemaVersion are
 * REQUIRED — theme.json is a NEW artifact with zero legacy files, and
 * absence-tolerance would let a headerless sidecar apply standalone
 * while the same pack refuses activation at the orchestrator.
 *
 * Per-LEAF posture: a bad leaf DECLINEs alone (warn; its baked fallback
 * stands) while good leaves apply — the getString per-key mirror, made
 * loud because these are declared-then-broken values, not omissions.
 * The rating section is the exception: an undrivable `display` declines
 * the WHOLE section (display drives the sites; a glyph without its
 * display choice has no meaning).
 *
 * @module core/theme
 */

import Debug from '../utils/debug.js';

// Sidecar schemaVersion this module reads (matches theme.schema.json's
// const and the backend gate's exact check).
export const THEME_SCHEMA_VERSION = 1;

// C0 controls + DEL + bidi controls — the icon-idiom strip class. Kept
// local (the slice-7 precedent): modeSemantics does not export its
// copy, and this module's sinks are formatStars strings + CSS custom
// properties, not the DOM announcement path.
const CONTROL_AND_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

// Strict 6-digit hex — the CSS-sink injection-safety rule (D-T.1):
// re-checked here even though the gate validates, because the
// standalone tiers never meet the gate.
const THEME_HEX = /^#[0-9a-fA-F]{6}$/;

const COLOR_KEYS = new Set(['modeScoring', 'modeEvidence', 'accentPrimary', 'accentValue']);
const RATING_DISPLAYS = new Set(['stars', 'numeric', 'none']);

// The baked engine identity for the two rating-site glyph FORMS
// (D-T.5): sites 1-2 render filled-only ⭐ (no pad), site 3 renders the
// ★/☆ pad. The split is ENGINE behavior; a declared theme glyph
// overrides the pair, with an undeclared `empty` meaning no pad
// anywhere ("a theme that declares only filled gets filled-only
// everywhere").
const BAKED_GLYPHS = Object.freeze({
    'filled-only': Object.freeze({ filled: '⭐', empty: null }),
    padded: Object.freeze({ filled: '★', empty: '☆' }),
});

// The applied theme's normalized sections, or null when no usable
// sidecar is applied (baked identity only).
let PACK_THEME = null;

function _warn(message) {
    console.warn(`[theme] ${message} — declining (the baked identity stays). The orchestrator's activation gate refuses this pack; fix the declaration.`);
}

/**
 * Normalize one declared glyph (the icon idiom — the modes[].icon /
 * backend normalizedIcon value twin): strip control/bidi, then require
 * 1-4 CODE POINTS and no markup characters. Returns the CLEANED glyph
 * or null when unusable.
 * @param {*} value
 * @returns {string|null}
 */
function _normalizeGlyph(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(CONTROL_AND_BIDI, '');
    if (cleaned.length === 0 || [...cleaned].length > 4 || /[<>&"'{}]/.test(cleaned)) return null;
    return cleaned;
}

/**
 * Apply a pack theme sidecar (or clear with null). Called from
 * tokenManager.loadDatabase() with packLoader's `theme` result.
 * @param {Object|null} sidecar - parsed theme.json content
 * @returns {boolean} true when the sidecar was applied
 */
export function applyPackTheme(sidecar) {
    if (sidecar === null || sidecar === undefined) {
        PACK_THEME = null;
        return false;
    }
    if (typeof sidecar !== 'object' || Array.isArray(sidecar)) {
        _warn('theme sidecar is not a JSON object');
        PACK_THEME = null;
        return false;
    }
    // Headers REQUIRED (unlike strings — see the module doctrine).
    if (sidecar.kind !== 'theme') {
        _warn(`theme sidecar kind '${sidecar.kind}' is not 'theme' (the header is required)`);
        PACK_THEME = null;
        return false;
    }
    if (sidecar.schemaVersion !== THEME_SCHEMA_VERSION) {
        _warn(`theme sidecar schemaVersion ${sidecar.schemaVersion} — this scanner reads ${THEME_SCHEMA_VERSION} only (the header is required)`);
        PACK_THEME = null;
        return false;
    }

    const applied = {};

    const colors = sidecar.colors;
    if (colors && typeof colors === 'object' && !Array.isArray(colors)) {
        const out = {};
        for (const [key, val] of Object.entries(colors)) {
            if (!COLOR_KEYS.has(key)) {
                _warn(`theme colors key '${key}' is unknown`);
            } else if (typeof val !== 'string' || !THEME_HEX.test(val)) {
                _warn(`theme colors.${key} '${val}' is not a strict 6-digit hex color`);
            } else {
                out[key] = val;
            }
        }
        if (Object.keys(out).length > 0) applied.colors = out;
    } else if (colors !== undefined) {
        _warn('theme colors section is not an object');
    }

    const rating = sidecar.rating;
    if (rating && typeof rating === 'object' && !Array.isArray(rating)) {
        if (!RATING_DISPLAYS.has(rating.display)) {
            // The whole section declines: display drives the sites.
            _warn(`theme rating.display '${rating.display}' is not drivable (stars/numeric/none)`);
        } else {
            const out = { display: rating.display };
            const glyph = rating.glyph;
            if (glyph && typeof glyph === 'object' && !Array.isArray(glyph)) {
                const glyphOut = {};
                for (const gKey of ['filled', 'empty']) {
                    if (glyph[gKey] === undefined) continue;
                    const cleaned = _normalizeGlyph(glyph[gKey]);
                    if (cleaned === null) {
                        _warn(`theme rating.glyph.${gKey} is not a usable glyph (1-4 plain code points, no markup characters)`);
                    } else {
                        glyphOut[gKey] = cleaned;
                    }
                }
                if (Object.keys(glyphOut).length > 0) out.glyph = glyphOut;
            } else if (glyph !== undefined) {
                _warn('theme rating.glyph is not an object');
            }
            applied.rating = out;
        }
    } else if (rating !== undefined) {
        _warn('theme rating section is not an object');
    }

    PACK_THEME = applied;
    return true;
}

/**
 * Is a pack theme currently applied? Provenance introspection (the
 * packStringsApplied twin): the settings pack line warns when the pack
 * DECLARES a theme none of which is applied — the design-iteration
 * loop must not fail silently (design §4a OBJ-2).
 * @returns {boolean}
 */
export function packThemeApplied() {
    return PACK_THEME !== null;
}

/**
 * The rating display choice for the three GM-scanner rating sites.
 * Baked default 'stars' — packless output stays byte-identical.
 * @returns {'stars'|'numeric'|'none'}
 */
export function ratingDisplay() {
    return PACK_THEME?.rating?.display ?? 'stars';
}

/**
 * The star glyph pair for one site FORM (D-T.5): 'filled-only' (sites
 * 1-2) or 'padded' (site 3). A declared glyph overrides per leaf; a
 * theme declaring only `filled` gets filled-only everywhere.
 * @param {'filled-only'|'padded'} form
 * @returns {{filled: string, empty: string|null}}
 */
export function ratingGlyphs(form) {
    const baked = BAKED_GLYPHS[form] ?? BAKED_GLYPHS['filled-only'];
    const g = PACK_THEME?.rating?.glyph;
    if (!g) return { filled: baked.filled, empty: baked.empty };
    return {
        filled: g.filled ?? baked.filled,
        // The filled-only FORM never pads — a declared empty reaches the
        // padded site only (D-T.5).
        empty: form === 'padded' ? (g.empty ?? null) : null,
    };
}

/**
 * The applied theme's color map (validated strict hex), or null when
 * none declared.
 * @returns {Object|null}
 */
export function themeColors() {
    const c = PACK_THEME?.colors;
    return c && Object.keys(c).length > 0 ? { ...c } : null;
}

// The custom properties this module owns on the document root — cleared
// on every apply so a theme reload never leaves a stale injection.
const COLOR_PROPS = Object.freeze({
    modeScoring: '--color-mode-scoring',
    modeEvidence: '--color-mode-evidence',
    accentPrimary: '--color-accent-primary',
    accentValue: '--color-accent-value',
});

/**
 * Inject the applied theme's colors as root CSS custom properties (the
 * initializationSteps :219 setProperty precedent). Undeclared leaves
 * REMOVE any prior injection so the stylesheet values stand — the
 * benign-emptiness landing. Values were hex-validated at apply; the
 * check here is the sink-side twin (standalone tiers never meet the
 * gate).
 * @param {Document|null} doc
 */
export function applyThemeColorsToDom(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc?.documentElement?.style?.setProperty) return;
    const colors = PACK_THEME?.colors ?? {};
    for (const [key, prop] of Object.entries(COLOR_PROPS)) {
        const val = colors[key];
        if (typeof val === 'string' && THEME_HEX.test(val)) {
            doc.documentElement.style.setProperty(prop, val);
        } else {
            doc.documentElement.style.removeProperty(prop);
        }
    }
    Debug.log(`theme: colors ${Object.keys(colors).length > 0 ? Object.keys(colors).join('/') + ' injected' : 'cleared (baked identity)'}`);
}

/** Test-only: clear the applied theme. */
export function _resetThemeForTesting() {
    PACK_THEME = null;
}
