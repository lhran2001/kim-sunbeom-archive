import { SPACE_POINTS } from '../data/nodes.js';

export class SpaceChips {
  constructor(onNodeClick) {
    this.onNodeClick = onNodeClick;
    this.layer       = document.getElementById('chips-layer');
    this.currentView = 'outside';
    this._chips      = {};   // view → [elements]
    this._buildAll();
    this.setView('outside');
  }

  _buildAll() {
    Object.entries(SPACE_POINTS).forEach(([view, pts]) => {
      this._chips[view] = pts.map(pt => {
        const el = document.createElement('div');
        el.className = 'space-chip';
        el.style.left  = pt.x;
        el.style.top   = pt.y;
        el.style.color = pt.color;
        el.textContent = pt.label;
        el.style.display = 'none';
        el.addEventListener('click', () => this.onNodeClick(pt.nodeId));
        this.layer.appendChild(el);
        return el;
      });
    });
  }

  setView(view) {
    this.currentView = view;

    // hide all
    Object.values(this._chips).forEach(arr =>
      arr.forEach(el => { el.style.display = 'none'; })
    );

    // show current interior
    if (view !== 'outside' && this._chips[view]) {
      this._chips[view].forEach((el, i) => {
        setTimeout(() => {
          el.style.display = 'block';
          el.style.opacity = '0';
          el.style.transition = 'opacity 0.4s ease';
          requestAnimationFrame(() => { el.style.opacity = '1'; });
        }, i * 80);
      });
    }
  }
}
