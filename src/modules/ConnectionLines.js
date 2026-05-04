import { NODES, CONNECTIONS, MODULE_COLORS } from '../data/nodes.js';

export class ConnectionLines {
  constructor(scene, onNodeClick) {
    this.scene       = scene;
    this.onNodeClick = onNodeClick;
    this.svg         = document.getElementById('connections-overlay');
    this.visible     = true;
    this._nodeEls    = {};   // id → { g, dot, ring, mid }
    this._lineEls    = [];   // { el, pulse, a, b, color }
    this._activeId   = null;
    this._build();
  }

  /* ── SVG 구성 ─────────────────────────────────────── */
  _build() {
    this.svg.innerHTML = '';

    // ── Defs: 글로우 필터 ──
    const defs = this._el('defs');
    const filter = this._el('filter');
    filter.setAttribute('id', 'dotGlow');
    filter.setAttribute('x', '-100%'); filter.setAttribute('y', '-100%');
    filter.setAttribute('width', '300%'); filter.setAttribute('height', '300%');
    const blur = this._el('feGaussianBlur');
    blur.setAttribute('stdDeviation', '2.5'); blur.setAttribute('result', 'b');
    const merge = this._el('feMerge');
    ['b', 'SourceGraphic'].forEach(k => {
      const n = this._el('feMergeNode'); n.setAttribute('in', k); merge.appendChild(n);
    });
    filter.appendChild(blur); filter.appendChild(merge);
    defs.appendChild(filter);
    this.svg.appendChild(defs);

    // ── 선 (점 뒤에) ──
    CONNECTIONS.forEach(([aId, bId]) => {
      const a = NODES.find(n => n.id === aId);
      const b = NODES.find(n => n.id === bId);
      if (!a || !b) return;

      const color = this._blendColor(a.mod, b.mod);

      const line = this._el('line');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', '0.65');
      line.style.transition = 'opacity 0.4s ease, stroke-width 0.4s ease';
      this.svg.appendChild(line);

      // 펄스 점 (선을 따라 이동)
      const pulse = this._el('circle');
      pulse.setAttribute('r', '3.5');
      pulse.setAttribute('fill', color);
      pulse.setAttribute('opacity', '0');
      this.svg.appendChild(pulse);

      this._lineEls.push({ el: line, pulse, a, b, color, op: '0.65', sw: '2' });
    });

    // ── 노드 점 (선 위에) ──
    NODES.forEach(node => {
      const color = MODULE_COLORS[node.mod].hex;
      const g = this._el('g');
      g.style.cursor = 'pointer';
      g.style.transition = 'opacity 0.35s ease';

      // 외곽 글로우 (숨쉬기)
      const ring = this._el('circle');
      ring.setAttribute('r', '12');
      ring.setAttribute('fill', color);
      ring.setAttribute('opacity', '0.18');

      // 중간 링
      const mid = this._el('circle');
      mid.setAttribute('r', '8');
      mid.setAttribute('fill', 'none');
      mid.setAttribute('stroke', color);
      mid.setAttribute('stroke-width', '1.2');
      mid.setAttribute('opacity', '0.55');

      // 코어 점
      const dot = this._el('circle');
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', color);
      dot.setAttribute('filter', 'url(#dotGlow)');

      g.appendChild(ring); g.appendChild(mid); g.appendChild(dot);
      g.addEventListener('click', () => this.onNodeClick?.(node.id));
      this.svg.appendChild(g);
      this._nodeEls[node.id] = { g, dot, ring, mid, color };
    });
  }

