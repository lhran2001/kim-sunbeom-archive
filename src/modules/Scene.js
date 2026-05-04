import * as THREE from 'three';

export class Scene {
  constructor(container) {
    this.container = container;
    this.uniforms  = null;
    this.materials = {};
    this.mesh      = null;
    this.clock     = new THREE.Clock();
    this.currentView = 'outside';
  }

  /* ── bootstrap ─────────────────────────────────── */
  async load() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // 투명 배경
    this.container.appendChild(this.renderer.domElement);

    this.camera  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene3d = new THREE.Scene();

    // full-screen quad (vertex shader ignores camera transforms)
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

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* ── view switching ────────────────────────────── */
  setView(view) {
    this.currentView = view;
    const key = (view === 'outside' && this.uniforms.u_mode.value === 3)
      ? 'shadows' : view;
    if (this.materials[key]) this.mesh.material = this.materials[key];

    const modeMap = { outside:0, living:2, study:1, bedroom:3 };
    this.setUniform('u_mode', modeMap[view] ?? 0);
  }

  setMode(mode) {
    this.setUniform('u_mode', mode);
    if (this.currentView === 'outside') {
      this.mesh.material = mode === 3
        ? this.materials.shadows
        : this.materials.outside;
    }
  }

  /* ── uniforms ──────────────────────────────────── */
  setUniform(name, value) {
    if (!this.uniforms) return;
    const u = this.uniforms[name];
    if (!u) return;
    if (value && value.isVector2) { u.value.copy(value); }
    else if (Array.isArray(value)) { u.value.set(...value); }
    else { u.value = value; }
  }

  /* ── render loop ───────────────────────────────── */
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
    this.renderer.setSize(w, h, false);
    if (this.uniforms) this.uniforms.u_resolution.value.set(w, h);
  }

  /* project world-space point → canvas pixel (matches outside.frag camera) */
  project(wx, wy, wz, camX, camY, introProgress) {
    const { w, h } = this._size();
    const az   = camX * 0.6;
    const el   = Math.max(-0.35, Math.min(0.35, camY * 0.3));
    const dist = 2.6 + (1 - introProgress) * 3.6; // matches mix(6.2,2.6,intro)
    const ht   = 0.28 + (1 - introProgress) * 0.57 + el * 0.5;

    const ro = [Math.sin(az)*dist, ht, -Math.cos(az)*dist];
    const ta = [0, -0.05, 0.3];

    const fw = norm(sub([wx,wy,wz], ro));   // approximate: dir from cam to point
    const fwCam = norm(sub(ta, ro));
    const ri  = norm(cross(fwCam, [0,1,0]));
    const up  = cross(ri, fwCam);

    const d   = sub([wx,wy,wz], ro);
    const dfw = dot(d, fwCam);
    if (dfw <= 0) return null;

    const dri = dot(d, ri);
    const dup = dot(d, up);
    const fov = 1.5;

    const sx = dri / dfw * fov;   // sc.x in [-asp, asp]
    const sy = dup / dfw * fov;   // sc.y in [-1,  1 ]
    const asp = w / h;

    // sc.x = (uv.x-0.5)*2*asp → uv.x = sx/(2*asp)+0.5
    const px = (sx / (2 * asp) + 0.5) * w;
    const py = (1 - (sy / 2 + 0.5)) * h;

    return { x: px, y: py };
  }
}

/* ── tiny vec math ──────────────────────────────── */
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function norm(a) {
  const l = Math.sqrt(dot(a,a)) || 1;
  return [a[0]/l, a[1]/l, a[2]/l];
}
