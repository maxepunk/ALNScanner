/**
 * Slice 7 — the report-export provenance warn.
 *
 * The exported markdown carries no pack identity (a stamp would break the
 * contract bytes), so the download path warns when the applied pack
 * wording did not come from the network tier — the only staleness signal
 * at the point of export.
 */

import { GameAdminDomain } from '../../../src/app/domains/gameAdmin.js';

let mockSource = 'cache';
jest.mock('../../../src/core/packLoader.js', () => ({
  packLoader: {
    getActivePack: () => ({ packId: 'about-last-night', version: '1.0.0', contentHash: 'x', source: mockSource }),
  },
  PACK_SCHEMA_VERSION: 2,
}));

const makeApp = () => ({
  dataManager: {
    getSessionData: () => ({ name: 'Prov Night', startTime: '2026-09-01T01:00:00.000Z', endTime: '2026-09-01T02:00:00.000Z', teams: [] }),
    getTeamScores: () => [],
    getTransactions: () => [],
    getPlayerScans: () => [],
  },
  tokenManager: { database: {} },
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
  });

  it('warns when the active pack wording came from a non-network tier', async () => {
    mockSource = 'cache';
    await new GameAdminDomain(makeApp()).downloadSessionReport();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("'cache' tier"));
  });

  it('stays silent for network-fresh wording', async () => {
    mockSource = 'network';
    await new GameAdminDomain(makeApp()).downloadSessionReport();
    const reportWarns = warnSpy.mock.calls.filter(([msg]) => String(msg).startsWith('[report]'));
    expect(reportWarns).toHaveLength(0);
  });
});
