/**
 * dormancyWording — the GM-facing sentence for a dormant service's door.
 *
 * PARITY COPY of `backend/src/gameRules/dormancyWording.js`. The backend
 * builds its refusal messages from its copy; this one builds the dashboard
 * rows and the cue badges. They must say the same thing about the same
 * door — a GM who reads "not installed tonight" in a toast and "unavailable"
 * on the dashboard has to work out for themselves that it is one fact.
 * CHANGE BOTH TOGETHER.
 *
 * The wording differs in CASE only: the backend's fragments complete
 * "<service> is ...", these stand alone as a row's status text.
 */

const DOOR_WORDING = Object.freeze({
  profile: 'Not installed tonight',
  operator: 'Out of service',
});

/**
 * @param {'profile'|'operator'|undefined} door
 * @returns {string} the row text; a falsy or unknown door reads 'Dormant',
 *   because a dashboard must render something rather than throw (unlike the
 *   backend copy, whose callers always know the door).
 */
export function doorWording(door) {
  return Object.prototype.hasOwnProperty.call(DOOR_WORDING, door)
    ? DOOR_WORDING[door]
    : 'Dormant';
}

export { DOOR_WORDING };
