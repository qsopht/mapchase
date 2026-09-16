// Keyboard input manager. Tracks key state and exposes a simple state snapshot.
const Input = (() => {
  const held = new Set();

  function onKeyDown(e) {
    held.add(e.code);
    // Prevent page scroll on arrow keys / space
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { held.delete(e.code); }
  function onBlur()   { held.clear(); }

  return {
    init() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      window.addEventListener('blur',    onBlur);
    },

    getState() {
      return {
        accelerate: held.has('KeyW') || held.has('ArrowUp'),
        brake:      held.has('KeyS') || held.has('ArrowDown'),
        left:       held.has('KeyA') || held.has('ArrowLeft'),
        right:      held.has('KeyD') || held.has('ArrowRight'),
        handbrake:  held.has('Space'),
      };
    },
  };
})();
