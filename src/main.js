import { gsap } from 'gsap';
import { NODES, CONNECTIONS, MODULE_COLORS } from './data/nodes.js';
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

let MIRROR_MESSAGE =
`당신은 8개의 파편을 모두 보았습니다.\n\n` +
`완벽해 보이는 사람의 내부도\n` +
`흔들리고 있다는 것.\n\n` +
`그리고 당신의 시선이 가장 오래 머문 곳이\n` +
`당신 자신의 내면 지형도였습니다.`;

let SHADOWS_MIRROR_MESSAGE =
`당신은 Shadows의 네 파편을 모두 들여다보았습니다.\n\n` +
`나태함, 두려움, 미완성, 실패.\n\n` +
`이것들을 기록한다는 것은\n` +
`그것들과 함께 살아가기로 했다는 뜻입니다.`;

/* ── 실내 배경 사진 ─────────────────────────────────── */
let roomImages = { living: '', study: '', bedroom: '' };

function loadRoomImages() {
  try {
    const s = localStorage.getItem('ksb_rooms');
    if (s) roomImages = { ...roomImages, ...JSON.parse(s) };
  } catch(e) { console.warn('ksb_rooms parse error', e); }
}

function applyRoomBg(view) {
  const bg    = document.getElementById('room-bg');
  const img   = document.getElementById('room-bg-img');
  const chips = document.getElementById('chips-layer');
  const url   = roomImages[view] || '';

  if (url && view !== 'outside') {
    if (img.src !== url) img.src = url;
    bg.classList.add('visible');
    chips.classList.add('interior');
  } else {
    bg.classList.remove('visible');
    chips.classList.remove('interior');
  }
}

/* ── 관리자 콘텐츠 override ─────────────────────────── */
function applyContentOverrides() {
  try {
    const saved = localStorage.getItem('ksb_content');
    if (saved) {
      JSON.parse(saved).forEach(ov => {
        const node = NODES.find(n => n.id === ov.id);
        if (!node) return;
        if (ov.text   !== undefined) node.text   = ov.text;
        if (ov.body   !== undefined) node.body   = ov.body;
        if (ov.meta   !== undefined) node.meta   = ov.meta;
        if (ov.mirror !== undefined) node.mirror = ov.mirror;
        if (ov.images !== undefined) node.images = ov.images;
        if (ov.links  !== undefined) node.links  = ov.links;
      });
    }
  } catch(e) { console.warn('ksb_content parse error', e); }

  try {
    const s = localStorage.getItem('ksb_connections');
    if (s) {
      const newConns = JSON.parse(s);
      CONNECTIONS.splice(0, CONNECTIONS.length, ...newConns);
    }
  } catch(e) { console.warn('ksb_connections parse error', e); }

  try {
    const s = localStorage.getItem('ksb_site');
    if (s) {
      const site = JSON.parse(s);
      if (site.siteTitle) {
        const el = document.getElementById('topbar-title');
        if (el) el.textContent = site.siteTitle;
      }
      if (site.introName) {
        const el = document.getElementById('intro-name');
        if (el) el.textContent = site.introName;
      }
      if (site.introSub) {
        const el = document.getElementById('intro-sub');
        if (el) el.textContent = site.introSub;
      }
      if (site.shadowsMirror) SHADOWS_MIRROR_MESSAGE = site.shadowsMirror;
      if (site.fullMirror)    MIRROR_MESSAGE         = site.fullMirror;
    }
  } catch(e) { console.warn('ksb_site parse error', e); }
}

/* ── 로컬 폴더 동기화 콘텐츠 로드 ─────────────────── */
// 방 → 해당 모듈의 노드 ID 매핑
const LOCAL_ROOM_NODE = {
  living:  ['r1','r2','r3','r4'],
  study:   ['l1','l2','l3','l4'],
  bedroom: ['s1','s2','s3','s4'],
};

