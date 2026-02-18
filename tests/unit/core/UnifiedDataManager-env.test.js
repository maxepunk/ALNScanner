import { UnifiedDataManager } from '../../../src/core/unifiedDataManager';

describe('UnifiedDataManager - Environment & Session State', () => {
    let dataManager;

    beforeEach(() => {
        dataManager = new UnifiedDataManager();
    });

    describe('Lighting State', () => {
        it('should initialize with default lighting state', () => {
            expect(dataManager.environmentState.lighting).toEqual({
                connected: false,
                activeScene: null,
                scenes: []
            });
        });

        it('should update lighting connection status', () => {
            dataManager.updateLightingState({ connected: true });
            expect(dataManager.environmentState.lighting.connected).toBe(true);

            dataManager.updateLightingState({ connected: false });
            expect(dataManager.environmentState.lighting.connected).toBe(false);
        });

        it('should update active scene', () => {
            dataManager.updateLightingState({
                sceneId: 'scene.game',
                sceneName: 'Game Mode'
            });
            expect(dataManager.environmentState.lighting.activeScene).toEqual({
                id: 'scene.game',
                name: 'Game Mode'
            });
        });

        it('should update scenes list on refresh', () => {
            const scenes = [
                { id: 'scene.game', name: 'Game' },
                { id: 'scene.party', name: 'Party' }
            ];
            dataManager.updateLightingState({ type: 'refreshed', scenes });
            expect(dataManager.environmentState.lighting.scenes).toEqual(scenes);
        });

        it('should emit lighting-state:updated event', () => {
            const listener = jest.fn();
            dataManager.addEventListener('lighting-state:updated', listener);

            dataManager.updateLightingState({ connected: true });
            expect(listener).toHaveBeenCalled();

            const event = listener.mock.calls[0][0];
            expect(event.detail.lighting.connected).toBe(true);
        });
    });

    describe('Audio State', () => {
        it('should initialize with default audio state', () => {
            expect(dataManager.environmentState.audio).toEqual({
                routes: {},
                ducking: {},
                availableSinks: []
            });
        });

        it('should update routing', () => {
            dataManager.updateAudioState({ stream: 'video', sink: 'hdmi' });
            expect(dataManager.environmentState.audio.routes['video']).toBe('hdmi');
        });

        it('should update ducking status', () => {
            dataManager.updateAudioDucking({ stream: 'spotify', ducked: true, volume: 50 });
            expect(dataManager.environmentState.audio.ducking['spotify']).toEqual({
                ducked: true,
                volume: 50
            });
        });

        it('should emit audio-state:updated event', () => {
            const listener = jest.fn();
            dataManager.addEventListener('audio-state:updated', listener);

            dataManager.updateAudioState({ stream: 'video', sink: 'hdmi' });
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Bluetooth State', () => {
        it('should initialize with default bluetooth state', () => {
            expect(dataManager.environmentState.bluetooth).toEqual({
                scanning: false,
                foundedDevices: [], // for discovery
                pairedDevices: [],
                connectedDevices: []
            });
        });

        it('should update scanning status', () => {
            dataManager.updateBluetoothScan({ scanning: true });
            expect(dataManager.environmentState.bluetooth.scanning).toBe(true);
        });

        it('should add discovered device', () => {
            const device = { address: 'AA:BB:CC', name: 'Speaker' };
            dataManager.updateBluetoothDevice({ type: 'discovered', device });

            // Should create entries in foundedDevices (checking dedup logic if we impl it)
            expect(dataManager.environmentState.bluetooth.foundedDevices).toContainEqual(device);
        });

        it('should update connected devices', () => {
            const device = { address: 'AA:BB:CC', name: 'Speaker', connected: true };
            dataManager.updateBluetoothDevice({ type: 'connected', device });

            expect(dataManager.environmentState.bluetooth.connectedDevices).toContainEqual(device);
        });

        it('should emit bluetooth-state:updated event', () => {
            const listener = jest.fn();
            dataManager.addEventListener('bluetooth-state:updated', listener);

            dataManager.updateBluetoothScan({ scanning: true });
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Session State', () => {
        it('should update session info from session:update', () => {
            const sessionData = {
                id: 'sess-123',
                name: 'Test Session',
                status: 'active',
                teams: []
            };

            dataManager.updateSessionState(sessionData);

            expect(dataManager.sessionState).toEqual(expect.objectContaining({
                id: 'sess-123',
                name: 'Test Session',
                status: 'active'
            }));
        });

        it('should emit session-state:updated', () => {
            const listener = jest.fn();
            dataManager.addEventListener('session-state:updated', listener);

            dataManager.updateSessionState({ id: '1' });
            expect(listener).toHaveBeenCalled();
        });

        it('should handle null payload (no active session)', () => {
            dataManager.updateSessionState({ id: 'sess-1', name: 'Old' });
            dataManager.updateSessionState(null);
            expect(dataManager.sessionState).toEqual({});
            expect(dataManager.currentSessionId).toBeNull();
        });

        it('should emit session-state:updated on null payload', () => {
            const listener = jest.fn();
            dataManager.addEventListener('session-state:updated', listener);
            dataManager.updateSessionState(null);
            expect(listener).toHaveBeenCalled();
        });
    });
});
