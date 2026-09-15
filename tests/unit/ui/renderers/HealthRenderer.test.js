import { HealthRenderer } from '../../../../src/ui/renderers/HealthRenderer.js';

describe('HealthRenderer', () => {
  let container;
  let renderer;

  const allHealthy = () => {
    const health = {};
    ['vlc', 'music', 'lighting', 'bluetooth', 'audio', 'sound', 'gameclock', 'cueengine'].forEach(s => {
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

    it('should render music service entry', () => {
      const health = {
        vlc: { status: 'healthy', message: 'OK' },
        music: { status: 'down', message: 'MPD socket missing' },
      };
      renderer.render({ serviceHealth: health });

      const musicCard = container.querySelector('[data-service="music"]');
      expect(musicCard).not.toBeNull();
      expect(musicCard.textContent).toContain('Music (MPD)');
      expect(musicCard.textContent).toContain('MPD socket missing');
      expect(musicCard.classList.contains('health-service--down')).toBe(true);
    });

    it('should show expanded grid when any service is down', () => {
      const health = {
        vlc: { status: 'down', message: 'Connection refused' },
        music: { status: 'healthy', message: 'OK' },
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
      expect(names).toContain('Music (MPD)');
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

    it('should escape HTML in the backend-controlled status field', () => {
      // status comes from the backend health map (data.serviceHealth[id].status).
      // Anything other than 'healthy' renders in expanded mode via innerHTML.
      renderer.render({
        serviceHealth: {
          vlc: { status: '<img src=x onerror=alert(1)>', message: 'OK' }
        }
      });

      expect(container.innerHTML).not.toContain('<img src=x');
      expect(container.innerHTML).toContain('&lt;img src=x');
    });
  });

  describe('differential updates', () => {
    it('should preserve DOM elements when updating expanded mode', () => {
      const health1 = {
        vlc: { status: 'down', message: 'Connection refused' },
        music: { status: 'healthy', message: 'OK' },
      };
      renderer.render({ serviceHealth: health1 });
      const vlcCard = container.querySelector('[data-service="vlc"]');

      // Update: VLC recovers
      const health2 = {
        vlc: { status: 'healthy', message: 'Connected' },
        music: { status: 'down', message: 'MPD socket missing' },
      };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      // Same card element preserved (not rebuilt)
      expect(container.querySelector('[data-service="vlc"]')).toBe(vlcCard);
      // VLC now healthy
      expect(vlcCard.classList.contains('health-service--ok')).toBe(true);
      // VLC no longer has Check Now
      expect(vlcCard.querySelector('[data-action="admin.serviceCheck"]')).toBeNull();
      // Music now down
      const musicCard = container.querySelector('[data-service="music"]');
      expect(musicCard.classList.contains('health-service--down')).toBe(true);
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
      const health1 = { ...allHealthy(), vlc: { status: 'down', message: 'Failed' }, music: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: health1 });
      expect(container.textContent).toContain('6/8');

      // One recovers, still expanded (1 down)
      const health2 = { ...allHealthy(), music: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });
      expect(container.textContent).toContain('7/8');
    });

    it('should add Check Now button when service goes down', () => {
      const health1 = { vlc: { status: 'down', message: 'err' } };
      renderer.render({ serviceHealth: health1 });

      // Music goes down too
      const health2 = {
        vlc: { status: 'down', message: 'err' },
        music: { status: 'down', message: 'MPD socket missing' },
      };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      const musicCard = container.querySelector('[data-service="music"]');
      const btn = musicCard.querySelector('[data-action="admin.serviceCheck"]');
      expect(btn).toBeTruthy();
      expect(btn.dataset.serviceId).toBe('music');
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

  describe('lastChecked display (W4/B-5)', () => {
    function expectedTime(iso) {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `checked ${hh}:${mm}:${ss}`;
    }

    it('shows "checked HH:MM:SS" (absolute local time) for a service with lastChecked', () => {
      const iso = '2026-09-15T14:32:07.000Z';
      renderer.render({
        serviceHealth: { vlc: { status: 'down', message: 'Connection refused', lastChecked: iso } }
      });

      const card = container.querySelector('[data-service="vlc"]');
      expect(card.querySelector('.health-service__checked').textContent).toBe(expectedTime(iso));
    });

    it('re-renders ONLY the timestamp text when status/message are unchanged but lastChecked advances', () => {
      const health1 = { vlc: { status: 'down', message: 'err', lastChecked: '2026-09-15T14:00:00.000Z' } };
      renderer.render({ serviceHealth: health1 });

      const vlcCard = container.querySelector('[data-service="vlc"]');
      const statusEl = vlcCard.querySelector('.health-service__status');
      const messageEl = vlcCard.querySelector('.health-service__message');
      const checkedEl = vlcCard.querySelector('.health-service__checked');

      const statusSpy = jest.spyOn(statusEl, 'textContent', 'set');
      const messageSpy = jest.spyOn(messageEl, 'textContent', 'set');
      const checkedSpy = jest.spyOn(checkedEl, 'textContent', 'set');

      const health2 = { vlc: { status: 'down', message: 'err', lastChecked: '2026-09-15T14:00:15.000Z' } };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });

      expect(statusSpy).not.toHaveBeenCalled();
      expect(messageSpy).not.toHaveBeenCalled();
      expect(checkedSpy).toHaveBeenCalledWith(expectedTime('2026-09-15T14:00:15.000Z'));

      statusSpy.mockRestore();
      messageSpy.mockRestore();
      checkedSpy.mockRestore();
    });

    it('writes no DOM text at all when the pushed state is identical to the previous render', () => {
      const health = { vlc: { status: 'down', message: 'err', lastChecked: '2026-09-15T14:00:00.000Z' } };
      renderer.render({ serviceHealth: health });

      const vlcCard = container.querySelector('[data-service="vlc"]');
      const statusEl = vlcCard.querySelector('.health-service__status');
      const messageEl = vlcCard.querySelector('.health-service__message');
      const checkedEl = vlcCard.querySelector('.health-service__checked');

      const statusSpy = jest.spyOn(statusEl, 'textContent', 'set');
      const messageSpy = jest.spyOn(messageEl, 'textContent', 'set');
      const checkedSpy = jest.spyOn(checkedEl, 'textContent', 'set');
      const summaryTextEl = container.querySelector('.health-dashboard__summary-text');
      const summarySpy = summaryTextEl ? jest.spyOn(summaryTextEl, 'textContent', 'set') : null;

      // Identical state pushed again (e.g. two revalidation probes with no change at all)
      renderer.render({ serviceHealth: { ...health } }, { serviceHealth: health });

      expect(statusSpy).not.toHaveBeenCalled();
      expect(messageSpy).not.toHaveBeenCalled();
      expect(checkedSpy).not.toHaveBeenCalled();
      if (summarySpy) expect(summarySpy).not.toHaveBeenCalled();

      statusSpy.mockRestore();
      messageSpy.mockRestore();
      checkedSpy.mockRestore();
      if (summarySpy) summarySpy.mockRestore();
    });

    it('handles missing lastChecked gracefully (empty timestamp, no throw)', () => {
      expect(() => {
        renderer.render({ serviceHealth: { vlc: { status: 'down', message: 'err' } } });
      }).not.toThrow();
      const card = container.querySelector('[data-service="vlc"]');
      expect(card.querySelector('.health-service__checked').textContent).toBe('');
    });
  });

  describe('selector metachar safety (SR-5)', () => {
    it('should cache the service card even when an id contains a selector metachar', () => {
      // Force expanded (degraded) render with a metachar id in SERVICE_NAMES.
      renderer.SERVICE_NAMES = { 'vlc"x': 'VLC X', music: 'Music' };
      renderer.render({ serviceHealth: { 'vlc"x': { status: 'down', message: 'boom' }, music: { status: 'healthy' } } });

      // Cache lookup must have found the card (no querySelector throw / no miss).
      expect(renderer._serviceEls['vlc"x']).toBeDefined();
      expect(renderer._serviceEls['vlc"x'].card).toBeTruthy();
    });
  });
});