async function applyLocalContent() {
  // ── 1) JSON 파일 소스 (Node.js watch-local.js 스크립트 사용 시) ──
  let fileData = null;
  try {
    const res = await fetch('./local-content.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      // 빈 placeholder {"_comment":"..."} 는 무시
      if (j && !j._comment) fileData = j;
    }
  } catch { /* 조용히 건너뜀 */ }

  // ── 2) localStorage 소스 (sync-tool.html 사용 시) ──
  let lsData = null;
  try {
    const raw = localStorage.getItem('ksb_local_content');
    if (raw) lsData = JSON.parse(raw);
  } catch (e) { console.warn('[LocalSync] localStorage 파싱 오류', e); }

  // 둘 다 없으면 종료
  if (!fileData && !lsData) return;

  // ── 3) 두 소스 병합: 같은 방은 배열을 합산 ──
  const merged = {};
  const rooms = new Set([
    ...Object.keys(fileData  || {}),
    ...Object.keys(lsData    || {}),
  ]);

  for (const room of rooms) {
    const a = fileData?.[room];
    const b = lsData?.[room];
    if (!a && !b) continue;

    merged[room] = {
      images:    [...(a?.images  || []), ...(b?.images  || [])],
      audios:    [...(a?.audios  || []), ...(b?.audios  || [])],
      videos:    [...(a?.videos  || []), ...(b?.videos  || [])],
      docs:      [...(a?.docs    || []), ...(b?.docs    || [])],
      links:     [...(a?.links   || []), ...(b?.links   || [])],
      updatedAt: (a?.updatedAt > b?.updatedAt ? a?.updatedAt : b?.updatedAt) || null,
    };
  }

  // ── 4) 노드에 병합된 콘텐츠 적용 ──
  for (const [room, content] of Object.entries(merged)) {
    if (!content) continue;
    const nodeIds = LOCAL_ROOM_NODE[room] || [];
    if (!nodeIds.length) continue;

    const primaryNode = NODES.find(n => n.id === nodeIds[0]);
    if (!primaryNode) continue;

    // 이미지 — 첫 번째 노드 갤러리에 누적
    if (content.images.length) {
      primaryNode.images = [...(primaryNode.images || []), ...content.images];
    }

    // 오디오·비디오·문서·링크 → links 배열에 추가
    const newLinks = [];

    content.audios.forEach(a =>
      newLinks.push({ label: a.label, url: a.url, _type: 'audio' })
    );
    content.videos.forEach(v =>
      newLinks.push({ label: `▶ ${v.label}`, url: v.url, _type: 'video' })
    );
    content.docs.forEach(d =>
      newLinks.push({ label: `📄 ${d.label}`, url: d.url, _type: 'doc' })
    );
    content.links.forEach(l =>
      newLinks.push({ label: l.label, url: l.url })
    );

    if (newLinks.length) {
      primaryNode.links = [...(primaryNode.links || []), ...newLinks];
    }
  }

  // ── 5) 동기화 시각 콘솔 표시 ──
  const latest = Object.values(merged)
    .filter(Boolean)
    .map(c => c.updatedAt)
    .filter(Boolean)
    .sort()
    .pop();
  if (latest) {
    const d = new Date(latest);
    console.info(`[LocalSync] ${d.toLocaleString()} 기준 콘텐츠 로드됨`);
  } else {
    console.info('[LocalSync] 콘텐츠 로드됨');
  }
}

/* ── 설정 마법사 테마 적용 ─────────────────────────── */
function applySetupTheme() {
  // 첫 방문이면 setup으로 리디렉션
  if (!localStorage.getItem('ksb_setup_done')) {
    window.location.href = './setup.html';
    return false;
  }
  // 색상 테마 적용
  try {
    const t = JSON.parse(localStorage.getItem('ksb_theme') || '{}');
    const r = document.documentElement.style;
    if (t.logic)   r.setProperty('--logic',   t.logic);
    if (t.rest)    r.setProperty('--rest',    t.rest);
    if (t.shadows) r.setProperty('--shadows', t.shadows);
  } catch(e) {}
  return true;
}

