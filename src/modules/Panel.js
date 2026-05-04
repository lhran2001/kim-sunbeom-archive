import { NODES, MODULE_COLORS, MODULE_LABELS } from '../data/nodes.js';

export class Panel {
  constructor(onRelClick) {
    this.onRelClick = onRelClick;
    this.currentId  = null;

    document.getElementById('panel-close')
      .addEventListener('click', () => this.hide());
    document.getElementById('mirror-close')
      .addEventListener('click', () => this._hideMirror());
  }

  show(id) {
    const node = NODES.find(n => n.id === id);
    if (!node) return;
    this.currentId = id;

    const c = MODULE_COLORS[node.mod];

    // mod label
    document.getElementById('panel-mod').textContent = MODULE_LABELS[node.mod];
    document.getElementById('panel-mod').style.color = c.hex;

    // title
    document.getElementById('panel-title').textContent = node.text;
    document.getElementById('panel-title').style.borderLeft = `2px solid ${c.hex}`;
    document.getElementById('panel-title').style.paddingLeft = '8px';

    // body
    document.getElementById('panel-body').textContent = node.body;

    // meta
    const metaEl = document.getElementById('panel-meta');
    metaEl.innerHTML = '';
    Object.entries(node.meta).forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'meta-row';
      row.innerHTML = `<span class="meta-key">${k}</span><span>${v}</span>`;
      metaEl.appendChild(row);
    });

    // relations
    const relWrap = document.getElementById('panel-rel-wrap');
    relWrap.innerHTML = '';
    if (node.rel && node.rel.length) {
      const lbl = document.createElement('div');
      lbl.className = 'rel-label';
      lbl.textContent = '연결된 개념';
      relWrap.appendChild(lbl);

      node.rel.forEach(relText => {
        const target = NODES.find(n => n.text === relText);
        const item = document.createElement('div');
        item.className = 'rel-item';
        item.innerHTML = `<span class="rel-arrow">→</span>${relText}`;
        if (target) {
          item.style.color = MODULE_COLORS[target.mod].hex;
          item.addEventListener('click', () => this.onRelClick(target.id));
        }
        relWrap.appendChild(item);
      });
    }

    // mirror
    document.getElementById('panel-mirror').textContent = node.mirror || '';

    // show panel
    document.getElementById('right-panel').classList.remove('hidden');
  }

  hide() {
    document.getElementById('right-panel').classList.add('hidden');
    this.currentId = null;
  }

  showMirror(text) {
    const overlay = document.getElementById('mirror-overlay');
    document.getElementById('mirror-text').textContent = text;
    overlay.classList.add('active');
  }

  _hideMirror() {
    document.getElementById('mirror-overlay').classList.remove('active');
  }
}
