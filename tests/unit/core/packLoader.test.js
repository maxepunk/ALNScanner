/**
 * Unit tests: PackLoader (Phase 3 A2 — runtime pack loading)
 *
 * Pins the design's §2 load order and §3 staged atomic refresh, and the
 * §6 failure-mode table: interrupted/verify-failed refreshes never touch
 * the active pack; offline devices run the last activated pack; first-run
 * offline lands on the bundled tier (which carries the HTTP-3/HTTP-4
 * hardening moved out of tokenManager's old direct-fetch chain).
 */

import { PackLoader } from '../../../src/core/packLoader.js';

// jsdom lacks these Node/browser globals; the loader uses them in the
// staged-refresh path.
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body) { this._body = body; }
    async text() { return this._body; }
    async json() { return JSON.parse(this._body); }
  };
}

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

const TOKENS = { kaa001: { SF_RFID: 'kaa001', SF_ValueRating: 3, SF_MemoryType: 'Technical' } };
const GAME = { id: 'about-last-night', modes: [], scoring: { baseValues: { 1: 1 }, typeMultipliers: { UNKNOWN: 0 } } };

function manifestFor(hash, files) {
  return {
    kind: 'pack-manifest',
    schemaVersion: 2,
    packId: 'about-last-night',
    version: '1.2.0',
    contentHash: hash,
    engine: { minVersion: '3.0.0' },
    files,
  };
}

/** sha1 stub: tests declare each file's "hash" as `sha1:<path>` so verify
 * passes exactly when the manifest entry uses the same convention. */
async function fakeSha1(buf) {
  const text = new TextDecoder().decode(buf);
  return `h-${JSON.stringify(JSON.parse(text)).length}`;
}
const sha1Of = (obj) => `h-${JSON.stringify(obj).length}`;

function jsonResponse(obj, contentType = 'application/json') {
  const text = JSON.stringify(obj);
  return {
    ok: true,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => JSON.parse(text),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

function makeCaches() {
  const stores = new Map();
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(url, response) { store.set(url, await response.text()); },
        async match(url) {
          const v = store.get(url);
          return v === undefined ? undefined : { json: async () => JSON.parse(v), text: async () => v };
        },
      };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
    _stores: stores,
  };
}

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

function makeLoader({ routes = {}, caches = makeCaches(), storage = makeStorage(), pathname = '/' } = {}) {
  const fetchFn = jest.fn(async (url) => {
    const handler = routes[url];
    if (!handler) return { ok: false, status: 404, headers: { get: () => null } };
    return typeof handler === 'function' ? handler() : handler;
  });
  const loader = new PackLoader({ fetchFn, cachesApi: caches, storage, sha1Fn: fakeSha1, pathname });
  return { loader, fetchFn, caches, storage };
}

const RULES_FILES = [
  { path: 'game.json', role: 'game', sha1: sha1Of(GAME), size: 1 },
  { path: 'tokens.json', role: 'tokens', sha1: sha1Of(TOKENS), size: 1 },
];

