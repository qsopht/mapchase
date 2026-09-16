// Socket.IO client wrapper.
// Exposes a clean API so the rest of the app never touches io() directly.

const Multiplayer = (() => {
  let socket = null;
  const handlers = {}; // eventName -> [fn, ...]

  function on(event, fn) {
    (handlers[event] = handlers[event] || []).push(fn);
  }

  function emit(event, data) {
    if (handlers[event]) handlers[event].forEach(fn => fn(data));
  }

  return {
    on,

    connect() {
      socket = io({ transports: ['websocket'], reconnectionAttempts: 5 });

      socket.on('connect',    () => emit('connect', {}));
      socket.on('disconnect', (reason) => emit('disconnect', { reason }));
      socket.on('connect_error', (err) => emit('connectError', { message: err.message }));

      socket.on('roomCreated',   d => emit('roomCreated', d));
      socket.on('roomJoined',    d => emit('roomJoined', d));
      socket.on('playerJoined',  d => emit('playerJoined', d));
      socket.on('playerLeft',    d => emit('playerLeft', d));
      socket.on('playerUpdated', d => emit('playerUpdated', d));
      socket.on('gameStarted',   d => emit('gameStarted', d));
      socket.on('playerMoved',   d => emit('playerMoved', d));
      socket.on('error',         d => emit('error', d));
    },

    get id() { return socket ? socket.id : null; },
    get connected() { return socket ? socket.connected : false; },

    createRoom({ name, vehicleId }) {
      socket.emit('createRoom', { name, vehicleId });
    },
    joinRoom({ code, name, vehicleId }) {
      socket.emit('joinRoom', { code, name, vehicleId });
    },
    changeVehicle(vehicleId) {
      socket.emit('changeVehicle', { vehicleId });
    },
    setReady(isReady) {
      socket.emit('setReady', { isReady });
    },
    startGame() {
      socket.emit('startGame');
    },
    sendMove({ lat, lng, heading, speed }) {
      socket.emit('move', { lat, lng, heading, speed });
    },
    disconnect() {
      if (socket) socket.disconnect();
    },
  };
})();
