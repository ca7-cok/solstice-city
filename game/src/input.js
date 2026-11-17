// Keyboard + mouse state with edge detection (pressed-this-frame) for actions.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.dragging = false;
    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      this.dragging = true;
      this.mouseDown = true;
      this.clicked = true;
    };
    this._onMouseUp = () => { this.dragging = false; this.mouseDown = false; };
    this._onWheel = (e) => { this.wheelDelta += e.deltaY; e.preventDefault(); };
    this._onBlur = () => { this.keys.clear(); this.dragging = false; this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // WASD / arrows as a -1..1 pair, in camera space.
  moveAxes() {
    const f = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const r = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { f, r };
  }
  sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }

  // Call once per frame after the game has read the state.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.clicked = false;
  }
}
