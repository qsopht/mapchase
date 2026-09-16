require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameManager = require('./game/GameManager');
const Player = require('./game/Player');
const { VEHICLES, GAME_CONFIG } = require('./config/gameConfig');

const app = express();
const httpServer = http.createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
  pingTimeout: 10000,
  pingInterval: 5000,
});

const gameManager = new GameManager();
const connectedPlayers = new Map(); // socketId -> Player

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

// Sends game config (including Maps API key) to client
app.get('/api/config', (req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    defaultLocation: GAME_CONFIG.defaultLocation,
    defaultZoom: GAME_CONFIG.defaultZoom,
    vehicles: VEHICLES,
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    rooms: gameManager.getRoomCount(),
    players: gameManager.getPlayerCount(),
  });
});

// Proxy to Google Roads API — keeps API key server-side.
// Sends a short path (current + projected point) to snapToRoads so we can
// derive the road bearing in addition to the snapped position.
app.get('/api/road/snap', async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
    return res.json({ snapped: false, reason: 'no_key' });
  }

  const lat1 = parseFloat(req.query.lat);
  const lng1 = parseFloat(req.query.lng);
  const heading = parseFloat(req.query.heading) || 0;

  if (isNaN(lat1) || isNaN(lng1) || lat1 < -90 || lat1 > 90 || lng1 < -180 || lng1 > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  // Project a second point ~40 m ahead in the vehicle's current heading
  // so that snapToRoads can return road geometry and we can derive bearing.
  const headRad = heading * Math.PI / 180;
  const projM   = 40;
  const latCos  = Math.cos(lat1 * Math.PI / 180);
  const lat2    = lat1 + Math.cos(headRad) * projM / 111320;
  const lng2    = lng1 + Math.sin(headRad) * projM / (111320 * latCos);

  const path = `${lat1},${lng1}|${lat2},${lng2}`;
  const url  = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=true&key=${apiKey}`;

  try {
    const roadsRes = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { Referer: process.env.APP_URL || 'http://localhost:3000' },
    });
    const data = await roadsRes.json();

    if (data.error) {
      console.warn('[Roads API] Error response:', JSON.stringify(data.error));
      return res.json({ snapped: false, reason: 'api_error', detail: data.error.message });
    }

    if (!data.snappedPoints || data.snappedPoints.length === 0) {
      return res.json({ snapped: false, reason: 'no_results' });
    }

    const pts   = data.snappedPoints;
    const first = pts[0].location;
    const last  = pts[pts.length - 1].location;

    // Road bearing: direction from first snapped point to last snapped point
    let roadBearing = null;
    if (pts.length >= 2) {
      const dy = last.latitude  - first.latitude;
      const dx = (last.longitude - first.longitude) * latCos;
      roadBearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    }

    res.json({
      snapped: true,
      lat:     first.latitude,
      lng:     first.longitude,
      bearing: roadBearing,
    });
  } catch (err) {
    console.warn('[Roads API]', err.message);
    res.json({ snapped: false, reason: 'api_error' });
  }
});

io.on('connection', (socket) => {
  const player = new Player(socket.id, socket.id);
  connectedPlayers.set(socket.id, player);
  console.log(`[+] Connected: ${socket.id}`);

  // ── Lobby ──────────────────────────────────────────────────────────────

  socket.on('createRoom', ({ name, vehicleId } = {}) => {
    player.name = String(name || 'Player').trim().slice(0, 20);
    player.vehicleId = VEHICLES.find(v => v.id === vehicleId) ? vehicleId : 'sedan';

    const room = gameManager.createRoom(player);
    socket.join(room.id);

    socket.emit('roomCreated', {
      roomId: room.id,
      player: player.toPublicJSON(),
      room: room.toPublicJSON(),
    });

    console.log(`[R] Room ${room.id} created by "${player.name}"`);
  });

  socket.on('joinRoom', ({ code, name, vehicleId } = {}) => {
    if (!code) { socket.emit('error', { message: 'Room code is required.' }); return; }

    player.name = String(name || 'Player').trim().slice(0, 20);
    player.vehicleId = VEHICLES.find(v => v.id === vehicleId) ? vehicleId : 'sedan';

    const result = gameManager.joinRoom(code.toUpperCase().trim(), player);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    const room = result.room;
    socket.join(room.id);

    socket.emit('roomJoined', {
      roomId: room.id,
      player: player.toPublicJSON(),
      room: room.toPublicJSON(),
    });

    socket.to(room.id).emit('playerJoined', {
      player: player.toPublicJSON(),
      room: room.toPublicJSON(),
    });

    console.log(`[J] "${player.name}" joined room ${room.id}`);
  });

  socket.on('changeVehicle', ({ vehicleId } = {}) => {
    if (!VEHICLES.find(v => v.id === vehicleId)) return;
    player.vehicleId = vehicleId;

    const room = gameManager.getPlayerRoom(player.id);
    if (room) io.to(room.id).emit('playerUpdated', { player: player.toPublicJSON() });
  });

  socket.on('setReady', ({ isReady } = {}) => {
    player.isReady = !!isReady;
    const room = gameManager.getPlayerRoom(player.id);
    if (room) io.to(room.id).emit('playerUpdated', { player: player.toPublicJSON() });
  });

  socket.on('startGame', () => {
    const room = gameManager.getPlayerRoom(player.id);
    if (!room || room.hostId !== player.id) return;

    room.startGame();
    io.to(room.id).emit('gameStarted', { room: room.toPublicJSON() });
    console.log(`[G] Game started in room ${room.id} (${room.players.size} players)`);
  });

  // ── In-game movement ───────────────────────────────────────────────────

  socket.on('move', ({ lat, lng, heading, speed } = {}) => {
    const room = gameManager.getPlayerRoom(player.id);
    if (!room || room.status !== 'playing') return;

    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    player.setPosition(lat, lng, heading || 0, Math.max(-60, Math.min(200, speed || 0)));

    // Broadcast only to others; local player handles own position
    socket.to(room.id).emit('playerMoved', {
      id: player.id,
      lat: player.lat,
      lng: player.lng,
      heading: player.heading,
      speed: player.speed,
      t: Date.now(),
    });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    const { room } = gameManager.removePlayer(player.id);
    connectedPlayers.delete(socket.id);

    if (room) {
      io.to(room.id).emit('playerLeft', {
        playerId: player.id,
        room: room.toPublicJSON(),
      });
    }

    console.log(`[-] Disconnected: "${player.name}" (${reason})`);
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`\n🚗  Road Rally  →  http://localhost:${PORT}\n`);
});
