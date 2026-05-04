import { NODES, CONNECTIONS, MODULE_COLORS, MODULE_LABELS } from '../data/nodes.js';

export class DataMap {
  constructor(onNodeClick) {
    this.onNodeClick = onNodeClick;
    this.activeId    = null;
    this.visited     = new Set();
    this._build();
  }

  _build() {
    const list = document.getElementById('node-list');
    list.innerHTML = '';

    const mods = ['logic','rest','shadows'];
    mods.forEach(mod => {
      const nodes = NODES.filter(n => n.mod === mod);
      const section = document.createElement('div');
      section.className = 'node-section';

      const label = document.createElement('div');
      label.className = 'node-section-label';
      label.textContent = MODULE_LABELS[mod];
      section.appendChild(label);

      nodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'node-item';
        item.dataset.id  = node.id;
        item.dataset.mod = node.mod;

        const dot = document.createElement('span');
        dot.className = 'node-dot';
        dot.style.background = MODULE_COLORS[mod].hex;

        const txt = document.createElement('span');
        txt.className = 'node-text';
        txt.textContent = node.text;

        item.appendChild(dot);
        item.appendChild(txt);
        item.addEventListener('click', () => this.onNodeClick(node.id));
        section.appendChild(item);
      });

      list.appendChild(section);
    });
  }

  setActive(id) {
    this.activeId = id;
    document.querySelectorAll('.node-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  markVisited(id) {
    this.visited.add(id);
    const el = document.querySelector(`.node-item[data-id="${id}"]`);
    if (el) el.classList.add('visited');

    // update counter
    const n = this.visited.size;
    document.getElementById('counter-num').textContent = n;
    document.getElementById('counter-fill').style.width = `${(n/12)*100}%`;
    return n;
  }

  /* 활성 노드와 연결된 노드만 남기고 나머지 흐리게 */
  dimExcept(activeId) {
    const connected = new Set([activeId]);
    CONNECTIONS.forEach(([a, b]) => {
      if (a === activeId) connected.add(b);
      if (b === activeId) connected.add(a);
    });
    document.querySelectorAll('.node-item').forEach(el => {
      el.classList.toggle('dimmed', !connected.has(el.dataset.id));
    });
  }

  clearDim() {
    document.querySelectorAll('.node-item').forEach(el => el.classList.remove('dimmed'));
  }

  get visitedCount() { return this.visited.size; }
}
