/**
 * Kim Sunbeom Archive — 로컬 폴더 동기화 스크립트
 *
 * 실행: node scripts/watch-local.js
 *
 * sync-config.json 에서 폴더 경로를 설정한 뒤 실행하면
 * 파일 변경을 감지하여 public/local-content.json 을 자동 갱신합니다.
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  거실  (living)  → 음악, 공유 이미지, 링크 파일     │
 * │  서재  (study)   → 포트폴리오 이미지, PDF           │
 * │  침실  (bedroom) → 개인 사진, 메모                  │
 * └─────────────────────────────────────────────────────┘
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── 설정 로드 ─────────────────────────────────────── */
const CONFIG_PATH  = path.join(__dirname, '..', 'sync-config.json');
const OUT_JSON     = path.join(__dirname, '..', 'public', 'local-content.json');
const ASSETS_ROOT  = path.join(__dirname, '..', 'public', 'local-assets');

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch(e) {
  console.error('❌ sync-config.json 을 읽을 수 없습니다:', e.message);
  process.exit(1);
}

const FOLDERS   = cfg.folders   || {};
const OPTS      = cfg.options   || {};
const INTERVAL  = (OPTS.watchIntervalSec || 5) * 1000;
const MAX_IMG   = OPTS.maxImagesPerFolder || 30;
const MAX_MB    = OPTS.maxFileSizeMB      || 50;

/* ── 지원 확장자 ───────────────────────────────────── */
const EXT = {
  image: ['.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp'],
  audio: ['.mp3','.wav','.ogg','.flac','.m4a','.aac'],
  video: ['.mp4','.webm','.mov'],
  doc  : ['.pdf'],
  link : ['.txt','.json'],   // YouTube URL / 링크 목록 파일
};

function extOf(f){ return path.extname(f).toLowerCase(); }
function typeOf(f){
  const e = extOf(f);
  for(const [t,exts] of Object.entries(EXT)) if(exts.includes(e)) return t;
  return null;
}

/* ── 파일 크기 체크 ────────────────────────────────── */
function withinSize(filePath){
  try{
    return fs.statSync(filePath).size <= MAX_MB * 1024 * 1024;
  }catch{ return false; }
}

/* ── 폴더 재귀 스캔 ────────────────────────────────── */
function scanDir(dir, results = []){
  let entries;
  try{ entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch{ return results; }

  for(const e of entries){
    const full = path.join(dir, e.name);
    if(e.isDirectory()){
      scanDir(full, results);
    } else if(e.isFile()){
      const t = typeOf(e.name);
      if(t && withinSize(full)) results.push({ full, name: e.name, type: t });
    }
  }
  return results;
}

/* ── 링크 파일 파싱 (.txt, .json) ─────────────────── */
function parseLinks(filePath){
  const ext = extOf(filePath);
  try{
    const raw = fs.readFileSync(filePath, 'utf8');
    if(ext === '.json'){
      const data = JSON.parse(raw);
      if(Array.isArray(data)) return data.map(l =>
        typeof l === 'string' ? { label: path.basename(filePath,ext), url: l }
                              : { label: l.label||l.title||'링크', url: l.url||l.href||'' }
      );
    }
    // .txt: 한 줄에 URL (선택적으로 "제목 | URL" 형식)
    return raw.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const [a, b] = line.split('|').map(s=>s.trim());
        return b ? { label: a, url: b } : { label: path.basename(filePath,ext), url: a };
      });
  }catch(e){
    console.warn('  링크 파일 파싱 오류:', filePath, e.message);
    return [];
  }
}

/* ── 파일 → public 복사 ────────────────────────────── */
function copyAsset(srcPath, room){
  const destDir = path.join(ASSETS_ROOT, room);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(srcPath));
  try{
    fs.copyFileSync(srcPath, dest);
    return `/local-assets/${room}/${path.basename(srcPath)}`;
  }catch(e){
    console.warn('  복사 실패:', srcPath, e.message);
    return null;
  }
}

/* ── 방별 콘텐츠 빌드 ──────────────────────────────── */
function buildRoom(room, folderPath){
  if(!folderPath || !fs.existsSync(folderPath)){
    console.warn(`⚠️  [${room}] 폴더 없음: "${folderPath}"`);
    return null;
  }

  const files = scanDir(folderPath);
  const images = [], audios = [], videos = [], docs = [], links = [];

  for(const f of files){
    switch(f.type){
      case 'image': {
        if(images.length >= MAX_IMG) break;
        const url = copyAsset(f.full, room);
        if(url) images.push(url);
        break;
      }
      case 'audio': {
        const url = copyAsset(f.full, room);
        if(url) audios.push({ label: path.basename(f.name, extOf(f.name)), url });
        break;
      }
      case 'video': {
        const url = copyAsset(f.full, room);
        if(url) videos.push({ label: path.basename(f.name, extOf(f.name)), url });
        break;
      }
      case 'doc': {
        const url = copyAsset(f.full, room);
        if(url) docs.push({ label: path.basename(f.name, extOf(f.name)), url });
        break;
      }
      case 'link': {
        links.push(...parseLinks(f.full));
        break;
      }
    }
  }

  console.log(`  [${room}] 이미지 ${images.length}개, 오디오 ${audios.length}개, ` +
              `문서 ${docs.length}개, 링크 ${links.length}개`);
  return { images, audios, videos, docs, links, updatedAt: new Date().toISOString() };
}

/* ── 전체 스캔 & JSON 출력 ─────────────────────────── */
function runSync(){
  console.log(`\n🔄 동기화 중… [${new Date().toLocaleTimeString()}]`);
  fs.mkdirSync(path.join(__dirname,'..','public'), { recursive: true });

  const output = {};
  for(const [room, folder] of Object.entries(FOLDERS)){
    if(!folder) continue;
    output[room] = buildRoom(room, folder);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ public/local-content.json 업데이트 완료`);
}

/* ── 실행 + 변경 감시 ──────────────────────────────── */
runSync();  // 최초 1회 즉시 실행

// 각 폴더 변경 감시
const activeFolders = Object.values(FOLDERS).filter(f => f && fs.existsSync(f));

if(activeFolders.length === 0){
  console.log('\n⚠️  감시할 폴더가 없습니다.');
  console.log('   sync-config.json 에서 폴더 경로를 설정하세요.\n');
  process.exit(0);
}

console.log(`\n👀 ${INTERVAL/1000}초마다 변경 감지 중...`);
console.log('   종료: Ctrl+C\n');

// 폴더 해시로 변경 감지 (fs.watch 대신 폴링 — Windows 호환)
const prevHash = {};

function folderHash(folder){
  const files = scanDir(folder);
  return files.map(f => {
    try{
      const s = fs.statSync(f.full);
      return `${f.full}:${s.size}:${s.mtimeMs}`;
    }catch{ return f.full; }
  }).join('|');
}

setInterval(() => {
  let changed = false;
  for(const [room, folder] of Object.entries(FOLDERS)){
    if(!folder || !fs.existsSync(folder)) continue;
    const h = folderHash(folder);
    if(h !== prevHash[room]){
      prevHash[room] = h;
      changed = true;
      console.log(`📂 변경 감지: [${room}] ${folder}`);
    }
  }
  if(changed) runSync();
}, INTERVAL);

// 초기 해시 저장
for(const [room, folder] of Object.entries(FOLDERS)){
  if(folder && fs.existsSync(folder)) prevHash[room] = folderHash(folder);
}
