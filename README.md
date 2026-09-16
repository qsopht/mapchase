# Road Rally — Multiplayer Driving Game

A browser-based multiplayer driving game. Multiple players join a shared room, select a vehicle, and drive around a real-world road map in real time.

---

## Prerequisites

- **Node.js** 18 or later
- A **Google Maps API key** with the **Maps JavaScript API** enabled

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Then open `.env` and fill in your Google Maps API key:

```
GOOGLE_MAPS_API_KEY=your_actual_key_here
PORT=3000
```

### 3. Enable the right Google Maps APIs

In [Google Cloud Console](https://console.cloud.google.com/):

1. Go to **APIs & Services → Library**
2. Enable **Maps JavaScript API**
3. (Optional, for future snap-to-road) Enable **Roads API**

Restrict the API key to your domain / localhost for production use.

### 4. Start the server

Development (auto-restart on file changes):

```bash
npm run dev
```

Production:

```bash
npm start
```

### 5. Open the game

Navigate to [http://localhost:3000](http://localhost:3000)

---

## Playing

### Create a room
1. Enter your name
2. Click **Create Game**
3. Share the 5-character room code with friends

### Join a room
1. Enter your name
2. Type the room code in the Join field
3. Click **Join**

### Lobby
- Select a vehicle by clicking a vehicle card
- Click **Ready Up** when ready
- The host can click **Start Game** at any time

### Driving Controls

| Key           | Action          |
|---------------|-----------------|
| W / ↑         | Accelerate      |
| S / ↓         | Brake / Reverse |
| A / ←         | Turn left       |
| D / →         | Turn right      |
| Space         | Handbrake       |

---

## Testing Multiplayer Locally

Open two browser windows (or tabs) side by side:

1. **Window 1**: Enter name → Create Game → note the room code
2. **Window 2**: Enter a different name → paste the room code → Join
3. Both players appear in the same lobby
4. Select vehicles → Start Game
5. Drive both vehicles independently — each window sees the other moving in real time

A player disappears from the map immediately when they close their window or click Leave.

---

## Configuring the Starting Location

The default spawn location is configured in [`server/config/gameConfig.js`](server/config/gameConfig.js):

```js
const GAME_CONFIG = {
  defaultLocation: {
    lat: 36.0726,
    lng: -79.0942,  // Greensboro, NC
  },
  defaultZoom: 16,
  ...
};
```

Change `lat` / `lng` to any city you like. All new games will spawn there.

---

## Architecture

```
road-rally/
├── server/
│   ├── server.js              Express + Socket.IO server
│   ├── game/
│   │   ├── GameManager.js     Manages all active rooms
│   │   ├── GameRoom.js        Room state (players, status, spawning)
│   │   └── Player.js          Player data model
│   └── config/
│       └── gameConfig.js      Default location, vehicle definitions
│
├── client/
│   ├── index.html             All screens (menu, lobby, game)
│   ├── css/styles.css         Game UI styling
│   └── js/
│       ├── app.js             App controller — screen flow, UI events
│       ├── multiplayer.js     Socket.IO client wrapper
│       ├── input.js           Keyboard input (WASD + arrows + space)
│       ├── vehicle.js         Vehicle physics + SVG car graphics
│       ├── map.js             Google Maps adapter (swappable)
│       └── game.js            Main game loop, interpolation
│
├── .env.example               Required environment variables
├── package.json
└── README.md
```

### Key design decisions

- **Client-side physics** with server position broadcast at 15 Hz
- **Dead-reckoning interpolation** on remote players for smooth movement
- **Map adapter pattern** — all Google Maps code is isolated in `map.js`. To switch providers, replace that file
- **In-memory state** — no database needed for the prototype; `GameManager` holds all rooms and players
- **Room isolation** — Socket.IO rooms ensure players in different rooms never receive each other's events

---

## Known Limitations

- Vehicles move freely (no road-snapping). Players can drive off-road.
- No collision detection between vehicles.
- The host must start the game; no auto-start.
- No persistent accounts — names and scores reset when the server restarts.
- Designed for desktop browsers; mobile touch controls not yet implemented.

---

## Recommended Next Steps

1. **Snap-to-road** — Use Google Roads API `snapToRoads` to keep vehicles on roads
2. **Collision detection** — Detect when vehicles overlap and apply impulse response
3. **Race mode** — Add checkpoints, lap counting, and a race timer
4. **Mobile controls** — Virtual joystick overlay for touch devices
5. **Sound effects** — Engine revs, tire squeals, and ambient city audio
6. **Persistent leaderboard** — Add SQLite or Postgres for scores and player stats
7. **Multiple cities** — Make `defaultLocation` selectable from a list at room creation