describe('PackLoader', () => {
  describe('channel selection (review A6: serving origin, not user mode)', () => {
    it('orchestrator-served (/gm-scanner) uses the pack API', () => {
      const { loader } = makeLoader({ pathname: '/gm-scanner/' });
      const ch = loader.channel();
      expect(ch.manifestUrl).toBe('/api/pack/manifest');
      expect(ch.fileUrl('tokens.json')).toBe('/api/pack/files/tokens.json');
    });

    it('any other origin (Pages, dev) uses same-origin static files', () => {
      const { loader } = makeLoader({ pathname: '/ALNScanner/' });
      const ch = loader.channel();
      expect(ch.manifestUrl).toBe('pack-manifest.json');
      expect(ch.fileUrl('tokens.json')).toBe('tokens.json');
    });
  });

  describe('network tier + staged refresh (§3)', () => {
    it('activates a new pack: staged fetch, sha1 verify, pointer flip, old-cache GC', async () => {
      const caches = makeCaches();
      const storage = makeStorage();
      await (await caches.open(`aln-pack-${HASH_A}`)).put('/tokens.json', new Response('{}')); // stale pack cache to GC
      const { loader } = makeLoader({
        caches,
        storage,
        routes: {
          'pack-manifest.json': jsonResponse(manifestFor(HASH_B, RULES_FILES)),
          'game.json': jsonResponse(GAME),
          'tokens.json': jsonResponse(TOKENS),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info).toEqual({ packId: 'about-last-night', version: '1.2.0', contentHash: HASH_B, source: 'network' });
      expect(pack.tokens).toEqual(TOKENS);
      expect(pack.gameConfig).toEqual(GAME);
      expect(JSON.parse(storage.getItem('aln_pack_active')).contentHash).toBe(HASH_B);
      expect(await caches.keys()).toEqual([`aln-pack-${HASH_B}`]); // old pack GC'd
    });

    it('fast path: unchanged manifest hash serves the activated cache without file downloads', async () => {
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.2.0', contentHash: HASH_B }),
      });
      const cache = await caches.open(`aln-pack-${HASH_B}`);
      await cache.put('/tokens.json', new Response(JSON.stringify(TOKENS)));
      await cache.put('/game.json', new Response(JSON.stringify(GAME)));

      const { loader, fetchFn } = makeLoader({
        caches,
        storage,
        routes: { 'pack-manifest.json': jsonResponse(manifestFor(HASH_B, RULES_FILES)) },
      });

      const pack = await loader.loadPack();

      expect(pack.info.source).toBe('network'); // network-verified
      expect(pack.tokens).toEqual(TOKENS);
      expect(fetchFn).toHaveBeenCalledTimes(1); // manifest only — no file re-downloads
    });

    it('sha1 mismatch discards staging and falls back — the active pack is never touched (§6)', async () => {
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.0.0', contentHash: HASH_A }),
      });
      const cache = await caches.open(`aln-pack-${HASH_A}`);
      await cache.put('/tokens.json', new Response(JSON.stringify(TOKENS)));

      const badFiles = [
        { path: 'game.json', role: 'game', sha1: 'WRONG', size: 1 },
        { path: 'tokens.json', role: 'tokens', sha1: sha1Of(TOKENS), size: 1 },
      ];
      const { loader } = makeLoader({
        caches,
        storage,
        routes: {
          'pack-manifest.json': jsonResponse(manifestFor(HASH_B, badFiles)),
          'game.json': jsonResponse(GAME),
          'tokens.json': jsonResponse(TOKENS),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info.contentHash).toBe(HASH_A); // still the OLD pack
      expect(pack.info.source).toBe('cache');
      expect(JSON.parse(storage.getItem('aln_pack_active')).contentHash).toBe(HASH_A); // pointer untouched
      expect(await caches.keys()).toEqual([`aln-pack-${HASH_A}`]); // staging discarded
    });

    it('every network fetch carries a timeout signal — a hung server cannot stall fail-hard startup (PR #12 review)', async () => {
      const caches = makeCaches();
      const { loader, fetchFn } = makeLoader({
        caches,
        storage: makeStorage(),
        routes: {
          'pack-manifest.json': jsonResponse(manifestFor(HASH_B, RULES_FILES)),
          'game.json': jsonResponse(GAME),
          'tokens.json': jsonResponse(TOKENS),
        },
      });

      await loader.loadPack();

      expect(fetchFn.mock.calls.length).toBeGreaterThan(0);
      for (const [, opts] of fetchFn.mock.calls) {
        expect(opts?.signal).toBeInstanceOf(AbortSignal);
      }
    });

    it('a manifest with no tokens.json rules file never activates — last-known-good pack survives (PR #12 review)', async () => {
      // Without the pre-pointer-write assert, an incomplete manifest would
      // "activate" an empty staging cache, GC the good pack, and strand the
      // device on the stale bundled tier at the next offline load.
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.0.0', contentHash: HASH_A }),
      });
      const cache = await caches.open(`aln-pack-${HASH_A}`);
      await cache.put('/tokens.json', new Response(JSON.stringify(TOKENS)));

      const tokenlessFiles = [
        { path: 'game.json', role: 'game', sha1: sha1Of(GAME), size: 1 },
        // no role:'tokens' entry — malformed / mid-publish / role drift
      ];
      const { loader } = makeLoader({
        caches,
        storage,
        routes: {
          'pack-manifest.json': jsonResponse(manifestFor(HASH_B, tokenlessFiles)),
          'game.json': jsonResponse(GAME),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info.contentHash).toBe(HASH_A); // still the OLD pack
      expect(pack.info.source).toBe('cache');
      expect(JSON.parse(storage.getItem('aln_pack_active')).contentHash).toBe(HASH_A); // pointer untouched
      expect(await caches.keys()).toEqual([`aln-pack-${HASH_A}`]); // staging discarded
    });

    it('a sha1-valid but EMPTY tokens.json never activates — shape checked before the pointer flip (PR #12 review)', async () => {
      // "{}" verifies fine against its manifest sha1 but is not a usable
      // token map. Without the shape check in staging, the pointer flipped
      // and _activate then threw OUT of loadPack, skipping every fallback.
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.0.0', contentHash: HASH_A }),
      });
      const cache = await caches.open(`aln-pack-${HASH_A}`);
      await cache.put('/tokens.json', new Response(JSON.stringify(TOKENS)));

      const EMPTY = {};
      const emptyTokenFiles = [
        { path: 'game.json', role: 'game', sha1: sha1Of(GAME), size: 1 },
        { path: 'tokens.json', role: 'tokens', sha1: sha1Of(EMPTY), size: 1 },
      ];
      const { loader } = makeLoader({
        caches,
        storage,
        routes: {
          'pack-manifest.json': jsonResponse(manifestFor(HASH_B, emptyTokenFiles)),
          'game.json': jsonResponse(GAME),
          'tokens.json': jsonResponse(EMPTY),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info.contentHash).toBe(HASH_A); // still the OLD pack
      expect(pack.info.source).toBe('cache');
      expect(JSON.parse(storage.getItem('aln_pack_active')).contentHash).toBe(HASH_A);
      expect(await caches.keys()).toEqual([`aln-pack-${HASH_A}`]);
    });

    it('a corrupted cached pack falls through to bundled instead of crashing the ladder (PR #12 review)', async () => {
      // Tier 2 holding a non-map (partial/corrupted Cache Storage write)
      // must read as "no cached pack", not throw past the bundled tier.
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.0.0', contentHash: HASH_A }),
      });
      const cache = await caches.open(`aln-pack-${HASH_A}`);
      await cache.put('/tokens.json', new Response(JSON.stringify([])));

      const { loader } = makeLoader({
        caches,
        storage,
        routes: {
          // manifest 404s (offline API) — bundled dist-root files present
          'tokens.json': jsonResponse(TOKENS),
          'game.json': jsonResponse(GAME),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info.source).toBe('bundled');
      expect(pack.tokens).toEqual(TOKENS);
    });
  });

  describe('cache tier (§2.2)', () => {
    it('offline devices run the last activated pack, labeled cache', async () => {
      const caches = makeCaches();
      const storage = makeStorage({
        aln_pack_active: JSON.stringify({ packId: 'about-last-night', version: '1.1.0', contentHash: HASH_A }),
      });
      const cache = await caches.open(`aln-pack-${HASH_A}`);
      await cache.put('/tokens.json', new Response(JSON.stringify(TOKENS)));

      const { loader } = makeLoader({ caches, storage, routes: {} }); // every fetch 404s (offline-ish)

      const pack = await loader.loadPack();

      expect(pack.info).toEqual({ packId: 'about-last-night', version: '1.1.0', contentHash: HASH_A, source: 'cache' });
      expect(pack.tokens).toEqual(TOKENS);
    });
  });

  describe('bundled tier (§2.3 — carries the HTTP-3/HTTP-4 hardening)', () => {
    it('first-run offline lands on the bundled snapshot', async () => {
      const { loader } = makeLoader({
        routes: {
          // Manifest 404s (mis-deploy / offline API) but the dist-root
          // token files are present — the §6 "manifest fetch 404s" row.
          'tokens.json': jsonResponse(TOKENS),
          'game.json': jsonResponse(GAME),
        },
      });

      const pack = await loader.loadPack();

      expect(pack.info.source).toBe('bundled');
      expect(pack.tokens).toEqual(TOKENS);
      expect(pack.gameConfig).toEqual(GAME);
    });

    it('HTTP-3: tries the dist root first, then data/ fallback', async () => {
      const { loader, fetchFn } = makeLoader({
        routes: { 'data/tokens.json': jsonResponse(TOKENS) }, // root missing
      });

      const pack = await loader.loadPack();

      expect(pack.tokens).toEqual(TOKENS);
      const urls = fetchFn.mock.calls.map(([u]) => u);
      expect(urls.indexOf('tokens.json')).toBeLessThan(urls.indexOf('data/tokens.json'));
    });

    it('HTTP-4: a 200 serving the SPA HTML shell is rejected (content-type guard)', async () => {
      const { loader } = makeLoader({
        routes: {
          'tokens.json': jsonResponse({ looksLikeAToken: { SF_RFID: 'x' } }, 'text/html'),
        },
      });

      await expect(loader.loadPack()).rejects.toThrow(/tokens\.json/);
    });

    it('rejects an empty token map instead of activating a blank database', async () => {
      const { loader } = makeLoader({
        routes: { 'tokens.json': jsonResponse({}) },
      });

      await expect(loader.loadPack()).rejects.toThrow(/empty|token map/);
    });

    it('getActivePack() exposes the load record for UI + handshake', async () => {
      const { loader } = makeLoader({
        routes: { 'tokens.json': jsonResponse(TOKENS) },
      });
      expect(loader.getActivePack()).toBeNull(); // pre-load

      await loader.loadPack();

      const info = loader.getActivePack();
      expect(info.source).toBe('bundled');
      expect(info.contentHash).toBeNull(); // no bundled manifest readable
    });
  });
});
