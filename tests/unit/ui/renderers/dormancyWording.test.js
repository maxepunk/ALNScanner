import { doorWording } from '../../../../src/ui/renderers/dormancyWording.js';

/**
 * Block 2 T1a D13 — the scanner half of the door wording. A parity copy of
 * the backend helper; this suite pins the two sentences and the difference
 * that is deliberate: the scanner NEVER throws on an unknown door, because
 * a dashboard has to render something.
 */
describe('doorWording (scanner parity copy)', () => {
  it('profile → "Not installed tonight"', () => {
    expect(doorWording('profile')).toBe('Not installed tonight');
  });

  it('operator → "Out of service"', () => {
    expect(doorWording('operator')).toBe('Out of service');
  });

  it('falls back to "Dormant" rather than throwing', () => {
    expect(doorWording(undefined)).toBe('Dormant');
    expect(doorWording(null)).toBe('Dormant');
    expect(doorWording('cosmic-ray')).toBe('Dormant');
  });
});
