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

    const mockCueEngine = {
        loaded: true,
        cues: [
            { id: 'tension-hit', label: 'Tension Hit', quickFire: true, icon: 'tension' },
            { id: 'clock-warning', label: '30 Min Warning', triggerType: 'clock', quickFire: false }
        ],
        activeCues: [
            { cueId: 'tension-hit', state: 'running', progress: 0.5, duration: 3 }
        ],
        disabledCues: ['clock-warning']
    };

    // --- syncCueState tests (sync:full integration) ---

    test('syncCueState loads definitions, active cues, and disabled cues', () => {
        dataManager.syncCueState(mockCueEngine);

        const state = dataManager.getCueState();
        expect(state.cues.size).toBe(2);
        expect(state.cues.get('tension-hit').quickFire).toBe(true);
        expect(state.activeCues.size).toBe(1);
        expect(state.activeCues.get('tension-hit').state).toBe('running');
        expect(state.disabledCues.has('clock-warning')).toBe(true);
    });

    test('syncCueState dispatches cue-state:updated event', (done) => {
        dataManager.addEventListener('cue-state:updated', (e) => {
            expect(e.detail.cues.size).toBe(2);
            done();
        });
        dataManager.syncCueState(mockCueEngine);
    });

    test('syncCueState with loaded:false clears cue state', () => {
        dataManager.syncCueState(mockCueEngine); // Load first
        dataManager.syncCueState({ loaded: false, cues: [], activeCues: [], disabledCues: [] });

        const state = dataManager.getCueState();
        expect(state.cues.size).toBe(0);
        expect(state.activeCues.size).toBe(0);
    });

    test('cue definitions persist after updateCueStatus', () => {
        dataManager.syncCueState(mockCueEngine);
        dataManager.updateCueStatus({ cueId: 'tension-hit', state: 'completed' });

        const state = dataManager.getCueState();
        // Definitions MUST still be there
        expect(state.cues.size).toBe(2);
        expect(state.cues.get('tension-hit').quickFire).toBe(true);
        // But active cues should reflect the completion
        expect(state.activeCues.has('tension-hit')).toBe(false);
    });

    // --- Existing cue state tests (updated to use syncCueState) ---

    test('should load static cue definitions via syncCueState', () => {
        const cues = [
            { id: 'cue1', name: 'Intro', type: 'quickfire' },
            { id: 'cue2', name: 'Victory', type: 'compound' }
        ];

        dataManager.syncCueState({ loaded: true, cues, activeCues: [], disabledCues: [] });

        const state = dataManager.getCueState();
        expect(state.cues.size).toBe(2);
        expect(state.cues.get('cue1')).toEqual(cues[0]);
        expect(state.cues.get('cue2')).toEqual(cues[1]);
    });

    test('should update active cues on start/stop events', () => {
        // Setup known cues
        dataManager.syncCueState({ loaded: true, cues: [{ id: 'cue1', name: 'Test Cue' }], activeCues: [], disabledCues: [] });

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
        dataManager.syncCueState({ loaded: true, cues: [{ id: 'cue1', name: 'Test Cue' }], activeCues: [], disabledCues: [] });

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
