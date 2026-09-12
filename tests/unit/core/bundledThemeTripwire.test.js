/**
 * Theme unit close review (state F2): the scanner's BUNDLED pack (the
 * data/ submodule, shipped into dist/ via vite publicDir) is the
 * offline/Pages tier's only pack — if it lags the themed TokenData,
 * ALN's ruled star-drop silently does not happen on that tier, and
 * `declared` is false so even the 'theme: declined' note cannot fire.
 * Scoring and currency already carry bundled drift tripwires; this is
 * the theme's. It pins the WHOLE ruled file (the deep-equal
 * discipline, §4a OBJ-3) plus the game.json declaration pair.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../../data');

describe('bundled pack theme drift tripwire (close review F2)', () => {
  it("data/game.json declares the theme pointer + theme.identity (the bundled tier's star-drop switch)", () => {
    const game = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'game.json'), 'utf8'));
    expect(game.theme).toBe('theme.json');
    expect(game.requires).toContain('theme.identity');
  });

  it("data/theme.json IS the ruled star-drop — one deep-equal on the whole file", () => {
    const theme = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'theme.json'), 'utf8'));
    expect(theme).toEqual({ kind: 'theme', schemaVersion: 1, rating: { display: 'none' } });
  });
});
