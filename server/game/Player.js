class Player {
  constructor(id, socketId) {
    this.id = id;
    this.socketId = socketId;
    this.name = 'Anonymous';
    this.roomId = null;
    this.vehicleId = 'sedan';
    this.lat = 0;
    this.lng = 0;
    this.heading = 0;
    this.speed = 0;
    this.isReady = false;
    this.isHost = false;
    this.connectedAt = Date.now();
    this.lastUpdate = Date.now();
  }

  setPosition(lat, lng, heading, speed) {
    this.lat = lat;
    this.lng = lng;
    this.heading = heading;
    this.speed = speed;
    this.lastUpdate = Date.now();
  }

  toPublicJSON() {
    return {
      id: this.id,
      name: this.name,
      vehicleId: this.vehicleId,
      lat: this.lat,
      lng: this.lng,
      heading: this.heading,
      speed: this.speed,
      isReady: this.isReady,
      isHost: this.isHost,
    };
  }
}

module.exports = Player;
