/**
 * CommandSender - Shared WebSocket Command Utility
 * Eliminates duplicated _sendCommand code across admin modules
 *
 * Pattern: Send gm:command via WebSocket, wait for gm:command:ack
 * Timeout: 5 seconds (configurable)
 *
 * @module admin/utils/CommandSender
 */

/**
 * Send an admin command via WebSocket and wait for acknowledgment
 *
 * @param {Object} connection - OrchestratorClient instance (EventTarget)
 * @param {string} action - Command action (e.g., 'session:create', 'video:play')
 * @param {Object} payload - Command payload data
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<Object>} Resolves with response data on success
 * @throws {Error} On timeout or command failure
 *
 * @example
 * // Create a session
 * const response = await sendCommand(connection, 'session:create', { name: 'Game Night', teams: ['001', '002'] });
 *
 * @example
 * // Play video with custom timeout
 * const response = await sendCommand(connection, 'video:play', {}, 10000);
 */
export function sendCommand(connection, action, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      connection.removeEventListener('message:received', ackHandler);
      reject(new Error(`${action} timeout after ${timeout}ms`));
    }, timeout);

    // One-time handler for gm:command:ack
    const ackHandler = (event) => {
      const { type, payload: response } = event.detail;

      // Only process gm:command:ack events
      if (type !== 'gm:command:ack') return;

      // Cleanup
      clearTimeout(timeoutId);
      connection.removeEventListener('message:received', ackHandler);

      // Check response (response IS the data, already unwrapped by OrchestratorClient)
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.message || `Command failed: ${action}`));
      }
    };

    // Register one-time listener
    connection.addEventListener('message:received', ackHandler);

    // Send command via OrchestratorClient (uses AsyncAPI envelope wrapper)
    connection.send('gm:command', {
      action: action,
      payload: payload
    });
  });
}

/**
 * Create a bound command sender for a specific connection
 * Useful for modules that send many commands
 *
 * @param {Object} connection - OrchestratorClient instance
 * @returns {Function} Bound sendCommand function
 *
 * @example
 * const send = createCommandSender(this.connection);
 * await send('session:pause', {});
 */
export function createCommandSender(connection) {
  return (action, payload, timeout) => sendCommand(connection, action, payload, timeout);
}

export default { sendCommand, createCommandSender };
