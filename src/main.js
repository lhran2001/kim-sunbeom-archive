import { gsap } from 'gsap';
import { NODES, MODULE_COLORS } from './data/nodes.js';
import { Scene }           from './modules/Scene.js';
import { DataMap }         from './modules/DataMap.js';
import { Panel }           from './modules/Panel.js';
import { ConnectionLines } from './modules/ConnectionLines.js';
import { SpaceChips }      from './modules/SpaceChips.js';
import { GazeSystem }      from './modules/GazeSystem.js';

/* ── state ─────────────────────────────────────────── */
let scene, dataMap, panel, connLines, spaceChips, gazeSystem;
let currentView   = 'outside';
let introProgress = 0;
let camX = 0, camY = 0;
let isDragging = false, dragSX = 0, dragSY = 0, camSX = 0, camSY = 0;

// 드래그 후 관성 / 자동 드리프트
let velX = 0, velY = 0;           // 관성 속도
let lastDragX = 0, lastDragY = 0; // 직전 프레임 위치 (속도 계산용)
const DRIFT_SPEED  = 0.00018;     // 자동 궤도 속도 (rad/frame)
const INERTIA_DECAY = 0.92;       // 관성 감쇠 계수

const MIRROR_MESSAGE =
`당신은 12개의 파편을 모두 보았습니다.\n\n` +
`완벽해 보이는 사람의 내부도\n` +
`흔들리고 있다는 것.\n\n` +
`그리고 당신의 시선이 가장 오래 머문 곳이\n` +
`당신 자신의 내면 지형도였습니다.`;

const SHADOWS_MIRROR_MESSAGE =
`당신은 Shadows의 네 파편을 모두 들여다보았습니다.\n\n` +
`나태함, 두려움, 미완성, 실패.\n\n` +
`이것들을 기록한다는 것은\n` +
`그것들과 함께 살아가기로 했다는 뜻입니다.`;

/* ── init ──────────────────────────────────────────── */
async function init() {
  // Scene
  scene = new Scene(document.getElementById('canvas-wrap'));
  await scene.load();

  // Modules
  dataMap    = new DataMap(onNodeClick);
  panel      = new Panel(onRelClick);
  connLines  = new ConnectionLines(scene, onNodeClick);
  spaceChips = new SpaceChips(onNodeClick);
  gazeSystem = new GazeSystem(scene.renderer.domElement, onDwell);

  // 3D node chips (outside view)
  buildNodeChips();

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => setView(btn.dataset.view))
  );

  // 패널 닫기 → 딤 초기화
  document.getElementById('panel-close').addEventListener('click', () => {
    connLines.setActive(null);
    dataMap.clearDim();
    dataMap.setActive(null);
  });

  // Camera drag
  setupDrag();

  // Intro sequence
  startIntro();

  // Render loop
  animate();
}

/* ── intro ─────────────────────────────────────────── */
function startIntro() {
  const overlay = document.getElementById('intro-overlay');
  const status  = document.getElementById('topbar-status');

  // After 1.4s fade the overlay and animate camera in
  setTimeout(() => {
    overlay.classList.add('fade-out');
    status.textContent = 'EXPLORE';

    gsap.to({ v: 0 }, {
      v: 1, duration: 2.4, ease: 'power2.inOut',
      onUpdate() { introProgress = this.targets()[0].v; scene.setUniform('u_intro', introProgress); },
    });

    setTimeout(() => overlay.remove(), 2000);
  }, 1400);
}

/* ── node chips (3D labels on outside view) ─────────── */
function buildNodeChips() {
  const layer = document.getElementById('chips-layer');

  NODES.forEach(node => {
    const el = document.createElement('div');
    el.className   = 'node-chip';
    el.dataset.id  = node.id;
    el.style.color = MODULE_COLORS[node.mod].hex;
    el.textContent = node.text;
    el.style.display = 'none';

    el.addEventListener('click',      () => onNodeClick(node.id));
    el.addEventListener('mouseenter', () => {
      gazeSystem.startHover(node.id);
      connLines.highlightNode(node.id);
    });
    el.addEventListener('mouseleave', () => {
      gazeSystem.endHover();
      // 패널이 열려 있지 않을 때만 딤 초기화
      if (!panel.currentId) connLines.resetHighlight();
    });

    layer.appendChild(el);
  });
}

function updateNodeChips() {
  if (currentView !== 'outside') return;
  const rect = document.getElementById('canvas-wrap').getBoundingClientRect();

  NODES.forEach(node => {
    const el = document.querySelector(`.node-chip[data-id="${node.id}"]`);
    if (!el) return;

    const pt = scene.project(node.x, node.y, node.z, camX, camY, introProgress);
    if (!pt) { el.style.display = 'none'; return; }

    // visibility: only show if on-screen
    const inBounds = pt.x > 0 && pt.x < rect.width && pt.y > 0 && pt.y < rect.height;
    el.style.display = inBounds ? 'block' : 'none';
    el.style.left    = `${pt.x}px`;
    el.style.top     = `${pt.y}px`;
  });
}

