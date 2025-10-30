        class ConnectionManager {
            constructor() {
                this.client = null;
                this.status = 'disconnected';
                this.retryCount = 0;
                this.retryTimer = null;
                this.maxRetries = 5;
                this.baseRetryDelay = 5000;

                // Storage keys centralized
                this.STORAGE_KEYS = {
                    URL: 'orchestratorUrl',
                    TOKEN: 'gmToken',
                    STATION_ID: 'deviceId',
                    STATION_NAME: 'stationName',
                    STATION_MODE: 'mode',
                    ATTEMPT_AUTH: 'attemptOrchestratorAuth',
                    LAST_STATION_NUM: 'lastStationNum',
                    OFFLINE_QUEUE: 'orchestratorOfflineQueue'
                };
            }

            // ========== Storage Migration ==========

            migrateLocalStorage() {
                // Migrate old snake_case key to camelCase
                const oldUrl = localStorage.getItem('orchestrator_url');
                if (oldUrl && !localStorage.getItem(this.STORAGE_KEYS.URL)) {
                    localStorage.setItem(this.STORAGE_KEYS.URL, oldUrl);
                    localStorage.removeItem('orchestrator_url');
                    console.log('Migrated orchestrator_url to orchestratorUrl');
                }
            }

            // ========== Storage Management ==========

            get url() {
                return localStorage.getItem(this.STORAGE_KEYS.URL);
            }

            set url(value) {
                if (value) {
                    // Normalize URL: add https:// if no protocol specified
                    // HTTPS required for Web NFC API support
                    let normalizedUrl = value.trim();
                    if (!/^https?:\/\//i.test(normalizedUrl)) {
                        normalizedUrl = 'https://' + normalizedUrl;
                    }
                    localStorage.setItem(this.STORAGE_KEYS.URL, normalizedUrl);
                } else {
                    localStorage.removeItem(this.STORAGE_KEYS.URL);
                }
            }

            get token() {
                return localStorage.getItem(this.STORAGE_KEYS.TOKEN);
            }

            set token(value) {
                if (value) {
                    localStorage.setItem(this.STORAGE_KEYS.TOKEN, value);
                } else {
                    localStorage.removeItem(this.STORAGE_KEYS.TOKEN);
                }
            }

            get deviceId() {
                return localStorage.getItem(this.STORAGE_KEYS.STATION_ID) || `GM_STATION_${Date.now()}`;
            }

            set deviceId(value) {
                localStorage.setItem(this.STORAGE_KEYS.STATION_ID, value);
            }

            get stationName() {
                return localStorage.getItem(this.STORAGE_KEYS.STATION_NAME);
            }

            set stationName(value) {
                localStorage.setItem(this.STORAGE_KEYS.STATION_NAME, value);
            }

            get mode() {
                return localStorage.getItem(this.STORAGE_KEYS.STATION_MODE) || 'detective';
            }

            set mode(value) {
                localStorage.setItem(this.STORAGE_KEYS.STATION_MODE, value);
            }


            // ========== Token Management ==========

            isTokenValid() {
                const token = this.token;
                if (!token) return false;

                try {
                    // Decode JWT payload
                    const payload = JSON.parse(atob(token.split('.')[1]));

                    // Check expiry (with 5 minute buffer)
                    const now = Math.floor(Date.now() / 1000);
                    const buffer = 300; // 5 minutes

                    if (!payload.exp || payload.exp < (now + buffer)) {
                        console.log('Token expired or expiring soon');
                        return false;
                    }

                    return true;
                } catch (error) {
                    console.error('Invalid token format:', error);
                    UIManager.showError('Invalid token format. Please check your input.');
                    return false;
                }
            }

            getTokenExpiry() {
                const token = this.token;
                if (!token) return null;

                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    return payload.exp ? new Date(payload.exp * 1000) : null;
                } catch {
                    return null;
                }
            }

            // ========== Connection Management ==========

            async connect() {
                // Clear any existing retry timer
                this.clearRetryTimer();

                // In networked mode, always try to connect

                // Check if URL configured
                if (!this.url) {
                    this.setStatus('offline', 'No server configured');
                    return false;
                }

                // Check server health first
                const isReachable = await this.checkHealth();
                if (!isReachable) {
                    this.setStatus('disconnected', 'Server unreachable');
                    this.scheduleRetry();
                    return false;
                }

                // Check token validity
                if (!this.isTokenValid()) {
                    this.setStatus('auth_required', 'Authentication required');
                    showConnectionWizard();
                    return false;
                }

                // Create and connect client
                try {
                    if (this.client) {
                        this.client.disconnect();
                    }

                    this.client = new OrchestratorClient({
                        url: this.url,
                        deviceId: this.deviceId,
                        autoConnect: false
                    });

                    // Create NetworkedQueueManager now that we have a valid client
                    if (!window.queueManager) {
                        window.queueManager = new NetworkedQueueManager(this.client);
                        Debug.log('NetworkedQueueManager created with valid connection');

                        // Check for any pending transactions that were queued before auth
                        const pendingTransactions = localStorage.getItem('pendingNetworkedTransactions');
                        if (pendingTransactions) {
                            const transactions = JSON.parse(pendingTransactions);
                            Debug.log(`Found ${transactions.length} pending transactions to queue`);
                            transactions.forEach(tx => {
                                window.queueManager.queueTransaction(tx);
                            });
                            localStorage.removeItem('pendingNetworkedTransactions');
                        }
                    }

                    this.client.token = this.token;


                    // Set up event forwarding
                    this.setupClientEventHandlers();

                    // Connect
                    this.setStatus('connecting', 'Connecting...');
                    await this.client.connect();

                    // Reset retry count on success
                    this.retryCount = 0;
                    return true;

                } catch (error) {
                    console.error('Connection failed:', error);
                    UIManager.showError('Connection failed. Check network and orchestrator.');
                    this.setStatus('error', 'Connection failed');
                    this.scheduleRetry();
                    return false;
                }
            }

            disconnect() {
                this.clearRetryTimer();

                if (this.client) {
                    this.client.disconnect();
                    this.client = null;
                }

                this.setStatus('disconnected', 'Disconnected');
            }

            async checkHealth() {
                if (!this.url) return false;

                try {
                    const response = await fetch(`${this.url}/health`, {
                        method: 'GET',
                        mode: 'cors',
                        signal: AbortSignal.timeout(3000)
                    });
                    return response.ok;
                } catch {
                    return false;
                }
            }

            // ========== Retry Logic ==========

            scheduleRetry() {
                // Don't retry if user prefers offline

                // Don't retry beyond max attempts
                if (this.retryCount >= this.maxRetries) {
                    console.log('Max retry attempts reached');
                    return;
                }

                this.retryCount++;
                const delay = Math.min(
                    this.baseRetryDelay * Math.pow(2, this.retryCount - 1),
                    300000 // Max 5 minutes
                );

                console.log(`Scheduling retry ${this.retryCount}/${this.maxRetries} in ${delay/1000}s`);

                this.retryTimer = setTimeout(() => {
                    this.connect();
                }, delay);
            }

            clearRetryTimer() {
                if (this.retryTimer) {
                    clearTimeout(this.retryTimer);
                    this.retryTimer = null;
                }
            }

            // ========== Event Handling ==========

            setupClientEventHandlers() {
                if (!this.client) return;

                // Forward important events to UI
                this.client.on('status:changed', (status) => {
                    const statusMap = {
                        'connected': { status: 'connected', text: 'Connected' },
                        'connecting': { status: 'connecting', text: 'Connecting...' },
                        'disconnected': { status: 'disconnected', text: 'Disconnected' },
                        'offline': { status: 'offline', text: 'Offline Mode' },
                        'error': { status: 'error', text: 'Connection Error' }
                    };

                    const config = statusMap[status] || statusMap['disconnected'];
                    this.setStatus(config.status, config.text);

                    // Reset retry count on successful connection
                    if (status === 'connected') {
                        this.retryCount = 0;
                    }
                });

                this.client.on('connection:error', (error) => {
                    console.log('Connection error:', error);
                    this.scheduleRetry();
                });

                this.client.on('disconnect', (reason) => {
                    if (reason === 'io server disconnect') {
                        // Server initiated disconnect - try to reconnect
                        this.scheduleRetry();
                    }
                });
            }

            setStatus(status, message) {
                this.status = status;
                this.updateUI(status, message);
            }

            updateUI(status, message) {
                const indicator = document.getElementById('connectionStatus');
                if (!indicator) return;

                const textElement = indicator.querySelector('.status-text');

                // Clear all status classes
                indicator.classList.remove('connected', 'connecting', 'disconnected');

                // Add appropriate class
                const classMap = {
                    'connected': 'connected',
                    'connecting': 'connecting',
                    'disconnected': 'disconnected',
                    'offline': 'disconnected',
                    'error': 'disconnected',
                    'auth_required': 'disconnected',
                    'syncing': 'connecting'  // Show syncing as connecting animation
                };

                indicator.classList.add(classMap[status] || 'disconnected');

                // Update text
                if (textElement) {
                    let displayText = message;

                    // Check for pending items in NetworkedQueueManager
                    const queueStatus = window.queueManager?.getStatus();
                    const pendingCount = queueStatus ? queueStatus.queuedCount : 0;

                    // Show pending count if any exist
                    if (pendingCount > 0) {
                        displayText = `${message} (${pendingCount} pending)`;
                    } else if (queueStatus?.syncing) {
                        displayText = `${message} (syncing...)`;
                    }

                    textElement.textContent = displayText;
                }
            }


            // ========== Authentication ==========

            async authenticate(password) {
                if (!this.url) {
                    throw new Error('No server URL configured');
                }

                try {
                    const response = await fetch(`${this.url}/api/admin/auth`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });

                    if (!response.ok) {
                        throw new Error('Invalid password');
                    }

                    const { token } = await response.json();
                    this.token = token;
                    return token;

                } catch (error) {
                    console.error('Authentication failed:', error);
                    UIManager.showError('Authentication failed. Check password.');
                    throw error;
                }
            }

            // ========== Configuration ==========

            async configure(url, stationName, password) {
                try {
                    // Save URL and station info
                    this.url = url;
                    this.stationName = stationName;
                    this.deviceId = stationName.replace(/\s+/g, '_');

                    // Authenticate if password provided
                    if (password) {
                        await this.authenticate(password);
                    }

                    // Connect
                    const connected = await this.connect();
                    return connected;

                } catch (error) {
                    console.error('Configuration failed:', error);
                    UIManager.showError('Configuration failed. Check settings.');
                    throw error;
                }
            }

        }

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.ConnectionManager = ConnectionManager;
}
