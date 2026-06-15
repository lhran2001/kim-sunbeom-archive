import { NODES, MODULE_COLORS, MODULE_LABELS } from '../data/nodes.js';

export class Panel {
  constructor(onRelClick, getEditMode, onSave, getConnections, onConnectionSave) {
    this.onRelClick        = onRelClick;
    this.getEditMode       = getEditMode       || (() => false);
    this.onSave            = onSave            || (() => {});
    this.getConnections    = getConnections    || (() => []);
    this.onConnectionSave  = onConnectionSave  || (() => {});
    this.currentId         = null;
    this._editConnIds      = new Set();  // 편집 중 연결 목록

    this._panel   = document.getElementById('right-panel');
    this._content = document.getElementById('panel-content');
    this._saveBtn = document.getElementById('panel-save-btn');

    document.getElementById('panel-close')
      .addEventListener('click', () => this.hide());
    document.getElementById('mirror-close')
      .addEventListener('click', () => this._hideMirror());
  }

  show(id) {
    const node = NODES.find(n => n.id === id);
    if (!node) return;
    this.currentId = id;

    if (this.getEditMode()) {
      this._renderEdit(node);
      this._saveBtn.style.display = 'block';
    } else {
      this._renderView(node);
      this._saveBtn.style.display = 'none';
    }

    this._panel.classList.remove('hidden');
  }

  hide() {
    this._panel.classList.add('hidden');
    this.currentId = null;
  }

