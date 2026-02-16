/**
 * Unit Test: CueRenderer
 *
 * Verifies that the CueRenderer correctly renders cue UI elements with proper data-action attributes.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { CueRenderer } from '../../../../src/ui/renderers/CueRenderer.js';

describe('CueRenderer', () => {
  let renderer;
  let conflictContainer;

  beforeEach(() => {
    // Setup Mock DOM
    document.body.innerHTML = `
      <div id="cue-conflict-container"></div>
      <div id="quick-fire-grid"></div>
      <div id="standing-cues-list"></div>
      <div id="active-cues-list"></div>
    `;

    conflictContainer = document.getElementById('cue-conflict-container');
    renderer = new CueRenderer();
  });

  describe('renderConflict', () => {
    it('should render conflict buttons with correct data-action', () => {
      renderer.renderConflict({
        cueId: 'test-cue',
        reason: 'video_playing',
        currentVideo: 'intro.mp4'
      });

      const overrideBtn = document.querySelector('[data-action="admin.resolveConflictCue"][data-decision="override"]');
      const cancelBtn = document.querySelector('[data-action="admin.resolveConflictCue"][data-decision="cancel"]');

      expect(overrideBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(overrideBtn.getAttribute('data-cue-id')).toBe('test-cue');
      expect(cancelBtn.getAttribute('data-cue-id')).toBe('test-cue');
    });

    it('should display conflict information', () => {
      renderer.renderConflict({
        cueId: 'test-cue-2',
        reason: 'video_playing',
        currentVideo: 'scene-1.mp4'
      });

      const banner = conflictContainer.querySelector('.cue-conflict-banner');
      expect(banner).not.toBeNull();
      expect(banner.getAttribute('data-cue-id')).toBe('test-cue-2');
      expect(banner.textContent).toContain('Video Conflict');
      expect(banner.textContent).toContain('scene-1.mp4');
    });

    it('should handle missing conflict container gracefully', () => {
      conflictContainer.remove();

      // Should not throw error
      expect(() => {
        renderer.renderConflict({
          cueId: 'test-cue',
          reason: 'video_playing',
          currentVideo: 'intro.mp4'
        });
      }).not.toThrow();
    });
  });
});
