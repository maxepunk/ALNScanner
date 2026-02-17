/**
 * EnvironmentRenderer
 * Handles rendering of environment state (Lighting, Audio, Bluetooth) in the Admin Panel.
 *
 * @module ui/renderers/EnvironmentRenderer
 */

export class EnvironmentRenderer {
    constructor() {
        // Lighting Elements
        this.lightingSection = document.getElementById('lighting-section');
        this.lightingNotConnected = document.getElementById('lighting-not-connected');
        this.sceneGrid = document.getElementById('lighting-scenes');

        // Audio Elements
        this.audioRoutingContainer = document.getElementById('audio-routing-dropdowns');
        this.btWarning = document.getElementById('bt-warning');

        // Bluetooth Elements
        this.btDeviceList = document.getElementById('bt-device-list');
        this.btSpeakerCount = document.getElementById('bt-speaker-count');
        this.btScanBtn = document.getElementById('btn-bt-scan');
        this.btScanStatus = document.getElementById('bt-scan-status');

        // Constants
        this.STREAM_LABELS = {
            video: 'Video Audio',
            spotify: 'Spotify Music',
            sound: 'Sound Effects'
        };
    }

    /**
     * Render the full environment state
     * @param {Object} state - Environment state object
     * @param {Object} state.lighting - { connected, activeScene, scenes }
     * @param {Object} state.audio - { routes, ducking }
     * @param {Object} state.bluetooth - { scanning, foundedDevices, connectedDevices }
     */
    render(state) {
        if (!state) return;

        if (state.lighting) this.renderLighting(state.lighting);
        if (state.audio) this.renderAudio(state.audio);
        if (state.bluetooth) this.renderBluetooth(state.bluetooth);
    }

    /**
     * Render Lighting State
     * @param {Object} lightingState - { connected, activeScene, scenes }
     */
    renderLighting(lightingState) {
        if (!this.lightingSection) return;

        const { connected, activeScene, scenes } = lightingState;

        // Visibility
        this.lightingSection.style.display = ''; // Show section

        if (!connected) {
            if (this.lightingNotConnected) this.lightingNotConnected.style.display = 'block';
            if (this.sceneGrid) this.sceneGrid.style.display = 'none';
            return;
        }

        if (this.lightingNotConnected) this.lightingNotConnected.style.display = 'none';
        if (this.sceneGrid) {
            this.sceneGrid.style.display = 'grid';

            // Render Grid
            this.sceneGrid.innerHTML = scenes.map(scene => {
                const isActive = activeScene && (scene.id === activeScene.id);

                // Escape logic inline for simplicity or helper
                const safeId = this._escapeHtml(scene.id);
                const safeName = this._escapeHtml(scene.name);

                return `
          <button class="scene-tile ${isActive ? 'scene-tile--active' : ''}"
                  data-scene-id="${safeId}"
                  data-action="admin.activateScene">
            ${safeName}
          </button>
        `;
            }).join('');
        }
    }

    /**
     * Render Audio Routing State
     * @param {Object} audioState - { routes, ducking }
     * Note: This renderer usually needs the list of available sinks too.
     * However, payload usually triggers update. If we want to strictly render from state,
     * we need `availableSinks` which might be static or passed in state.
     * 
     * UnifiedDataManager.environmentState.audio.routes only has current routes.
     * We need available sinks to render the dropdown options.
     * 
     * Strategy: We'll assume the dropdowns are constructed elsewhere OR 
     * we need to fetch available sinks separately. 
     * 
     * Actually, MonitoringDisplay currently constructs dropdowns from `sync:full` payload which includes `availableSinks`.
     * UnifiedDataManager should probably store `availableSinks` in `environmentState.audio` too.
     * 
     * For now, we will update the VALUES of existing dropdowns.
     * If dropdowns don't exist, we can't render them without sink list.
     * 
     * Let's check if UnifiedDataManager stores availableSinks.
     * It does NOT currently. It updates routes.
     * 
     * We will stick to updating values of existing dropdowns for now,
     * as re-rendering options requires the sink list.
     */
    renderAudio(audioState) {
        const { routes, availableSinks } = audioState;

        // 1. Generate Dropdowns if sinks available
        if (availableSinks && availableSinks.length > 0 && this.audioRoutingContainer) {
            // Check if we need to rebuild (e.g. sinks changed or container empty)
            // For simplicity, we can rebuild if innerHTML is empty, or just always rebuild if sinks provided
            // To avoid losing focus/state, maybe check if we have dropdowns

            const currentDropdowns = this.audioRoutingContainer.querySelectorAll('select');
            if (currentDropdowns.length === 0 || this._sinksChanged(availableSinks)) {
                this._renderAudioDropdowns(availableSinks);
                this._lastKnownSinks = availableSinks;
            }
        }

        // 2. Update Selection Values
        if (routes) {
            Object.entries(routes).forEach(([stream, sink]) => {
                const dropdown = document.querySelector(`select[data-stream="${stream}"]`);
                if (dropdown) {
                    dropdown.value = sink;
                    // If sink doesn't match any option (e.g. 'hdmi' when only 'auto_null' exists),
                    // value becomes '' — fall back to first available option
                    if (!dropdown.value && dropdown.options.length > 0) {
                        dropdown.value = dropdown.options[0].value;
                    }
                }
            });
        }

        // Hide fallback warning if routing looks good (or we clear it)
        if (this.btWarning) this.btWarning.style.display = 'none';
    }

