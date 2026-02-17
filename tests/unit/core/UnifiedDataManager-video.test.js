/**
 * Unit Test: UnifiedDataManager - Video State
 *
 * Verifies that the DataManager correctly manages ephemeral video state
 * and emits the appropriate events.
 */

import { jest } from '@jest/globals';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager - Video State', () => {
    let dataManager;

    beforeEach(() => {
        dataManager = new UnifiedDataManager();
        // Verify initial state is null or default
        expect(dataManager.getVideoState()).toEqual({
            nowPlaying: null,
            isPlaying: false,
            progress: 0,
            duration: 0
        });
    });

    test('should update video state and emit video-state:updated event', () => {
        const videoPayload = {
            nowPlaying: 'Test Video.mp4',
            isPlaying: true,
            progress: 0.5,
            duration: 120
        };

        const eventSpy = jest.fn();
        dataManager.addEventListener('video-state:updated', eventSpy);

        dataManager.updateVideoState(videoPayload);

        // Verify getter returns new state
        expect(dataManager.getVideoState()).toEqual(videoPayload);

        // Verify event was emitted
        expect(eventSpy).toHaveBeenCalledTimes(1);
        const event = eventSpy.mock.calls[0][0];
        expect(event.detail).toEqual(videoPayload);
    });

    test('should merge partial updates', () => {
        // Initial setup
        dataManager.updateVideoState({
            nowPlaying: 'Movie.mp4',
            isPlaying: true,
            progress: 0.1,
            duration: 100
        });

        // Partial update (e.g., just progress)
        const partialUpdate = { progress: 0.2 };
        dataManager.updateVideoState(partialUpdate);

        const expectedState = {
            nowPlaying: 'Movie.mp4',
            isPlaying: true, // Should persist
            progress: 0.2,   // Should update
            duration: 100    // Should persist
        };

        expect(dataManager.getVideoState()).toEqual(expectedState);
    });
});