  /* ── 뷰 모드 ────────────────────────────────────── */
  _renderView(node) {
    const c = MODULE_COLORS[node.mod];

    // 이미지 갤러리
    const images = node.images || [];
    const galleryHTML = images.length
      ? `<div class="panel-gallery">${
          images.map((url, i) =>
            `<img class="panel-gallery-img" src="${_esc(url)}" loading="lazy"
                  data-idx="${i}"
                  style="cursor:zoom-in" />`
          ).join('')
        }</div>`
      : '';

    // 링크
    const links = node.links || [];
    const isYt    = url => /youtu\.be\/|youtube\.com/.test(url);
    const isAudio = url => /^data:audio/.test(url) || /\.(mp3|wav|ogg|flac|m4a|aac)(\?|$)/i.test(url);
    const linksHTML = links.length
      ? `<div class="panel-links">${
          links.map((l, i) => {
            const yt    = isYt(l.url);
            const audio = !yt && isAudio(l.url);
            const playable = yt || audio;
            const arrow = yt ? '▶' : audio ? '♪' : '↗';
            return `<div class="panel-link-row">
              <button class="panel-link" data-link-idx="${i}"
                data-link-url="${_esc(l.url)}" data-link-yt="${yt ? '1' : '0'}">
                <span class="panel-link-arrow">${arrow}</span>${_esc(l.label)}
              </button>
              ${playable ? `<button class="panel-link-music"
                data-music-url="${_esc(l.url)}"
                data-music-label="${_esc(l.label)}"
                data-node-text="${_esc(node.text)}"
                title="배경 음악으로 재생">♫</button>` : ''}
            </div>`;
          }).join('')
        }</div>`
      : '';

    // 메타
    const metaHTML = Object.entries(node.meta || {}).map(([k, v]) =>
      `<div class="meta-row"><span class="meta-key">${k}</span><span>${v}</span></div>`
    ).join('');

    // 연결된 개념
    let relHTML = '';
    if (node.rel && node.rel.length) {
      relHTML = `<div class="rel-label">연결된 개념</div>` +
        node.rel.map(relText => {
          const target = NODES.find(n => n.text === relText);
          const col = target ? MODULE_COLORS[target.mod].hex : 'inherit';
          return `<div class="rel-item" data-rel-id="${target?.id || ''}" style="color:${col}">
                    <span class="rel-arrow">→</span>${_esc(relText)}
                  </div>`;
        }).join('');
    }

    this._content.innerHTML = `
      <div id="panel-mod"
           style="color:${c.hex};cursor:pointer;display:flex;align-items:center;gap:6px"
           data-mod="${node.mod}"
           title="해당 공간으로 이동">
        ${MODULE_LABELS[node.mod]}
        <span style="font-size:9px;opacity:0.45;letter-spacing:0.08em">→ 공간 보기</span>
      </div>
      <div id="panel-title" style="border-left:2px solid ${c.hex};padding-left:8px">${_esc(node.text)}</div>
      <div id="panel-body">${_esc(node.body)}</div>
      ${galleryHTML}
      ${linksHTML}
      <div id="panel-meta">${metaHTML}</div>
      <div id="panel-rel-wrap">${relHTML}</div>
      <div id="panel-divider"></div>
      <div id="panel-mirror">${_esc(node.mirror || '')}</div>
    `;

    // 모듈 라벨 → 공간 이동
    const modEl = this._content.querySelector('#panel-mod[data-mod]');
    if (modEl) {
      modEl.addEventListener('click', () => {
        if (typeof window.gotoSpace === 'function') window.gotoSpace(modEl.dataset.mod);
      });
      modEl.addEventListener('mouseenter', () => { modEl.querySelector('span').style.opacity = '0.85'; });
      modEl.addEventListener('mouseleave', () => { modEl.querySelector('span').style.opacity = '0.45'; });
    }

    // 이미지 → 미디어 뷰어
    if (images.length) {
      this._content.querySelectorAll('.panel-gallery-img').forEach(img => {
        img.addEventListener('click', () => {
          if (typeof window.openMedia === 'function') {
            window.openMedia(images, parseInt(img.dataset.idx, 10));
          }
        });
      });
    }

    // 링크 → YouTube는 뷰어, 로컬 오디오는 바로 재생, 일반은 웹 미리보기
    const _isAudioUrl = url =>
      /^data:audio/.test(url) || /\.(mp3|wav|ogg|flac|m4a|aac)(\?|$)/i.test(url);

    this._content.querySelectorAll('.panel-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.linkUrl;
        if (btn.dataset.linkYt === '1' && typeof window.openYoutube === 'function') {
          window.openYoutube(url);
        } else if (_isAudioUrl(url) && typeof window.playMusic === 'function') {
          // 로컬 오디오: 미니 플레이어로 바로 재생
          const label = btn.querySelector('.panel-link-arrow')?.nextSibling?.textContent?.trim()
                        || btn.textContent.trim();
          window.playMusic(url, label, null);
        } else if (typeof window.openWebPreview === 'function') {
          window.openWebPreview(url);
        } else {
          window.open(url, '_blank', 'noopener');
        }
      });
    });

    // ♫ → 배경 음악 재생 (노드 이름을 미니 플레이어에 표시)
    this._content.querySelectorAll('.panel-link-music').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.playMusic === 'function') {
          window.playMusic(btn.dataset.musicUrl, btn.dataset.musicLabel, btn.dataset.nodeText);
        }
      });
    });

    // 연결 개념 클릭
    this._content.querySelectorAll('.rel-item[data-rel-id]').forEach(el => {
      if (el.dataset.relId) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => this.onRelClick(el.dataset.relId));
      }
    });
  }

  /* ── 편집 모드 ──────────────────────────────────── */
  _renderEdit(node) {
    const c = MODULE_COLORS[node.mod];

    // 현재 이 노드의 연결 집합 초기화
    const allConns = this.getConnections();
    this._editConnIds = new Set();
    allConns.forEach(([a, b]) => {
      if (a === node.id) this._editConnIds.add(b);
      if (b === node.id) this._editConnIds.add(a);
    });

    const imgsHTML = (node.images || []).map(url =>
      `<div class="edit-img-row">
        <input class="edit-input edit-img-input" value="${_esc(url)}" placeholder="https://..." />
        <button class="edit-img-del" type="button">삭제</button>
      </div>`
    ).join('');

    const linksHTML = (node.links || []).map(l =>
      `<div class="edit-link-row">
        <input class="edit-input ef-link-label" value="${_esc(l.label)}" placeholder="링크 이름" />
        <input class="edit-input ef-link-url" value="${_esc(l.url)}" placeholder="https://..." />
        <button class="edit-img-del" type="button">삭제</button>
      </div>`
    ).join('');

    // 연결 가능한 다른 노드 드롭다운
    const otherOpts = NODES.filter(n => n.id !== node.id)
      .map(n => `<option value="${n.id}">${n.text}</option>`).join('');

    this._content.innerHTML = `
      <div style="font-size:8px;letter-spacing:0.28em;color:${c.hex};
                  text-transform:uppercase;margin-bottom:14px">
        ${MODULE_LABELS[node.mod]}
      </div>

      <div class="edit-field">
        <label class="edit-label">제목</label>
        <input class="edit-input" id="ef-text" value="${_esc(node.text)}" />
      </div>

      <div class="edit-field">
        <label class="edit-label">본문</label>
        <textarea class="edit-textarea" id="ef-body" rows="4">${_esc(node.body)}</textarea>
      </div>

      <div class="edit-field">
        <label class="edit-label">메타</label>
        <div class="edit-meta-grid">
          <input class="edit-input" id="ef-분류" value="${_esc(node.meta?.분류 || '')}" placeholder="분류" />
          <input class="edit-input" id="ef-갱신" value="${_esc(node.meta?.갱신 || '')}" placeholder="갱신" />
        </div>
      </div>

      <div class="edit-field">
        <label class="edit-label">이미지 <span style="opacity:0.4;font-size:8px">공개 URL 붙여넣기</span></label>
        <div id="ef-img-list">${imgsHTML}</div>
        <button class="edit-add-btn" id="ef-add-img" type="button">+ 이미지 추가</button>
      </div>

      <div class="edit-field">
        <label class="edit-label">링크 <span style="opacity:0.4;font-size:8px">이름 + URL</span></label>
        <div id="ef-link-list">${linksHTML}</div>
        <button class="edit-add-btn" id="ef-add-link" type="button">+ 링크 추가</button>
      </div>

      <hr class="edit-divider" />

      <div class="edit-field">
        <label class="edit-label">연결된 노드 <span style="opacity:0.4;font-size:8px">연결선 편집</span></label>
        <div id="ef-conn-list"></div>
        <div class="edit-conn-add">
          <select id="ef-conn-select" class="edit-input">${otherOpts}</select>
          <button class="edit-add-btn" id="ef-add-conn" type="button">+ 연결</button>
        </div>
      </div>

      <hr class="edit-divider" />

      <div class="edit-field">
        <label class="edit-label">거울 문구</label>
        <textarea class="edit-textarea" id="ef-mirror" rows="3">${_esc(node.mirror || '')}</textarea>
      </div>
    `;

    // ── 연결선 렌더링 (동적) ──
    const renderConnList = () => {
      const list = document.getElementById('ef-conn-list');
      if (!list) return;
      if (this._editConnIds.size === 0) {
        list.innerHTML = `<div style="font-size:9px;color:rgba(255,255,255,0.2);padding:4px 0">연결 없음</div>`;
        return;
      }
      list.innerHTML = [...this._editConnIds].map(id => {
        const other = NODES.find(n => n.id === id);
        if (!other) return '';
        const col = MODULE_COLORS[other.mod].hex;
        return `<div class="edit-conn-row" data-conn-id="${id}">
          <span class="edit-conn-dot" style="background:${col}"></span>
          <span class="edit-conn-text">${_esc(other.text)}</span>
          <button class="edit-img-del edit-conn-del" type="button">삭제</button>
        </div>`;
      }).join('');
      list.querySelectorAll('.edit-conn-del').forEach(btn => {
        btn.addEventListener('click', () => {
          this._editConnIds.delete(btn.closest('[data-conn-id]').dataset.connId);
          renderConnList();
        });
      });
    };
    renderConnList();

    document.getElementById('ef-add-conn').addEventListener('click', () => {
      const sel = document.getElementById('ef-conn-select');
      if (sel && sel.value) {
        this._editConnIds.add(sel.value);
        renderConnList();
      }
    });

    // 이미지 추가/삭제
    const addImg = () => {
      const row = document.createElement('div');
      row.className = 'edit-img-row';
      row.innerHTML = `<input class="edit-input edit-img-input" placeholder="https://..." />
                       <button class="edit-img-del" type="button">삭제</button>`;
      row.querySelector('.edit-img-del').addEventListener('click', () => row.remove());
      document.getElementById('ef-img-list').appendChild(row);
    };
    this._content.querySelector('#ef-add-img').addEventListener('click', addImg);
    this._content.querySelectorAll('#ef-img-list .edit-img-del').forEach(btn =>
      btn.addEventListener('click', () => btn.closest('.edit-img-row').remove())
    );

    // 링크 추가/삭제
    const addLink = () => {
      const row = document.createElement('div');
      row.className = 'edit-link-row';
      row.innerHTML = `<input class="edit-input ef-link-label" placeholder="링크 이름" />
                       <input class="edit-input ef-link-url" placeholder="https://..." />
                       <button class="edit-img-del" type="button">삭제</button>`;
      row.querySelector('.edit-img-del').addEventListener('click', () => row.remove());
      document.getElementById('ef-link-list').appendChild(row);
    };
    this._content.querySelector('#ef-add-link').addEventListener('click', addLink);
    this._content.querySelectorAll('#ef-link-list .edit-img-del').forEach(btn =>
      btn.addEventListener('click', () => btn.closest('.edit-link-row').remove())
    );

    // 저장 버튼
    this._saveBtn.onclick = () => this._collectAndSave(node.id);
  }

  _collectAndSave(nodeId) {
    const changes = {
      text:   document.getElementById('ef-text')?.value.trim()   || '',
      body:   document.getElementById('ef-body')?.value.trim()   || '',
      meta: {
        분류: document.getElementById('ef-분류')?.value.trim() || '',
        갱신: document.getElementById('ef-갱신')?.value.trim() || '',
      },
      mirror: document.getElementById('ef-mirror')?.value.trim() || '',
      images: Array.from(document.querySelectorAll('.edit-img-input'))
                .map(i => i.value.trim()).filter(Boolean),
      links:  Array.from(document.querySelectorAll('.edit-link-row')).map(row => ({
                label: row.querySelector('.ef-link-label')?.value.trim() || '',
                url:   row.querySelector('.ef-link-url')?.value.trim()   || '',
              })).filter(l => l.label || l.url),
    };
    this.onSave(nodeId, changes);
    // 연결선 저장
    this.onConnectionSave(nodeId, [...this._editConnIds]);
  }

  /* ── 거울 오버레이 ──────────────────────────────── */
  showMirror(text) {
    document.getElementById('mirror-text').textContent = text;
    document.getElementById('mirror-overlay').classList.add('active');
    if (typeof window.startMirrorSparkle === 'function') window.startMirrorSparkle();
  }

  _hideMirror() {
    document.getElementById('mirror-overlay').classList.remove('active');
    if (typeof window.stopMirrorSparkle === 'function') window.stopMirrorSparkle();
  }
}

function _esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
