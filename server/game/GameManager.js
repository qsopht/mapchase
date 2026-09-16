const GameRoom = require('./GameRoom');

class GameManager {
  constructor() {
    this.rooms = new Map();           // roomId -> GameRoom
    this.playerRoomIndex = new Map(); // playerId -> roomId
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let attempts = 0;
    do {
      code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      if (++attempts > 500) throw new Error('Could not generate unique room code');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostPlayer) {
    const code = this._generateCode();
    const room = new GameRoom(code, hostPlayer.id);
    hostPlayer.isHost = true;
    room.addPlayer(hostPlayer);
    this.rooms.set(code, room);
    this.playerRoomIndex.set(hostPlayer.id, code);
    return room;
  }

  joinRoom(code, player) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found. Check the room code.' };
    if (room.status === 'playing') return { error: 'Game already in progress.' };
    if (room.players.size >= 20) return { error: 'Room is full (max 20 players).' };

    room.addPlayer(player);
    this.playerRoomIndex.set(player.id, code);
    return { room };
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  getPlayerRoom(playerId) {
    const code = this.playerRoomIndex.get(playerId);
    return code ? this.rooms.get(code) : null;
  }

  removePlayer(playerId) {
    const code = this.playerRoomIndex.get(playerId);
    if (!code) return { room: null };

    const room = this.rooms.get(code);
    if (!room) return { room: null };

    const hostInfo = room.removePlayer(playerId);
    this.playerRoomIndex.delete(playerId);

    if (room.isEmpty()) {
      this.rooms.delete(code);
      return { room: null, ...hostInfo };
    }

    return { room, ...hostInfo };
  }

  getRoomCount() {
    return this.rooms.size;
  }

  getPlayerCount() {
    return this.playerRoomIndex.size;
  }
}

module.exports = GameManager;
