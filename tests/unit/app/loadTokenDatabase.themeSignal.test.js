/**
 * @jest-environment jsdom
 */

// Theme unit ST.2 review (spec finding 3): the 'theme: declined'
// settings signal was tested only at the renderPackInfo format layer.
// This test drives the REAL WIRING (§4a OBJ-2): loadTokenDatabase must
// derive {declared, applied} from tokenManager's retained gameConfig +
// the live theme module and land the note on the pack line.

import { describe, it, expect, afterEach, jest } from '@jest/globals';

jest.mock('../../../src/core/packLoader.js', () => ({
  __esModule: true,
  default: {
    getActivePack: () => ({
      packId: 'about-last-night', version: '1.2.0',
      contentHash: `sha256:${'d'.repeat(64)}`, source: 'network',
    }),
  },
}));

import { loadTokenDatabase } from '../../../src/app/initializationSteps.js';
import { applyPackTheme, _resetThemeForTesting } from '../../../src/core/theme.js';

const PACK_DOM = `
  <div id="packInfoLine" style="display: none;">Pack:
    <span id="packInfoDisplay"></span>
    <span id="packBundledBadge" style="display: none;">⚠ bundled</span>
  </div>`;

afterEach(() => {
  _resetThemeForTesting();
  document.body.innerHTML = '';
});

describe('loadTokenDatabase wires the theme provenance signal (theme unit §4a OBJ-2)', () => {
  it("a DECLARED theme that DECLINEd lands 'theme: declined' on the pack line", async () => {
    document.body.innerHTML = PACK_DOM;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // The sidecar DECLINEs (headerless) — the state loadDatabase leaves
    // behind when the pack's declared theme is unusable.
    applyPackTheme({ colors: { modeScoring: '#f0a020' } });
    warn.mockRestore();

    const tokenManager = {
      loadDatabase: jest.fn().mockResolvedValue(true),
      gameConfig: { theme: 'theme.json' },
    };
    await loadTokenDatabase(tokenManager, { showError: jest.fn() });

    expect(document.getElementById('packInfoDisplay').textContent).toContain('theme: declined');
  });

  it('an APPLIED declared theme shows no note', async () => {
    document.body.innerHTML = PACK_DOM;
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'none' } });

    const tokenManager = {
      loadDatabase: jest.fn().mockResolvedValue(true),
      gameConfig: { theme: 'theme.json' },
    };
    await loadTokenDatabase(tokenManager, { showError: jest.fn() });

    expect(document.getElementById('packInfoDisplay').textContent).not.toContain('theme: declined');
  });
});
