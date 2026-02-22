/**
 * Convert raw sync:full cueEngine data to DM event detail format (Maps/Sets).
 * Matches the shape of cue-state:updated event.detail dispatched by UnifiedDataManager.
 * @param {Object} cueEngine - { loaded, cues[], activeCues[], disabledCues[] }
 * @returns {Object} { cues: Map, activeCues: Map, disabledCues: Set }
 */
export function cueStateFromSync(cueEngine) {
  return {
    cues: new Map((cueEngine.cues || []).map(c => [c.id, c])),
    activeCues: new Map((cueEngine.activeCues || []).map(c => [c.cueId, c])),
    disabledCues: new Set(cueEngine.disabledCues || [])
  };
}
