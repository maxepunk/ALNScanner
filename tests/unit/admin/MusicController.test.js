import MusicController from '../../../src/admin/MusicController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
}));

describe('MusicController', () => {
  let controller, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new EventTarget();
    controller = new MusicController(mockClient);
  });

  afterEach(() => { controller.destroy(); });

  it('sends music:play', async () => {
    await controller.play();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:play', {}, 5000);
  });

  it('sends music:pause', async () => {
    await controller.pause();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:pause', {}, 5000);
  });

  it('sends music:stop', async () => {
    await controller.stop();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:stop', {}, 5000);
  });

  it('sends music:next', async () => {
    await controller.next();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:next', {}, 5000);
  });

  it('sends music:previous', async () => {
    await controller.previous();
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:previous', {}, 5000);
  });

  it('sends music:setVolume with volume payload', async () => {
    await controller.setVolume(75);
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:setVolume', { volume: 75 }, 5000);
  });

  it('sends music:setShuffle with enabled payload', async () => {
    await controller.setShuffle(true);
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:setShuffle', { enabled: true }, 5000);
  });

  it('coerces non-boolean truthy values to boolean for setShuffle/setLoop', async () => {
    await controller.setShuffle('yes');
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:setShuffle', { enabled: true }, 5000);

    sendCommand.mockClear();
    await controller.setLoop(0);
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:setLoop', { enabled: false }, 5000);
  });

  it('sends music:loadPlaylist with playlistId', async () => {
    await controller.loadPlaylist('all-tracks');
    expect(sendCommand).toHaveBeenCalledWith(mockClient, 'music:loadPlaylist', { playlistId: 'all-tracks' }, 5000);
  });
});
