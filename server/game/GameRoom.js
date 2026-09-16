const { GAME_CONFIG, randomSpawnLocation } = require('../config/gameConfig');

class GameRoom {
  constructor(id, hostId) {
    this.id = id;
    this.hostId = hostId;
    this.players = new Map(); // playerId -> Player
    this.status = 'lobby'; // 'lobby' | 'playing'
    this.createdAt = Date.now();
    this.location = randomSpawnLocation(); // random US city for this lobby
  }

  addPlayer(player) {
    player.roomId = this.id;

    // Spread spawn positions around this lobby's random US city
    const angle = Math.random() * Math.PI * 2;
    const radiusDeg = GAME_CONFIG.spawnRadiusMeters / 111320;
    const latCos = Math.cos(this.location.lat * Math.PI / 180);
    player.lat = this.location.lat + Math.cos(angle) * radiusDeg;
    player.lng = this.location.lng + Math.sin(angle) * radiusDeg / latCos;
    player.heading = Math.random() * 360;
    player.speed = 0;

    this.players.set(player.id, player);
  }

  removePlayer(playerId) {
    const wasHost = this.hostId === playerId;
    this.players.delete(playerId);

    if (wasHost && this.players.size > 0) {
      const newHost = this.players.values().next().value;
      newHost.isHost = true;
      this.hostId = newHost.id;
      return { newHostId: newHost.id };
    }
    return {};
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getPlayersArray() {
    return Array.from(this.players.values()).map(p => p.toPublicJSON());
  }

  isEmpty() {
    return this.players.size === 0;
  }

  startGame() {
    this.status = 'playing';
  }

  toPublicJSON() {
    return {
      id: this.id,
      hostId: this.hostId,
      status: this.status,
      playerCount: this.players.size,
      players: this.getPlayersArray(),
      location: {
        city:  this.location.city,
        state: this.location.state,
        lat:   this.location.lat,
        lng:   this.location.lng,
      },
    };
  }
}

module.exports = GameRoom;
