// App controller — manages screens, UI events, and wires multiplayer to game/lobby.

const App = (() => {
  // ── State ────────────────────────────────────────────────────────────
  let config        = null;   // from /api/config
  let localPlayer   = null;   // player data returned by server
  let currentRoom   = null;   // room data
  let isReady       = false;
  let selectedVehicleId = 'sedan';
  let currentScreen = 'menu';

  // ── Utilities ────────────────────────────────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = '';
    });
    const el = document.getElementById(`screen-${name}`);
    if (el) {
      // game screen uses display:block; others use display:flex
      el.style.display = (name === 'game') ? 'block' : 'flex';
      requestAnimationFrame(() => el.classList.add('active'));
    }
    currentScreen = name;
  }

  function showLoading(text = 'Loading…') {
    const el = document.getElementById('loading');
    document.getElementById('loading-text').textContent = text;
    el.classList.remove('hidden');
  }
  function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
  }

  let toastTimer = null;
  function showToast(message, type = 'error') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function getInputName() {
    return document.getElementById('input-name').value.trim();
  }

  // ── Vehicle card rendering ───────────────────────────────────────────
  function renderVehicleCards(container, onSelect) {
    container.innerHTML = '';
    for (const v of config.vehicles) {
      const card = document.createElement('div');
      card.className = 'vehicle-card' + (v.id === selectedVehicleId ? ' selected' : '');
      card.dataset.vehicleId = v.id;

      const bar = (label, val) =>
        `<div class="stat-row">
          <span class="stat-label">${label}</span>
          <div class="stat-track"><div class="stat-fill" style="width:${val * 10}%"></div></div>
        </div>`;

      card.innerHTML = `
        <div class="vehicle-card-svg">${getCarSVG(v, 44)}</div>
        <div class="vehicle-card-name">${v.name}</div>
        ${bar('Speed',  v.speedRating)}
        ${bar('Accel',  v.accelRating)}
        ${bar('Handle', v.handlingRating)}
      `;

      card.addEventListener('click', () => {
        selectedVehicleId = v.id;
        document.querySelectorAll('.vehicle-card').forEach(c =>
          c.classList.toggle('selected', c.dataset.vehicleId === v.id)
        );
        onSelect(v.id);
      });

      container.appendChild(card);
    }
  }

  // ── Lobby rendering ─────────────────────────────────────────────────
  function renderLobby() {
    if (!currentRoom) return;
    document.getElementById('lobby-room-code').textContent = currentRoom.id;
    document.getElementById('lobby-player-count').textContent = currentRoom.players.length;

    const cityEl = document.getElementById('lobby-spawn-city');
    if (cityEl && currentRoom.location) {
      cityEl.textContent = `${currentRoom.location.city}, ${currentRoom.location.state}`;
    }

    // Vehicle cards (lobby selection)
    renderVehicleCards(document.getElementById('vehicle-cards'), (vehicleId) => {
      Multiplayer.changeVehicle(vehicleId);
    });

    // Players list
    renderPlayersList();

    // Show Start button only for host
    const isHost = localPlayer && localPlayer.isHost;
    const startBtn = document.getElementById('btn-start');
    startBtn.classList.toggle('hidden', !isHost);
  }

  function renderPlayersList() {
    const list = document.getElementById('players-list');
    if (!list || !currentRoom) return;
    list.innerHTML = '';

    for (const p of currentRoom.players) {
      const isLocal  = p.id === (localPlayer && localPlayer.id);
      const vcfg     = config.vehicles.find(v => v.id === p.vehicleId) || config.vehicles[0];

      const item = document.createElement('div');
      item.className = 'player-item' +
        (isLocal  ? ' is-local' : '') +
        (p.isHost ? ' is-host'  : '');

      const badges = [];
      if (p.isHost)  badges.push(`<span class="player-badge badge-host">HOST</span>`);
      if (p.isReady) badges.push(`<span class="player-badge badge-ready">READY</span>`);
      else           badges.push(`<span class="player-badge badge-waiting">WAITING</span>`);

      item.innerHTML = `
        <div class="player-dot" style="background:${vcfg.color}"></div>
        <div class="player-name-text">${p.name}${isLocal ? ' (you)' : ''}</div>
        <div class="player-vehicle-text">${vcfg.name}</div>
        ${badges.join('')}
      `;
      list.appendChild(item);
    }
  }

  // Update a single player entry in the room data
  function updatePlayerInRoom(updatedPlayer) {
    if (!currentRoom) return;
    const idx = currentRoom.players.findIndex(p => p.id === updatedPlayer.id);
    if (idx >= 0) currentRoom.players[idx] = updatedPlayer;
    else currentRoom.players.push(updatedPlayer);

    if (localPlayer && updatedPlayer.id === localPlayer.id) {
      localPlayer = updatedPlayer;
    }
    renderLobby();
  }

  function removePlayerFromRoom(playerId) {
    if (!currentRoom) return;
    currentRoom.players = currentRoom.players.filter(p => p.id !== playerId);
  }

  // ── Multiplayer event wiring ─────────────────────────────────────────
  function wireMultiplayer() {
    Multiplayer.on('connect', () => {
      console.log('Connected to server');
    });

    Multiplayer.on('disconnect', ({ reason }) => {
      showToast(`Disconnected: ${reason}`);
      if (Game.isRunning) Game.stop();
      hideLoading();
      showScreen('menu');
    });

    Multiplayer.on('connectError', ({ message }) => {
      showToast(`Connection error: ${message}`);
      hideLoading();
    });

    Multiplayer.on('error', ({ message }) => {
      showToast(message);
      hideLoading();
    });

    Multiplayer.on('roomCreated', ({ room, player }) => {
      localPlayer   = player;
      currentRoom   = room;
      selectedVehicleId = player.vehicleId;
      isReady       = false;
      hideLoading();
      renderLobby();
      showScreen('lobby');
    });

    Multiplayer.on('roomJoined', ({ room, player }) => {
      localPlayer   = player;
      currentRoom   = room;
      selectedVehicleId = player.vehicleId;
      isReady       = false;
      hideLoading();
      renderLobby();
      showScreen('lobby');
    });

    Multiplayer.on('playerJoined', ({ player, room }) => {
      if (room) currentRoom = room;
      else if (currentRoom) {
        const exists = currentRoom.players.find(p => p.id === player.id);
        if (!exists) currentRoom.players.push(player);
      }

      if (currentScreen === 'lobby') {
        renderLobby();
      } else if (currentScreen === 'game' && Game.isRunning) {
        Game.addRemotePlayer(player);
      }
    });

    Multiplayer.on('playerLeft', ({ playerId, room }) => {
      if (room) currentRoom = room;
      else removePlayerFromRoom(playerId);

      if (currentScreen === 'lobby') {
        renderLobby();
      } else if (currentScreen === 'game' && Game.isRunning) {
        Game.removeRemotePlayer(playerId);
      }
    });

    Multiplayer.on('playerUpdated', ({ player }) => {
      updatePlayerInRoom(player);
      if (currentScreen === 'game' && Game.isRunning) {
        Game.updateRemoteVehicle(player.id, player.vehicleId);
      }
    });

    Multiplayer.on('gameStarted', ({ room }) => {
      currentRoom = room;

      // Find this client's spawn position from the room's player list
      const myData = room.players.find(p => p.id === localPlayer.id) || localPlayer;
      localPlayer  = { ...localPlayer, ...myData };

      showScreen('game');
      showLoading('Initializing map…');

      Game.start(room, localPlayer, config)
        .then(() => hideLoading())
        .catch(err => {
          showToast('Map failed to load: ' + err.message);
          hideLoading();
          console.error(err);
        });
    });

    Multiplayer.on('playerMoved', (data) => {
      if (Game.isRunning) Game.onPlayerMoved(data);
    });
  }

  // ── Button handlers ──────────────────────────────────────────────────
  function bindButtons() {
    // Create room
    document.getElementById('btn-create').addEventListener('click', () => {
      const name = getInputName();
      if (!name) { showToast('Please enter your name.'); return; }
      showLoading('Creating room…');
      Multiplayer.createRoom({ name, vehicleId: selectedVehicleId });
    });

    // Join room
    document.getElementById('btn-join').addEventListener('click', () => {
      const name = getInputName();
      const code = document.getElementById('input-code').value.trim().toUpperCase();
      if (!name) { showToast('Please enter your name.'); return; }
      if (!code) { showToast('Please enter a room code.'); return; }
      showLoading('Joining room…');
      Multiplayer.joinRoom({ code, name, vehicleId: selectedVehicleId });
    });

    // Allow Enter key in room code field
    document.getElementById('input-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-join').click();
    });

    document.getElementById('input-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-create').click();
    });

    // Ready toggle
    document.getElementById('btn-ready').addEventListener('click', () => {
      isReady = !isReady;
      Multiplayer.setReady(isReady);
      const btn = document.getElementById('btn-ready');
      btn.textContent = isReady ? 'Not Ready' : 'Ready Up';
      btn.classList.toggle('active-ready', isReady);
    });

    // Start game (host only)
    document.getElementById('btn-start').addEventListener('click', () => {
      Multiplayer.startGame();
    });

    // Leave lobby
    document.getElementById('btn-leave-lobby').addEventListener('click', () => {
      Multiplayer.disconnect();
      currentRoom = null;
      localPlayer = null;
      isReady     = false;
      // Reconnect for next session
      Multiplayer.connect();
      showScreen('menu');
    });

    // Speed multiplier slider — update label live
    document.getElementById('speed-mult-slider').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      document.getElementById('speed-mult-value').textContent = `${v}×`;
    });

    // Leave game
    document.getElementById('btn-leave-game').addEventListener('click', () => {
      Game.stop();
      Multiplayer.disconnect();
      currentRoom = null;
      localPlayer = null;
      isReady     = false;
      Multiplayer.connect();
      showScreen('menu');
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────
  async function init() {
    showLoading('Connecting…');

    try {
      const res = await fetch('/api/config');
      config = await res.json();
    } catch (err) {
      showToast('Failed to load game config from server.');
      hideLoading();
      return;
    }

    // Set a default vehicle
    selectedVehicleId = config.vehicles[0]?.id || 'sedan';

    bindButtons();
    wireMultiplayer();
    Multiplayer.connect();

    hideLoading();
    showScreen('menu');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