/* ── init ──────────────────────────────────────────── */
async function init() {
  if (!applySetupTheme()) return;   // 설정 미완료 시 중단
  loadRoomImages();
  applyContentOverrides();
  await applyLocalContent();    // 로컬 폴더 동기화 콘텐츠 적용
  // Scene
  scene = new Scene(document.getElementById('canvas-wrap'));
  await scene.load();
  window._scene = scene; // 디버그용

  // Modules
  dataMap    = new DataMap(onNodeClick);
  panel      = new Panel(onRelClick, () => editMode, onContentSave,
                         () => CONNECTIONS, onConnectionSave);
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

  // 편집 모드 토글 — 암호 확인 후 진입
  document.getElementById('edit-toggle').addEventListener('click', () => {
    if (editMode) {
      // 편집 종료는 즉시
      _exitEditMode();
    } else {
      _openEditAuth();
    }
  });

  // 편집 암호 모달 이벤트
  const authInput   = document.getElementById('edit-auth-input');
  const authBackdrop = document.getElementById('edit-auth-backdrop');
  const confirmEdit = () => {
    const pw = localStorage.getItem('ksb_pw') || 'archive';
    if (authInput.value === pw) {
      authBackdrop.classList.remove('open');
      authInput.value = '';
      document.getElementById('edit-auth-err').textContent = '';
      _enterEditMode();
    } else {
      document.getElementById('edit-auth-err').textContent = '비밀번호가 틀렸습니다.';
      authInput.value = '';
      authInput.focus();
    }
  };
  document.getElementById('edit-auth-confirm').addEventListener('click', confirmEdit);
  document.getElementById('edit-auth-cancel').addEventListener('click', () => {
    authBackdrop.classList.remove('open');
    authInput.value = '';
    document.getElementById('edit-auth-err').textContent = '';
  });
  authInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmEdit(); });

  // 침실 밝기 슬라이더 (초기값 적용)
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessVal    = document.getElementById('brightness-val');
  scene.setBrightness(brightnessSlider.value / 100);
  brightnessSlider.addEventListener('input', () => {
    const v = brightnessSlider.value;
    brightnessVal.textContent = v + '%';
    scene.setBrightness(v / 100);
  });

  const headlightSlider = document.getElementById('headlight-slider');
  const headlightVal    = document.getElementById('headlight-val');
  headlightSlider.addEventListener('input', () => {
    const v = headlightSlider.value;
    headlightVal.textContent = v + '%';
    scene.setHeadLight(v / 100);
  });

  // Camera drag
  setupDrag();

  // Intro sequence + 랜덤 자동재생 (첫 클릭 시)
  startIntro();
  window.addEventListener('click', _autoPlayOnce, { once: true });

  // Render loop
  animate();
}

/* ── 패널 → 공간 이동 (전역 노출) ──────────────────── */
window.gotoSpace = function (mod) {
  const viewMap = { logic: 'study', rest: 'living', shadows: 'bedroom' };
  const v = viewMap[mod];
  if (v) setView(v);
};

/* ── 편집 모드 진입/종료 ─────────────────────────────── */
function _enterEditMode() {
  editMode = true;
  const btn = document.getElementById('edit-toggle');
  btn.classList.add('active');
  btn.textContent = '편집 종료';
  if (panel.currentId) panel.show(panel.currentId);
}
function _exitEditMode() {
  editMode = false;
  const btn = document.getElementById('edit-toggle');
  btn.classList.remove('active');
  btn.textContent = '편집';
  if (panel.currentId) panel.show(panel.currentId);
}
function _openEditAuth() {
  const backdrop = document.getElementById('edit-auth-backdrop');
  backdrop.classList.add('open');
  setTimeout(() => document.getElementById('edit-auth-input').focus(), 100);
}

