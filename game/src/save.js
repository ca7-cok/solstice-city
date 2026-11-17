// Save / load through localStorage. One key, one JSON blob.
export const SAVE_KEY = 'solstice-city-save-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}
