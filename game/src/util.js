// Shared helpers for Solstice City: math, random, procedural canvas textures.
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// Deterministic hash-based pseudo random for city layout (same city every load).
export function hashRand(x, z, salt = 0) {
  let h = (x * 374761393 + z * 668265263 + salt * 974634211) | 0;
  h = (h ^ (h >> 13)) | 0; h = Math.imul(h, 1274126177); h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
// Facade texture: lit windows on a coloured wall, drawn once per palette.
export function facadeTexture(base, litRatio = 0.42) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 128, 2);
  const cols = 6, rows = 14;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? pick(['#ffd98a', '#ffe9b0', '#9fd8ff', '#fff3c4']) : 'rgba(10,16,28,0.85)';
      g.fillRect(8 + col * 20, 10 + r * 17, 12, 11);
    }
  }
  return c;
}
// Asphalt with a dashed centre line, tiled along roads.
export function roadTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#2e3138'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 200; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33c';
  g.fillRect(62, 8, 4, 44); g.fillRect(62, 76, 4, 44);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(4, 0, 3, 128); g.fillRect(121, 0, 3, 128);
  return c;
}
export function sidewalkTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#9a938a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  return c;
}