/* ── 랜덤 자동재생 ──────────────────────────────────── */
let _autoPlayDone = false;
function _autoPlayOnce() {
  if (_autoPlayDone) return;
  _autoPlayDone = true;
  const ytRe = /youtu\.be\/|youtube\.com/;
  const all = [];
  NODES.forEach(n => (n.links || []).forEach(l => {
    if (ytRe.test(l.url)) all.push({ url: l.url, label: l.label || n.text, nodeText: n.text });
  }));
  if (!all.length) return;
  const pick = all[Math.floor(Math.random() * all.length)];
  setTimeout(() => {
    if (typeof window.playMusic === 'function') window.playMusic(pick.url, pick.label, pick.nodeText);
  }, 600);
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

/* ── 방별 카메라 프리셋 ─────────────────────────────────
   look-around 기준: az = camX * 0.9
   az=0 → 입구(+z) / az=π → 헤드보드(−z)
   camX = az / 0.9
     π/0.9 ≈ 3.49  (뒷벽 1소점)
     π/2/0.9 ≈ 1.75 (오른쪽 1소점)   −1.75 (왼쪽 1소점)
     3π/4/0.9 ≈ 2.62 (오른쪽-뒤 2소점) −2.62 (왼쪽-뒤 2소점)
──────────────────────────────────────────────────────── */
const ROOM_CAM_PRESETS = {
  // ── 거실 (living) ──
  r1: { camX:  3.49, camY:  0.00 },  // 뒷벽·소파 1소점
  r2: { camX:  1.75, camY:  0.00 },  // 오른쪽 창문 1소점
  r3: { camX:  0.00, camY:  1.20 },  // 바닥·러그 내려다봄
  r4: { camX: -1.75, camY:  0.10 },  // 왼쪽 소재벽 1소점
  // ── 서재 (study) ──
  l1: { camX: -1.75, camY:  0.00 },  // 서가 1소점
  l2: { camX:  3.49, camY:  0.50 },  // 책상 내려다봄 (뒷벽 + 하향)
  l3: { camX:  2.62, camY:  0.00 },  // 오른쪽-뒤 코너 2소점
  l4: { camX:  0.87, camY:  0.10 },  // 앞-오른쪽 코너 2소점
  // ── 침실 (bedroom) ──
  s1: { camX:  3.49, camY:  0.60 },  // 침대·헤드보드 내려다봄 (1소점)
  s2: { camX: -2.62, camY:  0.10 },  // 왼쪽-뒤 코너 2소점 (나이트스탠드)
  s3: { camX:  2.62, camY:  0.10 },  // 오른쪽-뒤 코너 2소점 (나이트스탠드)
  s4: { camX:  3.49, camY: -0.30 },  // 헤드보드 올려다봄 1소점
};

// 카메라 프리셋 애니메이션 (가장 짧은 경로로 회전)
let _camTween = null;
function animateCamToPreset(preset) {
  if (_camTween) _camTween.kill();

  // camX는 누적되므로 ±한바퀴(2π/0.9) 안에서 가장 가까운 경로 계산
  const period = (2 * Math.PI) / 0.9;
  let targetX  = preset.camX;
  let diff = targetX - camX;
  diff = diff - Math.round(diff / period) * period;
  targetX = camX + diff;

  const obj = { x: camX, y: camY };
  _camTween = gsap.to(obj, {
    x: targetX,
    y: preset.camY,
    duration: 1.4,
    ease: 'power3.inOut',
    onUpdate() {
      camX = obj.x;
      camY = obj.y;
      velX = 0; velY = 0;           // 관성 초기화
      scene.setUniform('u_cam', [camX, camY]);
    },
  });
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
  applyRoomBg(view);

  // 침실일 때만 밝기 슬라이더 표시
  const bCtrl = document.getElementById('brightness-ctrl');
  if (bCtrl) bCtrl.classList.toggle('visible', view === 'bedroom');

  const labels = {
    outside: 'EXPLORE',
    living: '거실 — REST', study: '서재 — LOGIC', bedroom: '침실 — SHADOWS',
  };
  document.getElementById('topbar-status').textContent = labels[view] ?? '';
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

  const node = NODES.find(n => n.id === nodeId);

  // 노드 모듈 → 해당 방으로 자동 이동 + 카메라 프리셋
  const viewMap = { logic: 'study', rest: 'living', shadows: 'bedroom' };
  const targetView = node ? viewMap[node.mod] : null;
  if (targetView) {
    if (currentView !== targetView) {
      setView(targetView);
      if (ROOM_CAM_PRESETS[nodeId]) {
        setTimeout(() => animateCamToPreset(ROOM_CAM_PRESETS[nodeId]), 120);
      }
    } else if (ROOM_CAM_PRESETS[nodeId]) {
      animateCamToPreset(ROOM_CAM_PRESETS[nodeId]);
    }
  }
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

  // 거실+서재(logic·rest) 노드 방문 추적
  if (node?.mod === 'logic' || node?.mod === 'rest') _mainVisited.add(nodeId);

  // 침실(shadows) 노드 방문 추적
  if (node?.mod === 'shadows') _shadowsVisited.add(nodeId);

  // 거실+서재 8개 완료 → 메인 거울
  if (_mainVisited.size >= 8 && !_mirrorShown) {
    _mirrorShown = true;
    setTimeout(() => panel.showMirror(MIRROR_MESSAGE), 2000);
  }

  // 침실 4개 완료 → Shadows 거울
  if (_shadowsVisited.size >= 4 && !_shadowsMirrorShown) {
    _shadowsMirrorShown = true;
    setTimeout(() => panel.showMirror(SHADOWS_MIRROR_MESSAGE), 800);
  }
}

let _mirrorShown = false;
let _shadowsMirrorShown = false;
const _mainVisited    = new Set();
const _shadowsVisited = new Set();

/* ── 편집 모드 ──────────────────────────────────────── */
let editMode = false;

function onContentSave(nodeId, changes) {
  // NODES 배열 직접 업데이트
  const node = NODES.find(n => n.id === nodeId);
  if (!node) return;
  Object.assign(node, changes);

  // localStorage에 저장
  const content = NODES.map(n => ({
    id:     n.id,
    text:   n.text,
    body:   n.body,
    meta:   { ...n.meta },
    mirror: n.mirror,
    images: n.images || [],
    links:  n.links  || [],
  }));
  localStorage.setItem('ksb_content', JSON.stringify(content));

  // 좌측 목록 텍스트 업데이트
  document.querySelectorAll(`.node-item[data-id="${nodeId}"] .node-text`)
    .forEach(el => { el.textContent = changes.text; });

  // 외부뷰 칩 텍스트 업데이트
  document.querySelectorAll(`.node-chip[data-id="${nodeId}"]`)
    .forEach(el => { el.textContent = changes.text; });

  // 패널을 뷰 모드로 다시 렌더
  panel.show(nodeId);

  // 저장 완료 표시 (topbar status 잠깐 변경)
  const status = document.getElementById('topbar-status');
  const prev = status.textContent;
  status.textContent = '저장됨 ✓';
  setTimeout(() => { status.textContent = prev; }, 1800);
}

function onRelClick(nodeId) { onNodeClick(nodeId); }

function onDwell(nodeId) {
  // 패널 열기
  onNodeClick(nodeId);
  // 해당 공간으로 이동
  const node = NODES.find(n => n.id === nodeId);
  if (node) {
    const viewMap = { logic: 'study', rest: 'living', shadows: 'bedroom' };
    const v = viewMap[node.mod];
    if (v) setView(v);
  }
}

/* ── 연결선 저장 ─────────────────────────────────────── */
function onConnectionSave(nodeId, connectedIds) {
  // 이 노드 관련 기존 연결 모두 제거 후 새로 추가
  const filtered = CONNECTIONS.filter(([a, b]) => a !== nodeId && b !== nodeId);
  connectedIds.forEach(otherId => filtered.push([nodeId, otherId]));
  CONNECTIONS.splice(0, CONNECTIONS.length, ...filtered);

  // localStorage 저장
  localStorage.setItem('ksb_connections', JSON.stringify(CONNECTIONS));

  // SVG 연결선 즉시 재구성
  connLines.rebuild();

  // 저장 알림
  const status = document.getElementById('topbar-status');
  const prev = status.textContent;
  status.textContent = '연결선 저장됨 ✓';
  setTimeout(() => { status.textContent = prev; }, 1800);
}

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
  } else {
    /* 실내 GLTF 뷰: Three.js 퍼스펙티브 카메라 업데이트 */
    scene.updateInteriorCamera(camX, camY);
  }

  scene.render();
}

/* ── boot ───────────────────────────────────────────── */
init().catch(err => {
  console.error('Archive init failed:', err);
  document.getElementById('topbar-status').textContent = 'ERROR — ' + err.message;
});
