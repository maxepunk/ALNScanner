/**
 * SystemMonitor - Health Monitoring
 * Checks backend and VLC connectivity via HTTP
 *
 * User Stories:
 * - GM monitors orchestrator health status
 * - GM monitors VLC connection status
 * - System displays health indicators in admin panel
 *
 * Note: Uses HTTP fetch (not WebSocket) for health checks
 *
 * @module admin/SystemMonitor
 */

export class SystemMonitor {
  /**
   * @param {Object} connection - OrchestratorClient instance (for config.url)
   */
  constructor(connection) {
    this.connection = connection;
    this.backendHealth = null;
    this.vlcHealth = null;
  }

  /**
   * Check backend health via HTTP
   * @returns {Promise<string>} Health status: 'healthy' | 'unhealthy' | 'error'
   */
  async checkHealth() {
    try {
      const baseUrl = this.connection?.config?.url || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/health`);
      this.backendHealth = response.ok ? 'healthy' : 'unhealthy';
      return this.backendHealth;
    } catch (error) {
      this.backendHealth = 'error';
      throw error;
    }
  }

  /**
   * Get cached backend health status
   * @returns {string|null} Last known health status
   */
  getBackendHealth() {
    return this.backendHealth;
  }

  /**
   * Get cached VLC health status
   * @returns {string|null} Last known VLC status
   */
  getVlcHealth() {
    return this.vlcHealth;
  }

  /**
   * Update VLC health from sync:full data
   * @param {string} status - VLC status from backend
   */
  setVlcHealth(status) {
    this.vlcHealth = status;
  }

  /**
   * Cleanup (no event listeners)
   */
  destroy() {
    // SystemMonitor uses HTTP fetch only, no WebSocket listeners
  }
}

export default SystemMonitor;
