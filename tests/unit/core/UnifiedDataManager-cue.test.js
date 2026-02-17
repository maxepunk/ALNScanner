/**
 * Unit Test: UnifiedDataManager - Cue State
 *
 * Verifies that the DataManager correctly manages ephemeral cue state
 * (active cues, disabled cues, conflicts) and emits the appropriate events.
 */

import { jest } from '@jest/globals';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager - Cue State', () => {
    let dataManager;

    beforeEach(() => {
        dataManager = new UnifiedDataManager();
        // Verify initial state
        const initialState = dataManager.getCueState();
        expect(initialState).toEqual({
            cues: new Map(),
            activeCues: new Map(),
            disabledCues: new Set()
        });
    });

    test('should load static cue definitions', () => {
        const cues = [
            { id: 'cue1', name: 'Intro', type: 'quickfire' },
            { id: 'cue2', name: 'Victory', type: 'compound' }
        ];

        dataManager.loadCues(cues);

        const state = dataManager.getCueState();
        expect(state.cues.size).toBe(2);
        expect(state.cues.get('cue1')).toEqual(cues[0]);
        expect(state.cues.get('cue2')).toEqual(cues[1]);
    });

    test('should update active cues on start/stop events', () => {
        // Setup known cues
        dataManager.loadCues([{ id: 'cue1', name: 'Test Cue' }]);

        const eventSpy = jest.fn();
        dataManager.addEventListener('cue-state:updated', eventSpy);

        // 1. Start Cue
        const startPayload = { cueId: 'cue1', state: 'running', progress: 0 };
        dataManager.updateCueStatus(startPayload);

        let state = dataManager.getCueState();
        expect(state.activeCues.has('cue1')).toBe(true);
        expect(state.activeCues.get('cue1')).toEqual(startPayload);
        expect(eventSpy).toHaveBeenCalledTimes(1);
        expect(eventSpy.mock.calls[0][0].detail.activeCues.get('cue1')).toEqual(startPayload);

        // 2. Complete Cue
        dataManager.updateCueStatus({ cueId: 'cue1', state: 'completed' });

        state = dataManager.getCueState();
        expect(state.activeCues.has('cue1')).toBe(false);
        expect(eventSpy).toHaveBeenCalledTimes(2);
    });

    test('should manage disabled cues (enable/disable)', () => {
        dataManager.loadCues([{ id: 'cue1', name: 'Test Cue' }]);

        // 1. Disable Cue
        dataManager.updateCueConfig({ cueId: 'cue1', enabled: false });

        let state = dataManager.getCueState();
        expect(state.disabledCues.has('cue1')).toBe(true);

        // 2. Enable Cue
        dataManager.updateCueConfig({ cueId: 'cue1', enabled: true });

        state = dataManager.getCueState();
        expect(state.disabledCues.has('cue1')).toBe(false);
    });

    test('should emit conflict event', () => {
        const conflictPayload = {
            cueId: 'cue2',
            conflictType: 'video_active',
            details: 'Video is currently playing'
        };

        const eventSpy = jest.fn();
        dataManager.addEventListener('cue:conflict', eventSpy);

        dataManager.handleCueConflict(conflictPayload);

        expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
            detail: conflictPayload
        }));
    });

    test('should handle unknown cues gracefully', () => {
        // Update status for unknown cue
        dataManager.updateCueStatus({ cueId: 'unknown_cue', state: 'running' });

        const state = dataManager.getCueState();
        // Should track it even if definition missing
        expect(state.activeCues.has('unknown_cue')).toBe(true);
    });
});
