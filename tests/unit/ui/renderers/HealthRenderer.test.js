import { HealthRenderer } from '../../../../src/ui/renderers/HealthRenderer.js';

describe('HealthRenderer', () => {
  let container;
  let renderer;

  const allHealthy = () => {
    const health = {};
    ['vlc', 'spotify', 'lighting', 'bluetooth', 'audio', 'sound', 'gameclock', 'cueengine'].forEach(s => {
      health[s] = { status: 'healthy', message: 'OK' };
    });
    return health;
  };

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'health-dashboard';
    document.body.appendChild(container);
    renderer = new HealthRenderer({ container });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('render()', () => {
    it('should show collapsed summary when all services healthy', () => {
      renderer.render({ serviceHealth: allHealthy() });

      expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();
      expect(container.textContent).toContain('8/8');
    });

    it('should show expanded grid when any service is down', () => {
      const health = {
        vlc: { status: 'down', message: 'Connection refused' },
        spotify: { status: 'healthy', message: 'OK' },
      };
      renderer.render({ serviceHealth: health });

      expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      expect(container.querySelector('.health-service--down')).toBeTruthy();
    });

    it('should include Check Now button for down services', () => {
      const health = {
        vlc: { status: 'down', message: 'Connection refused' },
      };
      renderer.render({ serviceHealth: health });

      const btn = container.querySelector('[data-action="admin.serviceCheck"]');
      expect(btn).toBeTruthy();
      expect(btn.dataset.serviceId).toBe('vlc');
    });

    it('should handle empty/null health gracefully', () => {
      renderer.render({ serviceHealth: null });
      expect(container.innerHTML).not.toBe('');
    });

    it('should not show Check Now buttons for healthy services', () => {
      renderer.render({ serviceHealth: allHealthy() });

      const btns = container.querySelectorAll('[data-action="admin.serviceCheck"]');
      expect(btns).toHaveLength(0);
    });

    it('should render all 8 service names in expanded mode', () => {
      // All unknown (no health data) → all degraded → expanded
      renderer.render({ serviceHealth: {} });

      const serviceNames = container.querySelectorAll('.health-service__name');
      expect(serviceNames).toHaveLength(8);

      const names = Array.from(serviceNames).map(el => el.textContent);
      expect(names).toContain('VLC Player');
      expect(names).toContain('Spotify');
      expect(names).toContain('Lighting (HA)');
      expect(names).toContain('Bluetooth');
      expect(names).toContain('Audio Routing');
      expect(names).toContain('Sound Effects');
      expect(names).toContain('Game Clock');
      expect(names).toContain('Cue Engine');
    });

    it('should treat unknown status as unhealthy', () => {
      renderer.render({ serviceHealth: { vlc: { status: 'unknown', message: '' } } });

      expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      const vlcCard = container.querySelector('.health-service--down');
      expect(vlcCard).toBeTruthy();
    });

    it('should escape HTML in service messages', () => {
      renderer.render({
        serviceHealth: {
          vlc: { status: 'down', message: '<script>alert("xss")</script>' }
        }
      });

      // Raw HTML should not be present
      expect(container.innerHTML).not.toContain('<script>');
      // Escaped version should be
      expect(container.innerHTML).toContain('&lt;script&gt;');
    });
  });

  describe('differential updates', () => {
    it('should preserve DOM elements when updating expanded mode', () => {
      const health1 = {
        vlc: { status: 'down', message: 'Connection refused' },
        spotify: { status: 'healthy', message: 'OK' },
      };
      renderer.render({ serviceHealth: health1 });
      const vlcCard = container.querySelector('[data-service="vlc"]');

      // Update: VLC recovers
      const health2 = {
        vlc: { status: 'healthy', message: 'Connected' },
        spotify: { status: 'down', message: 'Not running' },
      };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      // Same card element preserved (not rebuilt)
      expect(container.querySelector('[data-service="vlc"]')).toBe(vlcCard);
      // VLC now healthy
      expect(vlcCard.classList.contains('health-service--ok')).toBe(true);
      // VLC no longer has Check Now
      expect(vlcCard.querySelector('[data-action="admin.serviceCheck"]')).toBeNull();
      // Spotify now down
      const spotifyCard = container.querySelector('[data-service="spotify"]');
      expect(spotifyCard.classList.contains('health-service--down')).toBe(true);
    });

    it('should rebuild DOM on mode change (collapsed → expanded)', () => {
      renderer.render({ serviceHealth: allHealthy() });
      expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();

      // VLC goes down
      const degraded = { ...allHealthy(), vlc: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: degraded }, { serviceHealth: allHealthy() });

      expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      expect(container.querySelector('.health-dashboard--ok')).toBeNull();
    });

    it('should rebuild DOM on mode change (expanded → collapsed)', () => {
      const degraded = { vlc: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: degraded });
      expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();

      renderer.render({ serviceHealth: allHealthy() }, { serviceHealth: degraded });

      expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();
      expect(container.querySelector('.health-dashboard--degraded')).toBeNull();
    });

    it('should update summary count when service recovers in expanded mode', () => {
      // Start with 2 services down, rest healthy
      const health1 = { ...allHealthy(), vlc: { status: 'down', message: 'Failed' }, spotify: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: health1 });
      expect(container.textContent).toContain('6/8');

      // One recovers, still expanded (1 down)
      const health2 = { ...allHealthy(), spotify: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });
      expect(container.textContent).toContain('7/8');
    });

    it('should add Check Now button when service goes down', () => {
      const health1 = { vlc: { status: 'down', message: 'err' } };
      renderer.render({ serviceHealth: health1 });

      // Spotify goes down too
      const health2 = {
        vlc: { status: 'down', message: 'err' },
        spotify: { status: 'down', message: 'stopped' },
      };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      const spotifyCard = container.querySelector('[data-service="spotify"]');
      const btn = spotifyCard.querySelector('[data-action="admin.serviceCheck"]');
      expect(btn).toBeTruthy();
      expect(btn.dataset.serviceId).toBe('spotify');
    });

    it('should update message text when status message changes', () => {
      const health1 = { vlc: { status: 'down', message: 'Connection refused' } };
      renderer.render({ serviceHealth: health1 });

      const health2 = { vlc: { status: 'down', message: 'Timeout after 5s' } };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      const vlcCard = container.querySelector('[data-service="vlc"]');
      expect(vlcCard.querySelector('.health-service__message').textContent).toBe('Timeout after 5s');
    });
  });
});
