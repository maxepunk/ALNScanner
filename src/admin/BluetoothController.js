/**
 * BluetoothController - Bluetooth Device Control
 * Manages Bluetooth scanning, pairing, and connection commands via WebSocket
 *
 * User Stories:
 * - GM scans for nearby Bluetooth speakers
 * - GM pairs/unpairs Bluetooth audio devices
 * - GM connects/disconnects Bluetooth devices for audio output
 *
 * @module admin/BluetoothController
 */

import { sendCommand } from './utils/CommandSender.js';

export class BluetoothController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Start scanning for nearby Bluetooth devices
   * @param {number} [timeout] - Optional scan timeout in milliseconds
   * @returns {Promise<Object>} Scan response with discovered devices
   */
  async startScan(timeout) {
    return sendCommand(this.connection, 'bluetooth:scan:start', timeout ? { timeout } : {});
  }

  /**
   * Stop an in-progress Bluetooth scan
   * @returns {Promise<Object>} Stop response
   */
  async stopScan() {
    return sendCommand(this.connection, 'bluetooth:scan:stop', {});
  }

  /**
   * Pair with a Bluetooth device
   * @param {string} address - Bluetooth MAC address (e.g., "AA:BB:CC:DD:EE:FF")
   * @returns {Promise<Object>} Pair response
   */
  async pairDevice(address) {
    // Backend pairing can take up to 22s (10s connect + 12s scan buffer)
    // We use 45s to be safe
    return sendCommand(this.connection, 'bluetooth:pair', { address }, 45000);
  }

  /**
   * Unpair a previously paired Bluetooth device
   * @param {string} address - Bluetooth MAC address
   * @returns {Promise<Object>} Unpair response
   */
  async unpairDevice(address) {
    return sendCommand(this.connection, 'bluetooth:unpair', { address }, 15000);
  }

  /**
   * Connect to a paired Bluetooth device
   * @param {string} address - Bluetooth MAC address
   * @returns {Promise<Object>} Connect response
   */
  async connectDevice(address) {
    // Backend connect uses 10s timeout by default
    // We use 30s to be safe
    return sendCommand(this.connection, 'bluetooth:connect', { address }, 30000);
  }

  /**
   * Disconnect from a connected Bluetooth device
   * @param {string} address - Bluetooth MAC address
   * @returns {Promise<Object>} Disconnect response
   */
  async disconnectDevice(address) {
    return sendCommand(this.connection, 'bluetooth:disconnect', { address }, 15000);
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // BluetoothController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default BluetoothController;
