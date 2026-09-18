// Keyboard + touch joystick input manager.
const Input = (() => {
  // ── Keyboard ─────────────────────────────────────────────────────────
  const held = new Set();

  function onKeyDown(e) {
    held.add(e.code);
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { held.delete(e.code); }
  function onBlur()   { held.clear(); }

  // ── Touch joystick state ─────────────────────────────────────────────
  let jDx = 0, jDy = 0;       // normalized -1..1
  let jTouchId = null;
  let jOriginX = 0, jOriginY = 0;
  let touchHandbrake = false;

  const J_RADIUS = 55;  // max stick travel px
  const J_DEAD   = 0.2; // normalized dead zone

  function _initJoystick() {
    const zone  = document.getElementById('joystick-zone');
    const base  = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    const hbBtn = document.getElementById('btn-handbrake-touch');
    if (!zone || !base || !stick) return;

    // Touch start anywhere in left zone → spawn joystick there
    zone.addEventListener('touchstart', (e) => {
      if (jTouchId !== null) return;
      const t = e.changedTouches[0];
      jTouchId = t.identifier;
      jOriginX = t.clientX;
      jOriginY = t.clientY;
      jDx = jDy = 0;

      base.style.left = (t.clientX - J_RADIUS) + 'px';
      base.style.top  = (t.clientY - J_RADIUS) + 'px';
      stick.style.transform = 'translate(-50%, -50%)';
      base.style.display = 'block';
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== jTouchId) continue;
        const rawDx = t.clientX - jOriginX;
        const rawDy = t.clientY - jOriginY;
        const dist  = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
        const clamp = Math.min(dist, J_RADIUS);
        const angle = Math.atan2(rawDy, rawDx);
        const cx = Math.cos(angle) * clamp;
        const cy = Math.sin(angle) * clamp;
        jDx = cx / J_RADIUS;
        jDy = cy / J_RADIUS;
        stick.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
      }
      e.preventDefault();
    }, { passive: false });

    function endJoystick(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== jTouchId) continue;
        jTouchId = null;
        jDx = jDy = 0;
        base.style.display = 'none';
        stick.style.transform = 'translate(-50%, -50%)';
      }
    }
    zone.addEventListener('touchend',    endJoystick, { passive: false });
    zone.addEventListener('touchcancel', endJoystick, { passive: false });

    // Handbrake button
    if (hbBtn) {
      hbBtn.addEventListener('touchstart', (e) => { touchHandbrake = true;  e.preventDefault(); }, { passive: false });
      hbBtn.addEventListener('touchend',   (e) => { touchHandbrake = false; e.preventDefault(); }, { passive: false });
      hbBtn.addEventListener('touchcancel',(e) => { touchHandbrake = false; }, { passive: false });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    init() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      window.addEventListener('blur',    onBlur);
      _initJoystick();
    },

    getState() {
      return {
        accelerate: held.has('KeyW') || held.has('ArrowUp')    || jDy < -J_DEAD,
        brake:      held.has('KeyS') || held.has('ArrowDown')  || jDy >  J_DEAD,
        left:       held.has('KeyA') || held.has('ArrowLeft')  || jDx < -J_DEAD,
        right:      held.has('KeyD') || held.has('ArrowRight') || jDx >  J_DEAD,
        handbrake:  held.has('Space') || touchHandbrake,
      };
    },
  };
})();
