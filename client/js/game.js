// Main game loop. Integrates input, vehicle physics, map rendering, and network sync.

const Game = (() => {
  let running    = false;
  let rafId      = null;
  let lastTime   = 0;
  let sendTimer  = 0;

  const SEND_INTERVAL = 1000 / 15; // 15 Hz position broadcasts

  // Local player
  let localId      = null;
  let localVehicle = null; // VehiclePhysics instance
  let localVcfg    = null; // vehicle config

  // Remote players: playerId -> { state, target, vcfg }
  const remotes = new Map();

  // Shared config
  let cfg = null;

  // ── Helpers ─────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }

  function _getSpeedMult() {
    const el = document.getElementById('speed-mult-slider');
    return el ? parseFloat(el.value) : 1;
  }

  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff >  180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
  }

  function getLerpFactor(dt) {
    // Frame-rate independent: equivalent to 0.15 per 16.67ms frame
    return 1 - Math.pow(1 - 0.15, dt / 16.67);
  }

  function getVehicleCfg(vehicleId) {
    return cfg.vehicles.find(v => v.id === vehicleId) || cfg.vehicles[0];
  }

  // ── Core loop ────────────────────────────────────────────────────────
  function loop(timestamp) {
    if (!running) return;

    const dt = Math.min(timestamp - lastTime, 100); // cap at 100ms
    lastTime = timestamp;

    const input     = Input.getState();
    const t         = getLerpFactor(dt);
    const speedMult = _getSpeedMult();

    // 1. Local physics
    localVehicle.update(dt, input, speedMult);

    // 2. Road-following: trigger background snap fetch, then apply correction
    RoadFollower.tick(localVehicle.lat, localVehicle.lng, localVehicle.heading);
    RoadFollower.applyTo(localVehicle, dt);

    const localState = localVehicle.getState();

    // 3. Update local marker
    MapAdapter.updateMarker(localId, { ...localState, name: window._localPlayerName });

    // 4. Follow local player with camera (pauses automatically during user zoom/pan)
    MapAdapter.followPlayer(localState.lat, localState.lng);

    // 5. Interpolate remote players toward their server-reported targets
    remotes.forEach((remote, id) => {
      remote.state.lat     = lerp(remote.state.lat,     remote.target.lat,     t);
      remote.state.lng     = lerp(remote.state.lng,     remote.target.lng,     t);
      remote.state.heading = lerpAngle(remote.state.heading, remote.target.heading, t);
      remote.state.speed   = lerp(remote.state.speed,   remote.target.speed,   t);
      MapAdapter.updateMarker(id, remote.state);
    });

    // 6. HUD
    _updateHUD(localState);

    // 7. Send position to server at controlled rate
    sendTimer += dt;
    if (sendTimer >= SEND_INTERVAL) {
      sendTimer -= SEND_INTERVAL;
      Multiplayer.sendMove(localState);
    }

    rafId = requestAnimationFrame(loop);
  }

  // ── HUD ─────────────────────────────────────────────────────────────
  function _updateHUD(state) {
    const mph = Math.abs(state.speed * 0.621371);
    document.getElementById('hud-speed').textContent        = Math.round(mph);
    document.getElementById('hud-player-count').textContent = remotes.size + 1;

    // Off-road indicator
    const offRoadEl = document.getElementById('hud-offroad');
    if (offRoadEl) {
      const dist = RoadFollower.offRoadMetres;
      offRoadEl.style.display = dist > 20 ? 'block' : 'none';
    }

    _renderPlayerListHUD();
  }

  function _renderPlayerListHUD() {
    const el = document.getElementById('hud-player-list');
    if (!el) return;

    const localState = localVehicle ? localVehicle.getState() : {};
    let html = `
      <div class="hud-player-item">
        <div class="hud-player-dot" style="background:${localVcfg ? localVcfg.color : '#4ecca3'}"></div>
        <div class="hud-player-name">${window._localPlayerName || 'You'} <small style="opacity:.5">(you)</small></div>
        <div class="hud-player-speed">${Math.round(Math.abs((localState.speed||0)*0.621))} mph</div>
      </div>`;

    remotes.forEach((remote, id) => {
      const color = remote.vcfg ? remote.vcfg.color : '#888';
      const mph   = Math.round(Math.abs(remote.state.speed * 0.621));
      html += `
        <div class="hud-player-item">
          <div class="hud-player-dot" style="background:${color}"></div>
          <div class="hud-player-name">${remote.state.name || id.slice(0,6)}</div>
          <div class="hud-player-speed">${mph} mph</div>
        </div>`;
    });

    el.innerHTML = html;
  }

  // ── Public API ───────────────────────────────────────────────────────
  return {
    async start(roomData, localPlayerData, config) {
      cfg     = config;
      localId = localPlayerData.id;
      window._localPlayerName = localPlayerData.name;

      // Init vehicle physics for local player
      localVcfg    = getVehicleCfg(localPlayerData.vehicleId);
      localVehicle = new VehiclePhysics(localVcfg);
      localVehicle.setPosition(localPlayerData.lat, localPlayerData.lng, localPlayerData.heading);

      // Init map
      await MapAdapter.init(
        document.getElementById('map'),
        { lat: localPlayerData.lat, lng: localPlayerData.lng },
        config.defaultZoom,
        config.mapsApiKey
      );

      // Add local player marker
      MapAdapter.addMarker(localId, { ...localPlayerData, name: localPlayerData.name }, localVcfg, true);

      // Add all existing remote players
      for (const p of roomData.players) {
        if (p.id === localId) continue;
        this.addRemotePlayer(p);
      }

      // Update HUD labels
      document.getElementById('hud-room-code').textContent  = roomData.id;
      document.getElementById('hud-vehicle-name').textContent = localVcfg.name;
      document.getElementById('hud-player-count').textContent = roomData.players.length;
      const cityEl = document.getElementById('hud-city');
      if (cityEl && roomData.location) {
        cityEl.textContent = `${roomData.location.city}, ${roomData.location.state}`;
      }

      // Start loop
      Input.init();
      running   = true;
      lastTime  = performance.now();
      sendTimer = 0;
      rafId     = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      MapAdapter.destroy();
      RoadFollower.reset();
      remotes.clear();
      localVehicle = null;
      localVcfg    = null;
      localId      = null;
    },

    addRemotePlayer(playerData) {
      if (playerData.id === localId) return;
      const vcfg = getVehicleCfg(playerData.vehicleId);
      remotes.set(playerData.id, {
        state:  { ...playerData },
        target: { ...playerData },
        vcfg,
      });
      if (MapAdapter.hasMarker(playerData.id)) MapAdapter.removeMarker(playerData.id);
      MapAdapter.addMarker(playerData.id, playerData, vcfg, false);
    },

    removeRemotePlayer(playerId) {
      remotes.delete(playerId);
      MapAdapter.removeMarker(playerId);
    },

    // Called when a playerMoved event arrives from the server
    onPlayerMoved(data) {
      const remote = remotes.get(data.id);
      if (!remote) return;
      remote.target.lat     = data.lat;
      remote.target.lng     = data.lng;
      remote.target.heading = data.heading;
      remote.target.speed   = data.speed;
    },

    // A remote player changed vehicle mid-game
    updateRemoteVehicle(playerId, vehicleId) {
      const remote = remotes.get(playerId);
      if (!remote) return;
      remote.vcfg = getVehicleCfg(vehicleId);
    },

    get isRunning() { return running; },
  };
})();
