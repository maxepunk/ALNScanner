import { HealthRenderer } from '../../../../src/ui/renderers/HealthRenderer.js';

describe('HealthRenderer', () => {
  let container;
  let renderer;

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
      const health = {};
      ['vlc', 'spotify', 'lighting', 'bluetooth', 'audio', 'sound', 'gameclock', 'cueengine'].forEach(s => {
        health[s] = { status: 'healthy', message: 'OK' };
      });
      renderer.render({ serviceHealth: health });

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
      const health = {};
      ['vlc', 'spotify', 'lighting', 'bluetooth', 'audio', 'sound', 'gameclock', 'cueengine'].forEach(s => {
        health[s] = { status: 'healthy', message: 'OK' };
      });
      renderer.render({ serviceHealth: health });

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
});
