/**
 * Admin Module
 * Unified admin functionality extracted from admin panel
 * Extracted from monolith per Phase 4.1.4
 */

const AdminModule = {
    // Session Management
    SessionManager: class {
        constructor(connection) {
            this.connection = connection;
            this.currentSession = null;
        }

        async createSession(name) {
            const response = await fetch('/api/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create session');
            }

            const data = await response.json();
            if (data.id) {
                this.currentSession = data;
                this.updateDisplay(data);
            }
            return data;
        }

        async pauseSession() {
            if (!this.currentSession) return;

            const response = await fetch('/api/session', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ status: 'paused' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to pause session');
            }

            const data = await response.json();
            if (data.id) {
                this.currentSession = data;
                this.updateDisplay(data);
            }
            return data;
        }

        async resumeSession() {
            if (!this.currentSession) return;

            const response = await fetch('/api/session', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ status: 'active' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to resume session');
            }

            const data = await response.json();
            if (data.id) {
                this.currentSession = data;
                this.updateDisplay(data);
            }
            return data;
        }

        async endSession() {
            if (!this.currentSession) return;

            const response = await fetch('/api/session', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ status: 'completed' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to end session');
            }

            this.currentSession = null;
            this.updateDisplay(null);
            return response.json();
        }

        updateDisplay(session) {
            const idElement = document.getElementById('admin-session-id');
            const statusElement = document.getElementById('admin-session-status');

            if (idElement && statusElement) {
                if (session) {
                    idElement.textContent = session.id || '-';
                    statusElement.textContent = session.status || '-';
                } else {
                    idElement.textContent = '-';
                    statusElement.textContent = 'No Session';
                }
            }
        }
    },

    // Video Control
    VideoController: class {
        constructor(connection) {
            this.connection = connection;
            this.currentVideo = null;
            this.queueLength = 0;
        }

        async playVideo() {
            const response = await fetch('/api/video/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ action: 'play' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to play video');
            }

            return response.json();
        }

        async pauseVideo() {
            const response = await fetch('/api/video/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ action: 'pause' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to pause video');
            }

            return response.json();
        }

        async stopVideo() {
            const response = await fetch('/api/video/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ action: 'stop' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to stop video');
            }

            return response.json();
        }

        async skipVideo() {
            const response = await fetch('/api/video/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                },
                body: JSON.stringify({ action: 'skip' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to skip video');
            }

            return response.json();
        }

        updateDisplay(videoStatus) {
            const currentElement = document.getElementById('admin-current-video');
            const queueElement = document.getElementById('admin-queue-length');

            if (currentElement) {
                currentElement.textContent = videoStatus?.current || 'None';
            }
            if (queueElement) {
                queueElement.textContent = videoStatus?.queueLength || '0';
            }
        }
    },

    // System Monitoring
    SystemMonitor: class {
        constructor() {
            this.statusElements = {};
            this.devices = [];
        }

        updateOrchestratorStatus(status) {
            const element = document.getElementById('orchestrator-status');
            if (element) {
                element.className = status === 'connected' ? 'status-dot connected' : 'status-dot disconnected';
                element.title = status;
            }
        }

        updateVLCStatus(status) {
            const element = document.getElementById('vlc-status');
            if (element) {
                element.className = status === 'ready' ? 'status-dot connected' : 'status-dot disconnected';
                element.title = status;
            }
        }

        updateDeviceList(devices) {
            this.devices = devices;
            const countElement = document.getElementById('device-count');
            const listElement = document.getElementById('device-list');

            if (countElement) {
                countElement.textContent = devices.length;
            }

            if (listElement) {
                listElement.innerHTML = devices.map(device => `
                    <div class="device-item">
                        <span>${device.deviceId}</span>
                        <span class="device-type">${device.deviceType}</span>
                    </div>
                `).join('');
            }
        }

        refresh() {
            // Request latest status from server
            if (window.connectionManager?.client) {
                window.connectionManager.client.requestStateSync();
            }
        }
    },

    // Admin Operations
    AdminOperations: class {
        constructor(connection) {
            this.connection = connection;
        }

        async resetScores() {
            const response = await fetch('/api/admin/reset-scores', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to reset scores');
            }

            return response.json();
        }

        async clearTransactions() {
            const response = await fetch('/api/admin/clear-transactions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.connectionManager?.token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to clear transactions');
            }

            return response.json();
        }
    }
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminModule;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.AdminModule = AdminModule;
}
