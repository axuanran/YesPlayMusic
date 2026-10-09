// Renderer-side registry for the shared radio engine instance. The engine is
// created in electron/ipcRenderer.js (where the player and API layers live);
// UI components reach it through this module to show status and reasons.

let currentEngine = null;

export function registerRadioEngine(engine) {
  currentEngine = engine;
}

export function getRadioEngine() {
  return currentEngine;
}