/* ── drag / camera ──────────────────────────────────── */
function setupDrag() {
  const wrap = document.getElementById('canvas-wrap');

  const down = (x, y) => {
    isDragging = true;
    dragSX = x; dragSY = y;
    camSX = camX; camSY = camY;
    lastDragX = x; lastDragY = y;
    velX = 0; velY = 0;
  };
  const move = (x, y) => {
    if (!isDragging) return;
    // 속도 계산 (관성을 위해)
    velX = (x - lastDragX) * 0.006;
    velY = (y - lastDragY) * 0.004;
    lastDragX = x; lastDragY = y;

    camX = camSX + (x - dragSX) * 0.006;
    camY = Math.max(-0.9, Math.min(0.9, camSY + (y - dragSY) * 0.004));
    scene.setUniform('u_cam', [camX, camY]);
  };
  const up = () => { isDragging = false; };

  wrap.addEventListener('mousedown',  e => down(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup',   up);

  wrap.addEventListener('touchstart', e => {
    const t = e.touches[0]; down(t.clientX, t.clientY);
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  wrap.addEventListener('touchend', up);
}

/* ── view switching ─────────────────────────────────── */
function setView(view) {
  currentView = view;

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view)
  );

  // 외부뷰 전환 시: 노드 칩 표시/숨김
  const isOutside = view === 'outside';
  document.querySelectorAll('.node-chip').forEach(el => {
    el.style.display = 'none'; // 항상 숨기고, updateNodeChips()가 outside에서만 다시 표시
  });

  scene.setView(view);
  spaceChips.setView(view);
  connLines.setVisible(isOutside);

  const labels = {
    outside: 'EXPLORE',
    living: '거실 — REST', study: '서재 — LOGIC', bedroom: '침실 — SHADOWS',
  };
  document.getElementById('topbar-status').textContent = labels[view] ?? '';

  // Shadows mode: animate u_distort up/down
  const isShadowsView = (view === 'outside'); // distort driven by node selection instead
}

/* ── node interactions ──────────────────────────────── */
function onNodeClick(nodeId) {
  panel.show(nodeId);
  dataMap.setActive(nodeId);

  // SVG 연결선 + 노드 리스트 딤 효과
  connLines.setActive(nodeId);
  dataMap.dimExcept(nodeId);

  // record visit
  const count = dataMap.markVisited(nodeId);
  gazeSystem.recordVisit(nodeId);

  // Shadows nodes → raise u_distort
  const node = NODES.find(n => n.id === nodeId);
  if (node) {
    const targetDistort = node.mod === 'shadows' ? 1.0 : 0.0;
    gsap.to({ v: scene.uniforms.u_distort.value }, {
      v: targetDistort, duration: 1.6, ease: 'power2.inOut',
      onUpdate() { scene.setUniform('u_distort', this.targets()[0].v); },
    });

    // switch to shadows shader if needed
    if (node.mod === 'shadows' && currentView === 'outside') {
      scene.setMode(3);
    } else if (node.mod !== 'shadows' && currentView === 'outside') {
      const modeMap = { logic: 1, rest: 2 };
      scene.setMode(modeMap[node.mod] ?? 0);
    }
  }

  // update glow on hover chip
  scene.setUniform('u_glow', 1.0);
  setTimeout(() => scene.setUniform('u_glow', 0.0), 1000);

  // Shadows nodes visited tracking
  if (node?.mod === 'shadows') _shadowsVisited.add(nodeId);

  // All 4 Shadows nodes visited → show Shadows mirror (once)
  if (_shadowsVisited.size >= 4 && !_shadowsMirrorShown) {
    _shadowsMirrorShown = true;
    setTimeout(() => panel.showMirror(SHADOWS_MIRROR_MESSAGE), 800);
  }

  // All 12 nodes visited → show full mirror (once)
  if (count >= 12 && !_mirrorShown) {
    _mirrorShown = true;
    setTimeout(() => panel.showMirror(MIRROR_MESSAGE), 2000);
  }
}

let _mirrorShown = false;
let _shadowsMirrorShown = false;
const _shadowsVisited = new Set();

function onRelClick(nodeId) { onNodeClick(nodeId); }

function onDwell(nodeId)    { onNodeClick(nodeId); }

/* ── render loop ────────────────────────────────────── */
const canvasWrap = () => document.getElementById('canvas-wrap');

function animate() {
  requestAnimationFrame(animate);

  if (currentView === 'outside') {
    if (!isDragging) {
      // ① 관성: 드래그 후 손 뗐을 때 자연스럽게 감속
      if (Math.abs(velX) > 0.00005 || Math.abs(velY) > 0.00005) {
        velX *= INERTIA_DECAY;
        velY *= INERTIA_DECAY;
        camX += velX;
        camY = Math.max(-0.9, Math.min(0.9, camY + velY));
      } else {
        // ② 자동 드리프트: 관성이 끝나면 천천히 공전
        velX = 0; velY = 0;
        camX += DRIFT_SPEED;
        // ③ 수직 사인 웨이브: 우주에 떠다니는 느낌
        camY = Math.sin(performance.now() / 9000) * 0.07;
      }
      scene.setUniform('u_cam', [camX, camY]);
    }

    // ④ 배경 패럴랙스: 성운이 카메라보다 20% 느리게 이동 → 원근감
    const wrap = canvasWrap();
    if (wrap) {
      // camX가 계속 커지므로 0~2π 주기로 0~100% 사이를 순환
      const cycle = ((camX * 0.15) % 1 + 1) % 1;          // 0→1 루프
      const bgX   = 20 + cycle * 60;                        // 20%~80% 범위 순환
      const bgY   = 50 + Math.sin(performance.now() / 11000) * 8; // ±8% 수직 유영
      wrap.style.backgroundPosition = `${bgX.toFixed(2)}% ${bgY.toFixed(2)}%`;
    }

    connLines.update(camX, camY, introProgress);
    updateNodeChips();
  }

  scene.render();
}

/* ── boot ───────────────────────────────────────────── */
init().catch(err => {
  console.error('Archive init failed:', err);
  document.getElementById('topbar-status').textContent = 'ERROR — ' + err.message;
});
