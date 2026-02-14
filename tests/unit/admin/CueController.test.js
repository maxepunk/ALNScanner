import CueController from '../../../src/admin/CueController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
}));

describe('CueController', () => {
  let controller, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new EventTarget();
    controller = new CueController(mockClient);
  });

  describe('fireCue', () => {
    it('should fire a cue', async () => {
      await controller.fireCue('tension-hit');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:fire', { cueId: 'tension-hit' }, 5000
      );
    });

    it('should accept custom timeout', async () => {
      await controller.fireCue('business-sale', 10000);
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:fire', { cueId: 'business-sale' }, 10000
      );
    });
  });

  describe('enableCue', () => {
    it('should enable a standing cue', async () => {
      await controller.enableCue('tech-discovered');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:enable', { cueId: 'tech-discovered' }, 5000
      );
    });
  });

  describe('disableCue', () => {
    it('should disable a standing cue', async () => {
      await controller.disableCue('tech-discovered');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:disable', { cueId: 'tech-discovered' }, 5000
      );
    });
  });

  describe('pauseCue (Phase 2)', () => {
    it('should pause a running compound cue', async () => {
      await controller.pauseCue('opening-sequence');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:pause', { cueId: 'opening-sequence' }, 5000
      );
    });

    it('should accept custom timeout', async () => {
      await controller.pauseCue('opening-sequence', 10000);
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:pause', { cueId: 'opening-sequence' }, 10000
      );
    });
  });

  describe('stopCue (Phase 2)', () => {
    it('should stop a running compound cue', async () => {
      await controller.stopCue('opening-sequence');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:stop', { cueId: 'opening-sequence' }, 5000
      );
    });
  });

  describe('resumeCue (Phase 2)', () => {
    it('should resume a paused compound cue', async () => {
      await controller.resumeCue('opening-sequence');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'cue:resume', { cueId: 'opening-sequence' }, 5000
      );
    });
  });

  describe('destroy', () => {
    it('should clean up without error', () => {
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
