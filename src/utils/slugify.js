/**
 * slugifyId — one pack id, ONE css-safe class token (A3 slice 3c).
 *
 * Mode ids are schema-patterned (^[a-z0-9][a-z0-9-]*$) but memory-type
 * keys carry NO pattern: a pack type like "Deep Cover" lowercased into
 * a class attribute used to emit TWO classes. Every class-name
 * interpolation of a pack id goes through this instead — lowercase,
 * and any run of characters outside [a-z0-9-] collapses to a single
 * '-' (markup can never survive into a class token).
 *
 * @param {*} id - pack-declared mode/type id
 * @returns {string} css-safe token ('' for null/undefined)
 */
export function slugifyId(id) {
    if (id === null || id === undefined) return '';
    return String(id).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

export default slugifyId;
