import { HealthRenderer } from '../../../../src/ui/renderers/HealthRenderer.js';

describe('HealthRenderer', () => {
  let container;
  let renderer;

  const allHealthy = () => {
    const health = {};
    // T1a D13: `display` is the ninth service (pin P16)
    ['vlc', 'music', 'lighting', 'bluetooth', 'audio', 'sound', 'gameclock', 'cueengine', 'display'].forEach(s => {
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
      expect(container.textContent).toContain('9/9');
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

    it('should render all 9 service names in expanded mode', () => {
      // All unknown (no health data) → all degraded → expanded
      renderer.render({ serviceHealth: {} });

      const serviceNames = container.querySelectorAll('.health-service__name');
      expect(serviceNames).toHaveLength(9);

      const names = Array.from(serviceNames).map(el => el.textContent);
      expect(names).toContain('VLC Player');
      expect(names).toContain('Music (MPD)');
      expect(names).toContain('Lighting (HA)');
      expect(names).toContain('Bluetooth');
      expect(names).toContain('Audio Routing');
      expect(names).toContain('Sound Effects');
      expect(names).toContain('Game Clock');
      expect(names).toContain('Cue Engine');
      expect(names).toContain('Display (kiosk)');
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
      expect(container.textContent).toContain('7/9');

      // One recovers, still expanded (1 down)
      const health2 = { ...allHealthy(), music: { status: 'down', message: 'Failed' } };
      renderer.render({ serviceHealth: health2 }, { serviceHealth: health1 });
      expect(container.textContent).toContain('8/9');
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
  // ══════════════════════════════════════════════════════════════════
  // Block 2 T1a D13 — the third word on the dashboard (pins P5/P16).
  //
  // Uninstalled equipment must NEVER show red. A red that is always red
  // trains GMs to ignore red, and then the night VLC really dies nobody
  // looks. Dormant is grey, it names its door, and — when it is the
  // PROFILE's door, i.e. a venue fact — it does not even force the
  // dashboard open. The OPERATOR's door does: a human latched that, and
  // somebody should see it.
  // ══════════════════════════════════════════════════════════════════
  describe('dormancy (T1a D13)', () => {
    const dormant = (door) => ({ status: 'dormant', message: 'x', door });

    it('renders a dormant service GREY, never as a down card', () => {
      renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('operator') } });

      const card = container.querySelector('[data-service="lighting"]');
      expect(card.classList.contains('health-service--dormant')).toBe(true);
      expect(card.classList.contains('health-service--down')).toBe(false);
      expect(card.classList.contains('health-service--ok')).toBe(false);
    });

    it('shows the door wording instead of the raw status word', () => {
      renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('profile'), vlc: { status: 'down', message: 'x' } } });
      expect(container.querySelector('[data-service="lighting"]').textContent)
        .toContain('Not installed tonight');

      renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('operator'), vlc: { status: 'down', message: 'x' } } },
        { serviceHealth: {} });
      expect(container.querySelector('[data-service="lighting"]').textContent)
        .toContain('Out of service');
    });

    it('offers no Check Now button for a dormant service — there is nothing to probe', () => {
      renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('operator') } });
      const card = container.querySelector('[data-service="lighting"]');
      expect(card.querySelector('[data-action="admin.serviceCheck"]')).toBeNull();
    });

    describe('the collapse rule', () => {
      it('stays COLLAPSED when everything is healthy or dormant by profile', () => {
        renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('profile') } });
        expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();
        expect(container.querySelector('.health-dashboard--degraded')).toBeNull();
      });

      it('EXPANDS when a service is dormant by the OPERATOR door', () => {
        renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('operator') } });
        expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      });

      it('EXPANDS when any service is down, dormancy notwithstanding', () => {
        renderer.render({
          serviceHealth: { ...allHealthy(), lighting: dormant('profile'), vlc: { status: 'down', message: 'x' } },
        });
        expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      });
    });

    describe('the collapsed summary', () => {
      it('counts the dormant services separately from the healthy ones', () => {
        renderer.render({ serviceHealth: { ...allHealthy(), lighting: dormant('profile') } });
        expect(container.textContent.replace(/\s+/g, ' ')).toContain(
          'All installed systems operational (8/9, 1 not installed tonight)'
        );
      });

      it('keeps the old wording when nothing is dormant', () => {
        renderer.render({ serviceHealth: allHealthy() });
        expect(container.textContent).toContain('All Systems Operational (9/9)');
      });
    });

    describe('the summary is a toggle', () => {
      it('expands to show the grey rows, and collapses again', () => {
        const health = { ...allHealthy(), lighting: dormant('profile') };
        renderer.render({ serviceHealth: health });
        expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();
        expect(container.querySelector('[data-service="lighting"]')).toBeNull();

        renderer.toggleDetail();
        expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
        expect(container.querySelector('[data-service="lighting"]')
          .classList.contains('health-service--dormant')).toBe(true);

        renderer.toggleDetail();
        expect(container.querySelector('.health-dashboard--ok')).toBeTruthy();
      });

      it('the collapsed summary carries the toggle data-action', () => {
        renderer.render({ serviceHealth: allHealthy() });
        const summary = container.querySelector('.health-dashboard__summary');
        expect(summary.dataset.action).toBe('admin.toggleHealthDetail');
      });

      it('a later render keeps the forced-open state', () => {
        const health = { ...allHealthy(), lighting: dormant('profile') };
        renderer.render({ serviceHealth: health });
        renderer.toggleDetail();

        renderer.render({ serviceHealth: health }, { serviceHealth: health });

        expect(container.querySelector('.health-dashboard--degraded')).toBeTruthy();
      });
    });

    it('a hostile door value is never rendered — the helper answers "Dormant"', () => {
      // `door` arrives from the backend health map. doorWording() maps
      // anything outside the two doors to the literal 'Dormant', so a
      // markup-bearing value never reaches the DOM at all.
      renderer.render({
        serviceHealth: {
          ...allHealthy(),
          lighting: { status: 'dormant', message: 'x', door: '<img src=x onerror=alert(1)>' },
          vlc: { status: 'down', message: 'x' },
        },
      });
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-service="lighting"]').textContent)
        .toContain('Dormant');
    });
  });
});
