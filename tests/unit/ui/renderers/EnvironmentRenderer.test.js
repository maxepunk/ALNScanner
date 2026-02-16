/**
 * Unit Test: EnvironmentRenderer
 *
 * Verifies that the EnvironmentRenderer correctly updates the DOM based on state.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { EnvironmentRenderer } from '../../../../src/ui/renderers/EnvironmentRenderer.js';

describe('EnvironmentRenderer', () => {
    let renderer;
    let btDeviceList;

    beforeEach(() => {
        // Setup Mock DOM
        document.body.innerHTML = `
            <div id="lighting-section" style="display: none;">
                <div id="lighting-not-connected" style="display: none;"></div>
                <div id="lighting-scenes" style="display: none;"></div>
            </div>
            <div id="audio-routing-dropdowns"></div>
            <div id="bt-warning" style="display: none;"></div>
            <div id="bt-device-list"></div>
            <div id="bt-speaker-count"></div>
            <button id="btn-bt-scan"></button>
            <div id="bt-scan-status" style="display: none;"></div>
        `;

        btDeviceList = document.getElementById('bt-device-list');
        renderer = new EnvironmentRenderer();
    });

    describe('Bluetooth Rendering', () => {
        it('should render disconnect button for connected devices', () => {
            renderer.renderBluetooth({
                scanning: false,
                connectedDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }],
                foundedDevices: []
            });

            const disconnectBtn = document.querySelector('[data-action="admin.disconnectBtDevice"]');
            expect(disconnectBtn).not.toBeNull();
            expect(disconnectBtn.dataset.btAddress).toBe('AA:BB:CC:DD:EE:FF');
        });

        it('should show connect button for paired but not connected devices', () => {
            renderer.renderBluetooth({
                scanning: false,
                connectedDevices: [],
                foundedDevices: [],
                pairedDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }]
            });

            const connectBtn = document.querySelector('[data-action="admin.connectBtDevice"]');
            expect(connectBtn).not.toBeNull();
            expect(connectBtn.dataset.btAddress).toBe('AA:BB:CC:DD:EE:FF');
        });

        it('should show pair button for discovered devices', () => {
            renderer.renderBluetooth({
                scanning: false,
                connectedDevices: [],
                foundedDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }]
            });

            const pairBtn = document.querySelector('[data-action="admin.pairBtDevice"]');
            expect(pairBtn).not.toBeNull();
            expect(pairBtn.dataset.btAddress).toBe('AA:BB:CC:DD:EE:FF');
        });

        it('should show empty state when no devices', () => {
            renderer.renderBluetooth({
                scanning: false,
                connectedDevices: [],
                foundedDevices: []
            });

            expect(btDeviceList.innerHTML).toContain('No devices found');
        });

        it('should toggle scan button state when scanning', () => {
            const btnScan = document.getElementById('btn-bt-scan');

            renderer.renderBluetooth({
                scanning: true,
                connectedDevices: [],
                foundedDevices: []
            });

            expect(btnScan.textContent).toBe('Stop Scan');
            expect(btnScan.dataset.action).toBe('admin.stopBtScan');

            renderer.renderBluetooth({
                scanning: false,
                connectedDevices: [],
                foundedDevices: []
            });

            expect(btnScan.textContent).toBe('Scan for Speakers');
            expect(btnScan.dataset.action).toBe('admin.startBtScan');
        });
    });
});
