/**
 * Escape a value for safe embedding inside a DOUBLE-QUOTED CSS attribute
 * selector, e.g. `[data-service="${escapeCssAttrValue(id)}"]`.
 *
 * Intentionally does NOT use the global `CSS.escape`: jsdom (the Jest test
 * environment) does not implement `CSS`, so `CSS.escape(...)` throws and would
 * crash every renderer unit test that hits a cache-lookup selector. Inside a
 * double-quoted attribute selector only `\` and `"` (and, defensively, raw
 * newlines) need escaping — which is all a service/cue/scene id can ever
 * contain. Works identically in jsdom and real browsers.
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeCssAttrValue(value) {
  return String(value).replace(/[\\"\n\r\f]/g, (ch) => {
    if (ch === '\n') return '\\a ';
    if (ch === '\r') return '\\d ';
    if (ch === '\f') return '\\c ';
    return '\\' + ch; // backslash and double-quote
  });
}

export default escapeCssAttrValue;
