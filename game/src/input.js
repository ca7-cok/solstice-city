// Keyboard + mouse input: WASD, sprint, jump/handbrake, drag-look, wheel zoom,
// click to shoot, E to enter cars / talk, R reload, F punch, M missions, P save.
export class Input {
  constructor(game) {
    this.game = game;
    this.forward = false; this.back = false; this.left = false; this.right = false;
    this.sprint = false; this.jump = false; this.handbrake = false;
    this.mouseDown = false;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.onShoot = null; this.onInteract = null; this.onPunch = null;
    this.onReload = null; this.onPause = null; this.onSave = null; this.onHelp = null;
    this.attach();
  }

  attach() {
    const key = (e) => {
      const k = e.code;
      if (k === 'KeyW' || k === 'ArrowUp') this.forward = true;
      if (k === 'KeyS' || k === 'ArrowDown') this.back = true;
      if (k === 'KeyA' || k === 'ArrowLeft') this.left = true;
      if (k === 'KeyD' || k === 'ArrowRight') this.right = true;
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.sprint = true;
      if (k === 'Space') { this.jump = true; this.handbrake = true; e.preventDefault(); }
    };
    const keyup = (e) => {
      const k = e.code;
      if (k === 'KeyW' || k === 'ArrowUp') this.forward = false;
      if (k === 'KeyS' || k === 'ArrowDown') this.back = false;
      if (k === 'KeyA' || k === 'ArrowLeft') this.left = false;
      if (k === 'KeyD' || k === 'ArrowRight') this.right = false;
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.sprint = false;
      if (k === 'Space') { this.jump = false; this.handbrake = false; }
    };
    const keydown = (e) => {
      const k = e.code;
      if (k === 'KeyE' && this.onInteract) this.onInteract();
      if (k === 'KeyR' && this.onReload) this.onReload();
      if (k === 'KeyF' && this.onPunch) this.onPunch();
      if (k === 'KeyM') this.game.hud.toast('MISSIONS', this.game.missionListText());
      if (k === 'KeyP' && this.onSave) this.onSave();
      if (k === 'KeyH' && this.onHelp) this.onHelp();
      if (k === 'Escape' && this.onPause) this.onPause();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyup);
    window.addEventListener('keydown', keydown);
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseDown && !this.dragging) { /* click without drag handled below */ }
      if (this.mouseDown && Math.abs(e.clientX - this.lastX) < 5 && Math.abs(e.clientY - this.lastY) < 5) {
        if (this.onShoot && this.game.state === 'playing') this.onShoot();
      }
      this.mouseDown = false; this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.game.cameraYaw -= dx * 0.005;
      this.game.cameraPitch = Math.max(-0.15, Math.min(0.9, this.game.cameraPitch + dy * 0.004));
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.game.cameraDist = Math.max(5, Math.min(16, this.game.cameraDist + Math.sign(e.deltaY) * 1.2));
    }, { passive: false });
  }
}
