import { NODES } from '../data/nodes.js';

const DWELL_DURATION = 1800; // ms to trigger dwell

export class GazeSystem {
  constructor(canvas, onDwell) {
    this.canvas   = canvas;
    this.onDwell  = onDwell;
    this.visited  = new Set();
    this.mirrorShown = false;

    // dwell state
    this._hoverId  = null;
    this._dwellStart = null;
    this._dwellTimer = null;
    this._animId   = null;

    // UI elements
    this._bar     = document.getElementById('dwell-bar');
    this._name    = document.getElementById('dwell-name');
    this._fill    = document.getElementById('dwell-fill');
    this._timeEl  = document.getElementById('dwell-time');

    // Start render loop for dwell bar
    this._loop();
  }

  /* called from chip/node hover */
  startHover(nodeId) {
    if (this._hoverId === nodeId) return;
    this._hoverId   = nodeId;
    this._dwellStart = performance.now();

    const node = NODES.find(n => n.id === nodeId);
    this._name.textContent = node ? node.text : '';
    this._bar.classList.add('active');
  }

  endHover() {
    this._hoverId    = null;
    this._dwellStart = null;
    this._fill.style.width = '0%';
    this._bar.classList.remove('active');
    this._timeEl.textContent = '';
  }

  recordVisit(nodeId) {
    this.visited.add(nodeId);
  }

  get visitedCount() { return this.visited.size; }

  _loop() {
    if (this._hoverId && this._dwellStart !== null) {
      const elapsed = performance.now() - this._dwellStart;
      const pct = Math.min(elapsed / DWELL_DURATION * 100, 100);
      this._fill.style.width = `${pct}%`;
      const secs = (elapsed / 1000).toFixed(1);
      this._timeEl.textContent = `${secs}s`;

      if (elapsed >= DWELL_DURATION) {
        const id = this._hoverId;
        this.endHover();
        this.onDwell(id);
      }
    }
    this._animId = requestAnimationFrame(() => this._loop());
  }
}
