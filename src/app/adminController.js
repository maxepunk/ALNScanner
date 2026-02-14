/**
 * AdminController - Admin Module Lifecycle Manager
 * ES6 Module - Browser Only
 *
 * Responsibilities:
 * - Creates all admin modules once
 * - Guards against re-initialization
 * - Coordinates pause/resume on connection state changes
 * - Clean module destruction
 *
 * Does NOT handle:
 * - Connection state (ConnectionManager)
 * - WebSocket messages (OrchestratorClient)
 * - Token management (ConnectionManager)
 */

import { SessionManager } from '../admin/SessionManager.js';
import { VideoController } from '../admin/VideoController.js';
import { DisplayController } from '../admin/DisplayController.js';
import { SystemMonitor } from '../admin/SystemMonitor.js';
import { AdminOperations } from '../admin/AdminOperations.js';
import { MonitoringDisplay } from '../admin/MonitoringDisplay.js';
import { BluetoothController } from '../admin/BluetoothController.js';
import { AudioController } from '../admin/AudioController.js';
import { LightingController } from '../admin/LightingController.js';
import { CueController } from '../admin/CueController.js';
import { SoundController } from '../admin/SoundController.js';
import { SpotifyController } from '../admin/SpotifyController.js';

export class AdminController extends EventTarget {
  constructor(client, dataManager, teamRegistry = null) {
    super();
    this.client = client; // OrchestratorClient reference for admin modules to use
    this.dataManager = dataManager; // DataManager reference for MonitoringDisplay
    this.teamRegistry = teamRegistry; // TeamRegistry for team dropdown sync
    this.modules = null;
    this.initialized = false;
  }

  /**
   * Initialize all admin modules
   * Guards against re-initialization
   * @emits initialized - Admin modules ready
   */
  initialize() {
    // Guard against re-initialization
    if (this.initialized) {
      console.warn('AdminController: Already initialized');
      return;
    }

    // Create all admin modules with dependency injection
    this.modules = {
      sessionManager: new SessionManager(this.client),
      videoController: new VideoController(this.client),
      displayController: new DisplayController(this.client),
      systemMonitor: new SystemMonitor(this.client),
      adminOperations: new AdminOperations(this.client),
      monitoringDisplay: new MonitoringDisplay(this.client, this.dataManager, this.teamRegistry),
      bluetoothController: new BluetoothController(this.client),
      audioController: new AudioController(this.client),
      lightingController: new LightingController(this.client),
      cueController: new CueController(this.client),
      soundController: new SoundController(this.client),
      spotifyController: new SpotifyController(this.client)
    };

    this.initialized = true;
    this.dispatchEvent(new CustomEvent('initialized'));
  }

  /**
   * Get specific admin module
   * @param {string} name - Module name (sessionManager, videoController, systemMonitor, etc.)
   * @returns {Object} Module instance
   * @throws {Error} If not initialized
   */
  getModule(name) {
    if (!this.initialized) {
      throw new Error('Admin modules not initialized');
    }

    if (!this.modules[name]) {
      throw new Error(`Unknown module: ${name}`);
    }

    return this.modules[name];
  }

  /**
   * Pause admin operations (called on disconnect)
   */
  pause() {
    if (!this.modules) return;

    // Pause modules that support pausing
    if (this.modules.sessionManager?.pause) {
      this.modules.sessionManager.pause();
    }
    if (this.modules.videoController?.pause) {
      this.modules.videoController.pause();
    }
  }

  /**
   * Resume admin operations (called on reconnect)
   */
  resume() {
    if (!this.modules) return;

    // Resume modules that support resuming
    if (this.modules.sessionManager?.resume) {
      this.modules.sessionManager.resume();
    }
    if (this.modules.videoController?.resume) {
      this.modules.videoController.resume();
    }
    if (this.modules.monitoringDisplay?.resume) {
      this.modules.monitoringDisplay.resume();
    }
  }

  /**
   * Destroy all admin modules
   */
  destroy() {
    // Graceful cleanup - no error if not initialized
    if (!this.modules) return;

    // Destroy all modules
    Object.values(this.modules).forEach(module => {
      if (module?.destroy) {
        module.destroy();
      }
    });

    this.modules = null;
    this.initialized = false;
  }
}

// Named and default exports
export default AdminController;
