/**
 * Pack Loader — runtime game-pack loading (Phase 3 A2)
 *
 * Implements the ratified standalone-pack-loading design (§2 load order,
 * §3 staged atomic refresh):
 *
 *   1. NETWORK  — fetch pack-manifest.json (network-first, no-store).
 *                 Hash unchanged → serve the verified cache (fast path).
 *                 Hash changed  → staged refresh: fetch changed files into
 *                 a STAGING cache (`aln-pack-<hash>`), verify each sha1,
 *                 then flip the active-pack pointer in ONE localStorage
 *                 write and delete old caches. Any failure discards the
 *                 staging cache — the active pack is never touched.
 *   2. CACHE    — the last successfully-activated pack.
 *   3. BUNDLED  — the build-time copy at the dist root (vite publicDir
 *                 copies the ALN-TokenData submodule there). Last resort;
 *                 the UI shows a warning badge for this source.
 *
 * Channel selection is by SERVING ORIGIN, not user mode (2026-07-17 review
 * A6): served from the orchestrator (/gm-scanner/) → `/api/pack/*`;
 * anywhere else (Pages, dev server) → same-origin static files.
 *
 * Activation timing: loadPack() runs at APP START (Phase 1A) only — a pack
 * published mid-session is not picked up until reload, honoring the
 * session-boundary rule (§3). Every load records
 * `{packId, version, contentHash, source}` for the UI and the WS handshake.
 *
 * @module core/packLoader
 */

import Debug from '../utils/debug.js';
import { isOrchestratorServed } from '../utils/config.js';

const POINTER_KEY = 'aln_pack_active';
const CACHE_PREFIX = 'aln-pack-';
// Pack schemaVersion THIS scanner reads (tokens-v2 cutover, A3 slice 2b).
// EXACT match when declared — the backend gate's mirror: a v1 pack's
// suffixed SF_Group names would silently read 1x multipliers here (this
// code has no suffix parser), and a future pack must refuse loudly, never
// half-parse. Enforced by tokenManager.loadDatabase on the loaded
// gameConfig (the load boundary, covering ALL tiers incl. SW-cache).
export const PACK_SCHEMA_VERSION = 2;
// loadPack() runs on the fail-hard startup path (Phase 1A). A server that
// accepts the connection but never responds must not hang the loading
// screen — every fetch times out and falls through the tier ladder.
const FETCH_TIMEOUT_MS = 8000;

function fetchTimeoutSignal() {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        return AbortSignal.timeout(FETCH_TIMEOUT_MS);
    }
    // Chrome 107 floor ships AbortSignal.timeout (since 103) — this path
    // should be unreachable. If it fires, the no-hang startup guarantee is
    // OFF, and that must never be silent.
    Debug.log('packLoader: AbortSignal.timeout unavailable — fetch timeouts DISABLED (hung server can stall startup)', true);
    return undefined;
}
// The rules-bearing files the GM scanner consumes at runtime (A3 slice
// 3a grew the set: the strings sidecar rides the same staged refresh —
// declared ⇒ must load, so a missing declared sidecar fails the refresh
// exactly like a missing tokens.json). Assets stay on their existing
// channels.
const RULES_ROLES = new Set(['game', 'tokens', 'strings']);

