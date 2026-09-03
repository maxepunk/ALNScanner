/**
 * Slice 7 — the report-export provenance warn.
 *
 * The exported markdown carries no pack identity (a stamp would break the
 * contract bytes), so the download path warns when the applied wording may
 * not be the pack the session ran under. Two stale shapes: wording applied
 * from a non-network tier, and a pack that DECLARES a strings sidecar none
 * of which is applied (baked voice on a worded pack). Pack identity comes
 * from tokenManager's retained load record — the domain never imports
 * packLoader (App stays the sole injection point).
 */

import { GameAdminDomain } from '../../../src/app/domains/gameAdmin.js';
import { applyPackStrings } from '../../../src/core/strings.js';

const makeApp = ({ packInfo, gameConfig } = {}) => ({
  dataManager: {
    getSessionData: () => ({ name: 'Prov Night', startTime: '2026-09-01T01:00:00.000Z', endTime: '2026-09-01T02:00:00.000Z', teams: [] }),
    getTeamScores: () => [],
    getTransactions: () => [],
    getPlayerScans: () => [],
  },
  tokenManager: {
    database: {},
    packInfo: packInfo ?? { packId: 'about-last-night', version: '1.0.0', contentHash: 'x', source: 'network' },
    gameConfig: gameConfig ?? null,
  },
  uiManager: { showError: jest.fn(), showToast: jest.fn() },
});

describe('downloadSessionReport provenance warn', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.URL.createObjectURL = jest.fn(() => 'blob:x');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    applyPackStrings(null);
  });

  const reportWarns = () => warnSpy.mock.calls.filter(([msg]) => String(msg).startsWith('[report]'));

  it('warns when the active pack wording came from a non-network tier', async () => {
    const app = makeApp({ packInfo: { packId: 'about-last-night', version: '1.0.0', contentHash: 'x', source: 'cache' } });
    await new GameAdminDomain(app).downloadSessionReport();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("'cache' tier"));
  });

  it('warns when the pack DECLARES a strings sidecar but none is applied (baked voice on a worded pack)', async () => {
    const app = makeApp({ gameConfig: { strings: 'strings.json' } });
    await new GameAdminDomain(app).downloadSessionReport();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('declares a strings sidecar'));
  });

  it('stays silent for network-fresh wording with the declared sidecar applied', async () => {
    applyPackStrings({ kind: 'strings', schemaVersion: 2, report: { adjustmentLabel: 'Fine' } });
    const app = makeApp({ gameConfig: { strings: 'strings.json' } });
    await new GameAdminDomain(app).downloadSessionReport();
    expect(reportWarns()).toHaveLength(0);
  });

  it('stays silent for network-fresh wording on a pack that declares no strings', async () => {
    await new GameAdminDomain(makeApp()).downloadSessionReport();
    expect(reportWarns()).toHaveLength(0);
  });
});
