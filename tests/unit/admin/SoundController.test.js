import SoundController from '../../../src/admin/SoundController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
}));

describe('SoundController', () => {
  let controller, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new EventTarget();
    controller = new SoundController(mockClient);
  });

  describe('playSound', () => {
    it('should play a sound with file only', async () => {
      await controller.playSound('tension.wav');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:play', { file: 'tension.wav' }, 5000
      );
    });

    it('should play a sound with target and volume', async () => {
      await controller.playSound('alarm.wav', 'sound:spot1', 80);
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:play',
        { file: 'alarm.wav', target: 'sound:spot1', volume: 80 },
        5000
      );
    });

    it('should accept custom timeout', async () => {
      await controller.playSound('long-track.wav', null, null, 10000);
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:play', { file: 'long-track.wav' }, 10000
      );
    });
  });

  describe('stopSound', () => {
    it('should stop a specific sound', async () => {
      await controller.stopSound('tension.wav');
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:stop', { file: 'tension.wav' }, 5000
      );
    });

    it('should stop all sounds when no file specified', async () => {
      await controller.stopSound();
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:stop', {}, 5000
      );
    });

    it('should stop all sounds when file is explicitly null', async () => {
      await controller.stopSound(null);
      expect(sendCommand).toHaveBeenCalledWith(
        mockClient, 'sound:stop', {}, 5000
      );
    });
  });

  describe('destroy', () => {
    it('should clean up without error', () => {
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
