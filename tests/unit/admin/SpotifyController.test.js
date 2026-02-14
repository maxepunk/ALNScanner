import SpotifyController from '../../../src/admin/SpotifyController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
}));

describe('SpotifyController', () => {
  let controller, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new EventTarget();
    controller = new SpotifyController(mockClient);
  });

  afterEach(() => { controller.destroy(); });

  it('should send spotify:play', async () => {
    await controller.play();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'spotify:play', {}, 5000);
  });

  it('should send spotify:pause', async () => {
    await controller.pause();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'spotify:pause', {}, 5000);
  });

  it('should send spotify:next', async () => {
    await controller.next();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'spotify:next', {}, 5000);
  });

  it('should send spotify:playlist with URI', async () => {
    await controller.setPlaylist('spotify:playlist:act2');
    expect(sendCommand).toHaveBeenCalledWith(
      mockClient, 'spotify:playlist', { uri: 'spotify:playlist:act2' }, 5000
    );
  });

  it('should send spotify:volume', async () => {
    await controller.setVolume(75);
    expect(sendCommand).toHaveBeenCalledWith(
      mockClient, 'spotify:volume', { volume: 75 }, 5000
    );
  });

  it('should send spotify:cache:verify', async () => {
    await controller.verifyCacheStatus();
    expect(sendCommand).toHaveBeenCalledWith(
      mockClient, 'spotify:cache:verify', {}, 10000
    );
  });
});
