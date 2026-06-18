/**
 * Environment Domain
 *
 * Owns: bluetooth, audio routing/volume, lighting, music.
 * At the app.js level this domain has no direct coordination methods —
 * the environment controllers (BluetoothController, AudioController,
 * LightingController, MusicController) live in src/admin/ and are wired
 * via AdminController/MonitoringDisplay. This module exists as the explicit
 * domain boundary for Phase 3 work.
 *
 * Any future app-level wiring for environment concerns (e.g. a quick-access
 * toggle on the scan screen, or an app-level volume shortcut) belongs here.
 *
 * @module app/domains/environment
 */

export class EnvironmentDomain {
  /**
   * @param {import('../app.js').App} app - The App instance (provides collaborators)
   */
  constructor(app) {
    this.app = app;
  }

  // Placeholder — environment coordination for app-level concerns goes here.
  // Controllers are in src/admin/{Bluetooth,Audio,Lighting,Music}Controller.js
  // and src/ui/renderers/EnvironmentRenderer.js.
}
