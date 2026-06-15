import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Scene {
  constructor(container) {
    this.container   = container;
    this.uniforms    = null;
    this.materials   = {};
    this.mesh        = null;
    this.clock       = new THREE.Clock();
    this.currentView = 'outside';
    this.gltfModels  = {};       // { living, study, bedroom }
    this.interiorMode = false;   // GLTF 렌더 중 여부
  }

  /* ── bootstrap ─────────────────────────────────── */
  async load() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x060504, 1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // 텍스처 색상 정확하게
    this.container.appendChild(this.renderer.domElement);

    /* 카메라 2개 — 외부(셰이더)용 + 실내(GLTF)용 */
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.perspCam = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
    this.camera   = this.orthoCam;

    this.scene3d = new THREE.Scene();

    /* 풀스크린 쿼드 (셰이더용) */
    const geo = new THREE.PlaneGeometry(2, 2);

    const [vert, outF, shF, enF, livF, stuF, bedF] = await Promise.all([
      this._fetch('./src/shaders/main.vert'),
      this._fetch('./src/shaders/outside.frag'),
      this._fetch('./src/shaders/shadows.frag'),
      this._fetch('./src/shaders/interior/entrance.frag'),
      this._fetch('./src/shaders/interior/living.frag'),
      this._fetch('./src/shaders/interior/study.frag'),
      this._fetch('./src/shaders/interior/bedroom.frag'),
    ]);

    const { w, h } = this._size();
    this.uniforms = {
      u_time:       { value: 0 },
      u_cam:        { value: new THREE.Vector2(0, 0) },
      u_mode:       { value: 0 },
      u_distort:    { value: 0 },
      u_intro:      { value: 0 },
      u_glow:       { value: 0 },
      u_resolution: { value: new THREE.Vector2(w, h) },
    };

    const mk = frag => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: this.uniforms,
    });

    this.materials = {
      outside:  mk(outF),
      shadows:  mk(shF),
      entrance: mk(enF),
      living:   mk(livF),
      study:    mk(stuF),
      bedroom:  mk(bedF),
    };

    this.mesh = new THREE.Mesh(geo, this.materials.outside);
    this.scene3d.add(this.mesh);

    /* 실내 조명 (처음엔 숨김) */
    this._buildInteriorLights();

    /* GLB 모델 비동기 로드 — 완료 전까지는 셰이더로 렌더 */
    this._loadGLTFModels();

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* ── GLB 로드 ──────────────────────────────────── */
  async _loadGLTFModels() {
    const loader = new GLTFLoader();
    const load   = path => new Promise((res, rej) =>
      loader.load(path, res, undefined, rej)
    );

    const targets = {
      living:  './models/livingroom.glb',
      study:   './models/studyroom.glb',
      bedroom: './models/badroom.glb',
    };

    for (const [key, path] of Object.entries(targets)) {
      try {
        const gltf  = await load(path);
        const model = gltf.scene;

        /* 자동 정규화: 방을 ±2 범위 박스에 맞추고 바닥을 y=0 으로 */
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxXZ  = Math.max(size.x, size.z);
        const scl    = 4.0 / maxXZ;

        model.scale.setScalar(scl);
        model.position.set(-center.x * scl, 0, -center.z * scl);

        /* 바닥 y=0 */
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        /* 텍스처·재질 보정 */
        model.traverse(child => {
          if (!child.isMesh) return;
          const mats = Array.isArray(child.material)
            ? child.material : [child.material];
          mats.forEach(mat => {
            mat.side = THREE.DoubleSide; // 뒷면도 렌더
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.needsUpdate = true;
            }
            if (mat.normalMap)    mat.normalMap.colorSpace    = THREE.LinearSRGBColorSpace;
            if (mat.roughnessMap) mat.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
            mat.needsUpdate = true;
          });
        });

        model.visible = false;
        this.scene3d.add(model);
        this.gltfModels[key] = model;

        /* 현재 뷰가 이미 이 방이면 즉시 표시 */
        if (this.currentView === key) {
          this._showGLTF(key);
          this._resize();
        }

        console.info(`[GLB] ${key} loaded ×${scl.toFixed(3)}`);
      } catch (e) {
        console.warn(`[GLB] ${key} 로드 실패 — 셰이더 폴백:`, e.message);
      }
    }
  }

  /* ── 실내 조명 ─────────────────────────────────── */
  _buildInteriorLights() {
    this.lightGroup = new THREE.Group();
    this.lightGroup.visible = false;
    this.scene3d.add(this.lightGroup);

    this._ambLight  = new THREE.AmbientLight(0xfff5e0, 0.5);
    this._sunLight  = new THREE.DirectionalLight(0xfff8f0, 1.2);
    this._sunLight.position.set(3, 5, -3);
    this._ceilLight = new THREE.PointLight(0xfff0e0, 1.0, 20);
    this._ceilLight.position.set(0, 2.8, 0);
    this._fillLight = new THREE.PointLight(0xffffff, 0.3, 15);
    this._fillLight.position.set(-2, 1.5, 2);

    /* 헤드보드 간접조명 — 헤드보드 뒤 벽면으로 올라가는 앰버 글로우 */
    this._headLight = new THREE.PointLight(0xff9944, 0.0, 5);
    this._headLight.position.set(0, 1.1, -1.85);   // 헤드보드 뒤 벽, 위쪽

    /* 헤드보드 왼쪽 */
    this._headLightL = new THREE.PointLight(0xff8833, 0.0, 3.5);
    this._headLightL.position.set(-0.85, 0.9, -1.8);

    /* 헤드보드 오른쪽 */
    this._headLightR = new THREE.PointLight(0xff8833, 0.0, 3.5);
    this._headLightR.position.set( 0.85, 0.9, -1.8);

    this.lightGroup.add(
      this._ambLight, this._sunLight,
      this._ceilLight, this._fillLight,
      this._headLight, this._headLightL, this._headLightR
    );
  }

  _applyRoomLighting(view) {
    const cfg = {
      living: {
        ambCol: 0xfff5e0, ambInt: 0.5,
        sunCol: 0xfff8f0, sunInt: 1.2, sunPos: [3, 5, -3],
        ceilCol: 0xfff0e0, ceilInt: 1.0,
        bgCol: 0x0a0804,
      },
      study: {
        ambCol: 0xf0f5ff, ambInt: 0.45,
        sunCol: 0xddeeff, sunInt: 1.0, sunPos: [-4, 5, 3],
        ceilCol: 0xd0e8ff, ceilInt: 1.2,
        bgCol: 0x060810,
      },
      bedroom: {
        ambCol: 0x2a1535, ambInt: 0.55,
        sunCol: 0x9090cc, sunInt: 0.6,  sunPos: [-2, 4, -2],
        ceilCol: 0x8070c0, ceilInt: 0.9,
        bgCol: 0x0d0818,
      },
    };
    const c = cfg[view];
    if (!c) return;
    this._ambLight.color.setHex(c.ambCol);
    this._ambLight.intensity  = c.ambInt;
    this._sunLight.color.setHex(c.sunCol);
    this._sunLight.intensity  = c.sunInt;
    this._sunLight.position.set(...c.sunPos);
    this._ceilLight.color.setHex(c.ceilCol);
    this._ceilLight.intensity = c.ceilInt;
    this.renderer.setClearColor(c.bgCol, 1);
  }

  /* ── GLTF 표시 전환 ────────────────────────────── */
  _showGLTF(view) {
    Object.values(this.gltfModels).forEach(m => { if (m) m.visible = false; });
    const model = this.gltfModels[view];
    if (model) {
      model.visible           = true;
      this.mesh.visible       = false;
      this.lightGroup.visible = true;
      this.camera             = this.perspCam;
      this.interiorMode       = true;
      this._applyRoomLighting(view);
    } else {
      /* GLB 미로드 → 셰이더 폴백 */
      this.mesh.visible       = true;
      this.mesh.material      = this.materials[view] || this.materials.outside;
      this.lightGroup.visible = false;
      this.camera             = this.orthoCam;
      this.interiorMode       = false;
    }
  }

  /* ── view switching ────────────────────────────── */
  setView(view) {
    this.currentView = view;

    if (view === 'outside' || view === 'entrance') {
      Object.values(this.gltfModels).forEach(m => { if (m) m.visible = false; });
      this.mesh.visible       = true;
      this.lightGroup.visible = false;
      this.camera             = this.orthoCam;
      this.interiorMode       = false;
      this.renderer.setClearColor(0x000000, 0);

      const key = (view === 'outside' && this.uniforms?.u_mode?.value === 3)
        ? 'shadows' : view;
      if (this.materials[key]) this.mesh.material = this.materials[key];

    } else {
      this._showGLTF(view);
    }

    const modeMap = { outside: 0, living: 2, study: 1, bedroom: 3 };
    this.setUniform('u_mode', modeMap[view] ?? 0);
    this._resize();
  }

  setMode(mode) {
    this.setUniform('u_mode', mode);
    if (this.currentView === 'outside') {
      this.mesh.material = mode === 3
        ? this.materials.shadows
        : this.materials.outside;
    }
  }

  /* ── 밝기 조절 (0~1) ──────────────────────────── */
  setBrightness(val) {
    if (!this.lightGroup) return;
    const t = val;
    this._ambLight.intensity  = t * 0.5;
    this._sunLight.intensity  = t * 0.6;
    this._ceilLight.intensity = t * 1.2;
    this._fillLight.intensity = t * 0.4;
  }

  /* 헤드보드 간접조명 강도 (0~1) */
  setHeadLight(val) {
    if (!this._headLight) return;
    this._headLight.intensity  = val * 1.2;
    this._headLightL.intensity = val * 0.8;
    this._headLightR.intensity = val * 0.8;
  }

  /* ── 실내 카메라 업데이트 (매 프레임) ──────────── */
  updateInteriorCamera(camX, camY) {
    if (!this.interiorMode) return;

    const az   = camX * 0.9;
    const el   = Math.max(-0.5, Math.min(0.5, camY * 0.4));
    const camR = 1.8;
    const camH = 1.2 + el * 0.7;

    this.perspCam.position.set(
      Math.sin(az) * camR,
      camH,
      -Math.cos(az) * camR
    );
    this.perspCam.lookAt(0, 0.8, 0);
  }

  /* ── uniforms ──────────────────────────────────── */
  setUniform(name, value) {
    if (!this.uniforms) return;
    const u = this.uniforms[name];
    if (!u) return;
    if (value && value.isVector2)   { u.value.copy(value); }
    else if (Array.isArray(value))  { u.value.set(...value); }
    else                            { u.value = value; }
  }

  /* ── render ────────────────────────────────────── */
  render() {
    this.uniforms.u_time.value = this.clock.getElapsedTime();
    this.renderer.render(this.scene3d, this.camera);
  }

  /* ── helpers ───────────────────────────────────── */
  async _fetch(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Shader load failed: ${url}`);
    return r.text();
  }

  _size() {
    const r = this.container.getBoundingClientRect();
    return { w: r.width || window.innerWidth, h: r.height || window.innerHeight };
  }

  _resize() {
    const { w, h } = this._size();

    if (this.interiorMode && this.perspCam) {
      /* GLTF 실내: 풀 해상도 */
      this.renderer.setSize(w, h, false);
      this.perspCam.aspect = w / h;
      this.perspCam.updateProjectionMatrix();
      if (this.uniforms) this.uniforms.u_resolution.value.set(w, h);
    } else {
      /* 셰이더 */
      const isInterior = this.currentView && this.currentView !== 'outside';
      const scale = isInterior ? 0.55 : 1.0;
      const rw    = Math.round(w * scale);
      const rh    = Math.round(h * scale);
      this.renderer.setSize(rw, rh, false);
      if (this.uniforms) this.uniforms.u_resolution.value.set(rw, rh);
    }
  }

  /* project world-space → canvas pixel (outside.frag 카메라와 동기) */
  project(wx, wy, wz, camX, camY, introProgress) {
    const { w, h } = this._size();
    const az   = camX * 0.6;
    const el   = Math.max(-0.35, Math.min(0.35, camY * 0.3));
    const dist = 2.6 + (1 - introProgress) * 3.6;
    const ht   = 0.28 + (1 - introProgress) * 0.57 + el * 0.5;

    const ro    = [Math.sin(az)*dist, ht, -Math.cos(az)*dist];
    const ta    = [0, -0.05, 0.3];
    const fwCam = norm(sub(ta, ro));
    const ri    = norm(cross(fwCam, [0,1,0]));
    const up    = cross(ri, fwCam);

    const d   = sub([wx,wy,wz], ro);
    const dfw = dot(d, fwCam);
    if (dfw <= 0) return null;

    const sx  = dot(d, ri) / dfw * 1.5;
    const sy  = dot(d, up) / dfw * 1.5;
    const asp = w / h;

    return {
      x: (sx / (2 * asp) + 0.5) * w,
      y: (1 - (sy / 2 + 0.5)) * h,
    };
  }
}

/* ── tiny vec math ──────────────────────────────── */
function sub(a, b)  { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot(a, b)  { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function norm(a) {
  const l = Math.sqrt(dot(a,a)) || 1;
  return [a[0]/l, a[1]/l, a[2]/l];
}
