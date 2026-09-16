// Google Maps adapter.
// All Google-specific code lives here so the rest of the game doesn't depend on it.
// To swap map providers, replace this file and keep the same exported interface.

const MapAdapter = (() => {
  let _map = null;
  let _markers = new Map();   // playerId -> VehicleOverlay instance
  let _OverlayClass = null;
  let _loadPromise = null;
  let _userZoomUntil = 0;     // timestamp until which we skip setCenter

  // Dark game-style map theme
  const DARK_STYLE = [
    { elementType: 'geometry',            stylers: [{ color: '#1a1a2a' }] },
    { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill',    stylers: [{ color: '#6b7280' }] },
    { elementType: 'labels.text.stroke',  stylers: [{ color: '#1a1a2a' }] },
    { featureType: 'road',                elementType: 'geometry',       stylers: [{ color: '#2e2e44' }] },
    { featureType: 'road.arterial',       elementType: 'geometry',       stylers: [{ color: '#3a3a54' }] },
    { featureType: 'road.highway',        elementType: 'geometry',       stylers: [{ color: '#4a4230' }] },
    { featureType: 'road.highway',        elementType: 'geometry.stroke',stylers: [{ color: '#b58900' }] },
    { featureType: 'road.local',          elementType: 'geometry',       stylers: [{ color: '#252538' }] },
    { featureType: 'road',                elementType: 'labels.text.fill', stylers: [{ color: '#8892a4' }] },
    { featureType: 'water',               elementType: 'geometry',       stylers: [{ color: '#0f1c2e' }] },
    { featureType: 'poi',                 stylers: [{ visibility: 'off' }] },
    { featureType: 'transit',             stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative',      elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
    { featureType: 'landscape',           elementType: 'geometry',       stylers: [{ color: '#141424' }] },
  ];

  function _loadGoogleMaps(apiKey) {
    if (_loadPromise) return _loadPromise;
    if (window.google && window.google.maps) {
      _loadPromise = Promise.resolve();
      return _loadPromise;
    }
    _loadPromise = new Promise((resolve, reject) => {
      window.__gmCallback = () => resolve();
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__gmCallback&v=weekly`;
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error('Failed to load Google Maps. Check your API key.'));
      document.head.appendChild(s);
    });
    return _loadPromise;
  }

  // Create VehicleOverlay class AFTER google.maps is available
  function _defineOverlayClass() {
    _OverlayClass = class extends google.maps.OverlayView {
      constructor(playerState, vehicleConfig, isLocal) {
        super();
        this.state  = { ...playerState };
        this.vcfg   = vehicleConfig;
        this.isLocal = isLocal;
        this.el      = null;
      }

      onAdd() {
        const wrap  = document.createElement('div');
        wrap.className = 'vehicle-marker-wrap' + (this.isLocal ? ' local-player' : '');
        wrap.style.position = 'absolute';

        const label = document.createElement('div');
        label.className = 'vehicle-marker-label';
        label.textContent = this.state.name;

        const body = document.createElement('div');
        body.className = 'vehicle-marker-body';
        body.innerHTML = getCarSVG(this.vcfg, 36);

        wrap.appendChild(label);
        wrap.appendChild(body);
        this.el = wrap;
        this.getPanes().overlayLayer.appendChild(wrap);
      }

      draw() {
        if (!this.el || !this.getProjection()) return;
        const pt = this.getProjection().fromLatLngToDivPixel(
          new google.maps.LatLng(this.state.lat, this.state.lng)
        );
        if (!pt) return;

        const svgEl = this.el.querySelector('svg');
        const halfW = svgEl ? svgEl.width.baseVal.value / 2 : 18;
        const halfH = svgEl ? svgEl.height.baseVal.value / 2 : 28;

        this.el.style.left = `${pt.x - halfW}px`;
        this.el.style.top  = `${pt.y - halfH}px`;

        const body = this.el.querySelector('.vehicle-marker-body');
        if (body) {
          body.style.transform = `rotate(${this.state.heading}deg)`;
          body.style.transformOrigin = `${halfW}px ${halfH}px`;
        }
      }

      update(state) {
        Object.assign(this.state, state);
        this.draw();
      }

      updateName(name) {
        this.state.name = name;
        if (this.el) {
          const label = this.el.querySelector('.vehicle-marker-label');
          if (label) label.textContent = name;
        }
      }

      onRemove() {
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        this.el = null;
      }
    };
  }

  return {
    async init(element, center, zoom, apiKey) {
      const isPlaceholder = !apiKey || apiKey === 'your_google_maps_api_key_here';
      if (isPlaceholder) {
        element.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;background:#1a1a2e;color:#e94560;font-size:1.2rem;font-family:sans-serif;text-align:center;padding:2rem">
          <div><div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
          <strong>Google Maps API key not configured.</strong><br>
          Add <code>GOOGLE_MAPS_API_KEY</code> to your <code>.env</code> file and restart the server.</div>
        </div>`;
        return;
      }

      await _loadGoogleMaps(apiKey);
      _defineOverlayClass();

      _map = new google.maps.Map(element, {
        center,
        zoom,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: false,
        mapTypeId: 'roadmap',
        styles: DARK_STYLE,
        gestureHandling: 'greedy',
      });

      // Pause camera-follow for 2 s whenever the user zooms,
      // so the zoom gesture isn't immediately cancelled by setCenter().
      _map.addListener('zoom_changed', () => {
        _userZoomUntil = Date.now() + 2000;
      });
      // Also pause when user starts dragging the map
      _map.addListener('dragstart', () => { _userZoomUntil = Date.now() + 2000; });
    },

    // Called every frame to follow the local player.
    // Uses setCenter (instant, no animation) — panTo animates and tears at 60 fps.
    followPlayer(lat, lng) {
      if (!_map) return;
      if (Date.now() < _userZoomUntil) return; // user is zooming/panning — don't interfere
      _map.setCenter({ lat, lng });
    },

    addMarker(playerId, playerState, vehicleConfig, isLocal) {
      if (!_map || !_OverlayClass) return;
      this.removeMarker(playerId); // ensure no duplicate
      const overlay = new _OverlayClass(playerState, vehicleConfig, isLocal);
      overlay.setMap(_map);
      _markers.set(playerId, overlay);
    },

    updateMarker(playerId, state) {
      const m = _markers.get(playerId);
      if (m) m.update(state);
    },

    removeMarker(playerId) {
      const m = _markers.get(playerId);
      if (m) { m.setMap(null); _markers.delete(playerId); }
    },

    hasMarker(playerId) {
      return _markers.has(playerId);
    },

    destroy() {
      _markers.forEach(m => m.setMap(null));
      _markers.clear();
      _map = null;
    },
  };
})();