async function webCryptoSha1Hex(buf) {
    const digest = await crypto.subtle.digest('SHA-1', buf);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export class PackLoader {
    /**
     * @param {Object} deps - injectable for tests
     * @param {Function} [deps.fetchFn] - fetch implementation
     * @param {CacheStorage|null} [deps.cachesApi] - Cache Storage API
     * @param {Storage} [deps.storage] - localStorage-like pointer store
     * @param {Function} [deps.sha1Fn] - async (ArrayBuffer) => hex string
     * @param {string} [deps.pathname] - location.pathname override
     */
    constructor({
        fetchFn = (...args) => fetch(...args),
        cachesApi = typeof caches !== 'undefined' ? caches : null,
        storage = typeof localStorage !== 'undefined' ? localStorage : null,
        sha1Fn = webCryptoSha1Hex,
        pathname = typeof location !== 'undefined' ? location.pathname : '/',
    } = {}) {
        this._fetch = fetchFn;
        this._caches = cachesApi;
        this._storage = storage;
        this._sha1 = sha1Fn;
        this._pathname = pathname;
        this._active = null; // {packId, version, contentHash, source} of THIS load
    }

    /**
     * The pack identity of the current load (null before loadPack()).
     * Consumed by the settings UI and the WS handshake packHash.
     */
    getActivePack() {
        return this._active ? { ...this._active } : null;
    }

    /**
     * Channel by serving origin (review A6). The orchestrator serves the
     * scanner at /gm-scanner/ and owns the pack API; every other origin
     * (GitHub Pages, Vite dev) serves the pack as same-origin static files.
     */
    channel() {
        if (isOrchestratorServed(this._pathname)) {
            return {
                manifestUrl: '/api/pack/manifest',
                fileUrl: (p) => `/api/pack/files/${p}`,
            };
        }
        return {
            manifestUrl: 'pack-manifest.json',
            fileUrl: (p) => p,
        };
    }

    /**
     * Load the pack per the §2 order. Never throws for tier failures —
     * walks down the ladder and only rejects when even the bundled tier is
     * unusable (the scanner cannot run without tokens).
     *
     * @returns {Promise<{tokens: Object, gameConfig: Object|null,
     *                    info: {packId, version, contentHash, source}}>}
     */
    async loadPack() {
        const ch = this.channel();

        // ── Tier 1: NETWORK ─────────────────────────────────────────────
        let manifest = null;
        try {
            const res = await this._fetch(ch.manifestUrl, { cache: 'no-store', signal: fetchTimeoutSignal() });
            if (res.ok && (res.headers?.get?.('content-type') || '').includes('application/json')) {
                manifest = await res.json();
            }
        } catch (err) {
            Debug.log(`packLoader: manifest fetch failed (${err.message}) — falling back`);
        }

        if (manifest && manifest.contentHash && Array.isArray(manifest.files)) {
            const pointer = this._readPointer();
            if (pointer && pointer.contentHash === manifest.contentHash) {
                // Fast path: network-verified, content already active.
                // requireDeclaredStrings: a cache staged by PRE-3a code
                // holds this pack's game.json (with its strings pointer)
                // but not the sidecar — the network tier must treat that
                // incomplete cache like a missing cache and refresh,
                // never activate half a pack it could complete right now.
                const fromCache = await this._readPackFromCache(pointer.contentHash, { requireDeclaredStrings: true });
                if (fromCache) {
                    return this._activate(fromCache, manifest, 'network');
                }
                // Pointer without (complete) cache — fall through to refresh.
            }
            const staged = await this._stagedRefresh(manifest, ch);
            if (staged) {
                return this._activate(staged, manifest, 'network');
            }
            Debug.log('packLoader: staged refresh failed — active pack untouched, falling back');
        }

        // ── Tier 2: CACHE (last activated pack) ─────────────────────────
        const pointer = this._readPointer();
        if (pointer) {
            const fromCache = await this._readPackFromCache(pointer.contentHash);
            if (fromCache) {
                return this._activate(fromCache, pointer, 'cache');
            }
        }

        // ── Tier 3: BUNDLED (build-time dist-root copy) ─────────────────
        const bundled = await this._loadBundled();
        return this._activate(bundled.pack, bundled.identity, 'bundled');
    }

    // ── internals ───────────────────────────────────────────────────────

    _isUsableTokenMap(tokens) {
        return !!tokens && typeof tokens === 'object'
            && !Array.isArray(tokens) && Object.keys(tokens).length > 0;
    }

    _readPointer() {
        try {
            const raw = this._storage?.getItem(POINTER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    _rulesFiles(manifest) {
        return manifest.files.filter((f) => RULES_ROLES.has(f.role));
    }

    /**
     * §3: fetch changed files into `aln-pack-<newHash>`, verifying each
     * sha1; only a COMPLETE verified staging cache flips the pointer.
     * Returns the loaded pack content, or null on any failure (staging
     * discarded, active pack untouched).
     */
    async _stagedRefresh(manifest, ch) {
        if (!this._caches) return null; // no Cache API (should not happen in browsers)
        const stagingName = `${CACHE_PREFIX}${manifest.contentHash}`;
        try {
            const staging = await this._caches.open(stagingName);
            const content = {};
            // Files are independent: fetch + verify + stage concurrently so
            // per-fetch timeouts don't STACK on the fail-hard startup path
            // (the rules set grows in the A3 strings/cues slices). The ONE
            // pointer flip below still waits for every file — Promise.all
            // rejects into the shared catch on any failure, atomicity intact.
            await Promise.all(this._rulesFiles(manifest).map(async (file) => {
                const res = await this._fetch(ch.fileUrl(file.path), { cache: 'no-store', signal: fetchTimeoutSignal() });
                if (!res.ok) throw new Error(`${file.path}: HTTP ${res.status}`);
                const buf = await res.arrayBuffer();
                const sha1 = await this._sha1(buf);
                if (sha1 !== file.sha1) {
                    // Mid-publish server state or corruption — never activate.
                    throw new Error(`${file.path}: sha1 mismatch (got ${sha1.slice(0, 8)}…, manifest ${file.sha1.slice(0, 8)}…)`);
                }
                const text = new TextDecoder().decode(buf);
                content[file.path] = JSON.parse(text);
                await staging.put(`/${file.path}`, new Response(text, {
                    headers: { 'content-type': 'application/json' },
                }));
            }));
            // A manifest that declares no canonical tokens.json (malformed,
            // mid-publish, or a role/path drift) must NEVER activate: the
            // pointer flip below GCs the last-known-good pack cache, so a
            // "successful" empty staging would strand the device on the
            // stale bundled tier. Treat it exactly like an HTTP/sha1 failure.
            if (!this._isUsableTokenMap(content['tokens.json'])) {
                throw new Error('canonical tokens.json is missing, empty, or not a token map');
            }
            // Declared ⇒ must load (review D): a drifted/hand-built
            // manifest — or a non-canonical sidecar filename the builders
            // role as "other" — stages game+tokens but not the declared
            // sidecar. Half-activating would silently split wording
            // between backend and scanner; fail like a missing tokens.json.
            const declaredStrings = this._stringsPath(content['game.json']);
            if (declaredStrings && !Object.hasOwn(content, declaredStrings)) {
                throw new Error(`game.json declares strings '${declaredStrings}' but the manifest staged no such rules file (role drift / non-canonical name)`);
            }

            // Also persist the manifest itself for cache-tier identity.
            await staging.put('/pack-manifest.json', new Response(JSON.stringify(manifest), {
                headers: { 'content-type': 'application/json' },
            }));

            // Staging complete + verified → the ONE pointer write, then GC.
            this._storage?.setItem(POINTER_KEY, JSON.stringify({
                packId: manifest.packId,
                version: manifest.version,
                contentHash: manifest.contentHash,
            }));
            await this._deleteOtherPackCaches(stagingName);
            Debug.log(`packLoader: activated ${manifest.packId} v${manifest.version} (${manifest.contentHash.slice(0, 15)}…)`);
            return content;
        } catch (err) {
            Debug.log(`packLoader: staged refresh aborted — ${err.message}`, true);
            try {
                // ACCEPTED RACE: Promise.all rejects on the FIRST failure;
                // sibling fetches still in flight may staging.put() after
                // this delete, re-creating the cache. Harmless — the pointer
                // never references it — and the next successful refresh GCs
                // it by prefix (_deleteOtherPackCaches). Cancelling siblings
                // would need AbortSignal.any (Chrome 116+, above our 107
                // floor), so the lingering-cache window is the cheaper trade.
                await this._caches.delete(stagingName);
            } catch { /* best-effort discard */ }
            return null;
        }
    }

    async _deleteOtherPackCaches(keepName) {
        try {
            const names = await this._caches.keys();
            await Promise.all(
                names
                    .filter((n) => n.startsWith(CACHE_PREFIX) && n !== keepName)
                    .map((n) => this._caches.delete(n))
            );
        } catch { /* GC is best-effort */ }
    }

    /**
     * Read game.json/tokens.json (+manifest) from an activated pack cache.
     * requireDeclaredStrings (network fast path only): a cache whose
     * game.json declares a sidecar the cache lacks — staged by pre-3a
     * code whose rules set was {game, tokens} — reads as NO cache, so the
     * caller falls through to the staged refresh and completes it. The
     * OFFLINE cache tier keeps the default (tolerate: activating the
     * cached tokens with baked wording beats dropping to stale bundled
     * tokens for the sake of labels).
     */
    async _readPackFromCache(contentHash, { requireDeclaredStrings = false } = {}) {
        if (!this._caches) return null;
        try {
            const cache = await this._caches.open(`${CACHE_PREFIX}${contentHash}`);
            const tokensRes = await cache.match('/tokens.json');
            if (!tokensRes) return null;
            const content = { 'tokens.json': await tokensRes.json() };
            // Corrupted/invalid cached pack = no cached pack: fall through
            // the ladder rather than letting _activate throw mid-tier.
            if (!this._isUsableTokenMap(content['tokens.json'])) return null;
            const gameRes = await cache.match('/game.json');
            if (gameRes) content['game.json'] = await gameRes.json();
            // Strings sidecar rides the cache under its declared path
            // (slice 3a).
            const stringsPath = this._stringsPath(content['game.json']);
            if (stringsPath) {
                const stringsRes = await cache.match(`/${stringsPath}`);
                if (stringsRes) content[stringsPath] = await stringsRes.json();
                else if (requireDeclaredStrings) {
                    Debug.log(`packLoader: cached pack lacks its declared sidecar '${stringsPath}' (pre-3a staging) — refreshing`);
                    return null;
                }
            }
            return content;
        } catch {
            return null;
        }
    }

    /**
     * Bundled tier: the dist-root copies (HTTP-3/HTTP-4 hardening carried
     * over from the pre-pack tokenManager loader: root first, data/
     * fallback, content-type check against SPA-shell 200s).
     */
    async _loadBundled() {
        const tokens = await this._fetchBundledJson('tokens.json', 'data/tokens.json');
        if (!tokens) {
            throw new Error('Failed to load tokens.json from root or data/');
        }
        const game = await this._fetchBundledJson('game.json', 'data/game.json');
        // Declared strings sidecar (slice 3a): best-effort at this tier —
        // a pre-3a bundled snapshot degrades to baked wording, never to a
        // load failure (benign-wording class; contrast the network tier's
        // declared-must-load posture, which protects the pointer FLIP).
        const stringsPath = this._stringsPath(game);
        const strings = stringsPath
            ? await this._fetchBundledJson(stringsPath, `data/${stringsPath}`)
            : null;
        // Deliberate: when Tier 1 had no manifest this re-fetch 404s again
        // (≤2 extra requests on a pre-pack deployment). Accepted — bundled
        // identity display is worth it, and any published manifest ends it.
        const manifest = await this._fetchBundledJson('pack-manifest.json', 'data/pack-manifest.json');
        return {
            pack: {
                'tokens.json': tokens,
                ...(game ? { 'game.json': game } : {}),
                ...(strings ? { [stringsPath]: strings } : {}),
            },
            identity: manifest
                ? { packId: manifest.packId, version: manifest.version, contentHash: manifest.contentHash }
                : { packId: null, version: null, contentHash: null },
        };
    }

    async _fetchBundledJson(primary, fallback) {
        for (const url of [primary, fallback]) {
            try {
                const res = await this._fetch(url, { signal: fetchTimeoutSignal() });
                if (!res.ok) continue;
                // HTTP-4: a 200 can still be the SPA HTML shell.
                const contentType = res.headers?.get?.('content-type') || '';
                if (!contentType.includes('application/json')) continue;
                return await res.json();
            } catch { /* try next */ }
        }
        return null;
    }

    /** game.json's declared strings-sidecar path, or null. */
    _stringsPath(gameConfig) {
        const p = gameConfig?.strings;
        return typeof p === 'string' && p.length > 0 ? p : null;
    }

    _activate(content, identity, source) {
        const tokens = content['tokens.json'];
        // A 200 returning {} or a non-object would otherwise set an
        // empty/invalid database silently (pre-pack HTTP hardening kept).
        // Tier 1/2 inputs are pre-validated (staging + cache-read share
        // this predicate), so in practice this throw fires only at the
        // bundled tier — where there is nothing left to fall back to.
        if (!this._isUsableTokenMap(tokens)) {
            throw new Error('Pack token database is empty or not a token map');
        }
        this._active = {
            packId: identity.packId ?? null,
            version: identity.version ?? null,
            contentHash: identity.contentHash ?? null,
            source,
        };
        const gameConfig = content['game.json'] || null;
        const stringsPath = this._stringsPath(gameConfig);
        // Object.hasOwn (not truthy-index): content is keyed by pack file
        // paths — a hostile path like 'constructor' must never resolve
        // through the prototype chain.
        const strings = stringsPath && Object.hasOwn(content, stringsPath)
            ? content[stringsPath]
            : null;
        return {
            tokens,
            gameConfig,
            strings,
            info: this.getActivePack(),
        };
    }
}

// Default instance for production wiring (tests construct their own with
// injected deps).
export const packLoader = new PackLoader();
export default packLoader;
