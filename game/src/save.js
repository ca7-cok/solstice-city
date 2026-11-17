// Solstice City save / load (localStorage, no network).
const KEY = 'solstice-city-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    return s;
  } catch { return null; }
}

export function writeSave(state) {
  try {
    const data = {
      money: Math.round(state.money),
      missionsDone: state.missionsDone.slice(),
      activeMission: state.activeMission,
      player: { x: state.playerPos.x, z: state.playerPos.z },
      health: state.health,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