  /* ── 매 프레임 위치 업데이트 ───────────────────────── */
  update(camX, camY, introProgress = 1) {
    if (!this.visible) { this.svg.style.display = 'none'; return; }
    this.svg.style.display = 'block';

    const rect = this.svg.getBoundingClientRect();
    const W = rect.width || 1, H = rect.height || 1;
    const T = performance.now() / 1000;

    // 노드 위치 계산
    // allPos: 카메라 앞에 있는 모든 노드 (선 연결에 사용)
    // pos:    화면 안에 있는 노드만 (dot 표시에 사용)
    const allPos = {};
    NODES.forEach(node => {
      const pt = this.scene.project(node.x, node.y, node.z, camX, camY, introProgress);
      if (!pt) return; // 카메라 뒤쪽 — 완전히 제외
      allPos[node.id] = pt;

      const el = this._nodeEls[node.id];
      if (!el) return;
      const ok = pt.x > -20 && pt.x < W + 20 && pt.y > -20 && pt.y < H + 20;
      if (ok) {
        el.g.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
        el.g.style.display = 'block';
        // 외곽 링 숨쉬기
        const r = 11 + Math.sin(T * 1.4 + node.id.charCodeAt(0) * 0.7) * 3.5;
        el.ring.setAttribute('r', r.toFixed(1));
      } else {
        el.g.style.display = 'none';
      }
    });

    // 선 + 펄스 업데이트 (allPos 사용 — 화면 밖 노드도 선 끝점으로 허용)
    this._lineEls.forEach((lineObj, i) => {
      const { el, pulse, a, b } = lineObj;
      const pa = allPos[a.id], pb = allPos[b.id];
      if (!pa || !pb) {
        el.setAttribute('opacity', '0'); pulse.setAttribute('opacity', '0'); return;
      }
      // 양쪽 노드가 화면에 있을 때 현재 목표 opacity 복원
      el.setAttribute('opacity', lineObj.op);
      el.setAttribute('stroke-width', lineObj.sw);
      el.setAttribute('x1', pa.x.toFixed(1)); el.setAttribute('y1', pa.y.toFixed(1));
      el.setAttribute('x2', pb.x.toFixed(1)); el.setAttribute('y2', pb.y.toFixed(1));

      // 펄스: 0→1 이동
      const speed = 0.06 + i * 0.015;
      const t = ((T * speed) % 1 + 1) % 1;
      pulse.setAttribute('cx', (pa.x + (pb.x - pa.x) * t).toFixed(1));
      pulse.setAttribute('cy', (pa.y + (pb.y - pa.y) * t).toFixed(1));
      const alpha = Math.sin(t * Math.PI);  // 양끝에서 페이드
      pulse.setAttribute('opacity', (alpha * 0.85).toFixed(2));
    });
  }

  /* ── 활성 노드 설정 (딤 효과) ────────────────────── */
  setActive(id) {
    this._activeId = id;

    if (!id) {
      // 전체 리셋
      Object.values(this._nodeEls).forEach(el => {
        el.g.style.opacity = '1';
        el.dot.setAttribute('r', '5');
      });
      this._lineEls.forEach(lineObj => {
        lineObj.op = '0.65'; lineObj.sw = '2';
        lineObj.el.setAttribute('opacity', '0.65');
        lineObj.el.setAttribute('stroke-width', '2');
      });
      return;
    }

    // 연결된 노드 집합
    const connected = new Set([id]);
    CONNECTIONS.forEach(([a, b]) => {
      if (a === id) connected.add(b);
      if (b === id) connected.add(a);
    });

    // 노드 딤
    Object.entries(this._nodeEls).forEach(([nid, el]) => {
      if (nid === id) {
        el.g.style.opacity = '1';
        el.dot.setAttribute('r', '8');     // 선택 노드: 크게
      } else if (connected.has(nid)) {
        el.g.style.opacity = '0.75';
        el.dot.setAttribute('r', '5');
      } else {
        el.g.style.opacity = '0.10';       // 비연결: 거의 안 보이게
        el.dot.setAttribute('r', '5');
      }
    });

    // 선 딤
    this._lineEls.forEach(lineObj => {
      const { el, a, b } = lineObj;
      const active = connected.has(a.id) && connected.has(b.id);
      lineObj.op = active ? '0.85' : '0.05';
      lineObj.sw = active ? '2.2'  : '0.5';
      el.setAttribute('opacity',      lineObj.op);
      el.setAttribute('stroke-width', lineObj.sw);
    });
  }

  /* ── 공개 API ──────────────────────────────────────── */
  setVisible(v) { this.visible = v; if (!v) this.svg.style.display = 'none'; }

  // 하위 호환
  highlightNode(id) { this.setActive(id); }
  resetHighlight()   { this.setActive(null); }

  /* ── 헬퍼 ─────────────────────────────────────────── */
  _el(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  _blendColor(modA, modB) {
    const a = MODULE_COLORS[modA], b = MODULE_COLORS[modB];
    const r = ((a.r + b.r) / 2) | 0;
    const g = ((a.g + b.g) / 2) | 0;
    const bv= ((a.b + b.b) / 2) | 0;
    return `rgb(${r},${g},${bv})`;
  }
}