    _sinksChanged(newSinks) {
        if (!this._lastKnownSinks) return true;
        if (this._lastKnownSinks.length !== newSinks.length) return true;
        // Simple name check
        return !newSinks.every((s, i) => s.name === this._lastKnownSinks[i].name);
    }

    _renderAudioDropdowns(sinks) {
        if (!this.audioRoutingContainer) return;

        const streams = [
            { id: 'video', label: this.STREAM_LABELS.video },
            { id: 'spotify', label: this.STREAM_LABELS.spotify },
            { id: 'sound', label: this.STREAM_LABELS.sound }
        ];

        this.audioRoutingContainer.innerHTML = streams.map(stream => `
            <div class="audio-control-item">
                <label>${stream.label}</label>
                <select class="form-select" data-stream="${stream.id}" data-action="admin.setAudioRoute">
                    ${sinks.map(sink => `
                        <option value="${sink.name}">${sink.label || sink.description || sink.name}</option>
                    `).join('')}
                </select>
            </div>
        `).join('');
    }

    /**
     * Render Bluetooth State
     * @param {Object} btState - { scanning, foundedDevices, connectedDevices, pairedDevices }
     */
    renderBluetooth(btState) {
        const { scanning, foundedDevices, connectedDevices } = btState;

        // 1. Scan Button State
        if (this.btScanBtn) {
            if (scanning) {
                this.btScanBtn.textContent = 'Stop Scan';
                this.btScanBtn.dataset.action = 'admin.stopBtScan';
            } else {
                this.btScanBtn.textContent = 'Scan for Speakers';
                this.btScanBtn.dataset.action = 'admin.startBtScan';
            }
        }

        if (this.btScanStatus) {
            this.btScanStatus.style.display = scanning ? 'inline-block' : 'none';
        }

        // 2. Device List
        if (this.btDeviceList) {
            // Merge all relevant devices for display
            // We prioritize connected, then discovered (founded)
            // Note: DataManager might not have full paired list unless we sync it. 
            // Assuming connectedDevices and foundedDevices are the main source for now.

            const allDevices = [];

            // 1. Add connected devices
            connectedDevices.forEach(d => {
                allDevices.push({ ...d, status: 'connected' });
            });

            // 2. Add paired devices (that are not already connected)
            if (btState.pairedDevices) {
                btState.pairedDevices.forEach(d => {
                    const isConnected = allDevices.some(ad => ad.address === d.address);
                    if (!isConnected) {
                        allDevices.push({ ...d, status: 'paired' });
                    }
                });
            }

            // 3. Add discovered (founded) devices
            // Only add if not already in list (as connected or paired)
            foundedDevices.forEach(d => {
                const isKnown = allDevices.some(ad => ad.address === d.address);
                if (!isKnown) {
                    allDevices.push({ ...d, status: 'discovered' });
                }
            });

            if (allDevices.length === 0) {
                this.btDeviceList.innerHTML = '<p class="empty-state">No devices found</p>';
            } else {
                this.btDeviceList.innerHTML = allDevices.map(d => this._renderDeviceItem(d)).join('');
            }

            // 3. Count
            if (this.btSpeakerCount) {
                this.btSpeakerCount.textContent = allDevices.length > 0 ? String(allDevices.length) : '';
            }
        }
    }

    _renderDeviceItem(device) {
        const safeName = this._escapeHtml(device.name || device.address);
        const safeAddress = this._escapeHtml(device.address);
        const isConnected = device.status === 'connected';
        const isPaired = device.status === 'paired' || isConnected; // Connected implies paired usually

        // Status classes
        let itemClass = 'bt-device-item';
        if (isConnected) itemClass += ' bt-device-item--connected';
        else if (isPaired) itemClass += ' bt-device-item--paired';

        // Action button calculation
        let actionBtn = '';
        if (isConnected) {
            actionBtn = `
                <span class="bt-device-status status-connected">Connected</span>
                <button class="btn btn-xs btn-outline-danger"
                        data-action="admin.disconnectBtDevice"
                        data-bt-address="${safeAddress}">
                    Disconnect
                </button>
            `;
        } else if (isPaired) {
            // Paired but not connected -> Show Connect button
            actionBtn = `
                <button class="btn btn-xs btn-primary" 
                        data-action="admin.connectBtDevice" 
                        data-bt-address="${safeAddress}">
                    Connect
                </button>
            `;
        } else {
            // Discovered (Unpaired) -> Pair button
            actionBtn = `
                <button class="btn btn-xs btn-outline" 
                        data-action="admin.pairBtDevice" 
                        data-bt-address="${safeAddress}">
                    Pair
                </button>
            `;
        }

        return `
      <div class="${itemClass}" data-bt-address="${safeAddress}">
        <div class="bt-device-info">
            <span class="bt-device-name">${safeName}</span>
            <span class="bt-device-mac">${safeAddress}</span>
        </div>
        <div class="bt-device-actions">
            ${actionBtn}
        </div>
      </div>
    `;
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
