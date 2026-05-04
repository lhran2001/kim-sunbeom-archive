precision highp float;
varying vec2 vUv;

uniform float u_time;
uniform vec2  u_cam;
uniform float u_mode;
uniform float u_distort;
uniform float u_intro;
uniform float u_glow;
uniform vec2  u_resolution;

#define PI      3.14159265359
#define STEPS   88
#define MAXD    22.0
#define EPS     0.0008

// ── utils ──────────────────────────────────────────────
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

float hash(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash1(float n){ return fract(sin(n)*43758.5453); }

float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.1+vec2(5.2,1.3); a*=0.5; }
  return v;
}

// ── SDF ────────────────────────────────────────────────
float sdBox(vec3 p, vec3 b){
  vec3 q=abs(p)-b;
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}

// Returns vec2(dist, matID)  — 1=logic, 2=rest, 3=shadows, 4=floor
vec2 map(vec3 p){
  float T = u_time;

  // Logic — left
  vec3 pL = p - vec3(-1.2,-0.1, 0.0);
  pL.xz *= rot(T*0.011);
  float dL = sdBox(pL, vec3(0.18,0.55,0.10));
  dL -= 0.006*(0.5+0.5*sin(pL.y*18.0+T*0.4)); // micro-bevel pulse

  // Rest — centre-back
  vec3 pR = p - vec3(0.0, 0.05, 0.9);
  pR.xz *= rot(T*0.012);
  float dR = sdBox(pR, vec3(0.16,0.50,0.12));

  // Shadows — right (with geometric trembling)
  vec3 pS = p - vec3(1.3,-0.1, 0.1);
  float tremble = fbm(pS.xy*3.0+T*0.8)*u_distort*0.05;
  pS += vec3(tremble, tremble*0.5, -tremble*0.3);
  pS.xz *= rot(-T*0.011);
  float dS = sdBox(pS, vec3(0.17,0.52,0.11));

  // Floor
  float dF = p.y + 0.65;

  vec2 res = vec2(dF, 4.0);
  if(dL<res.x) res=vec2(dL,1.0);
  if(dR<res.x) res=vec2(dR,2.0);
  if(dS<res.x) res=vec2(dS,3.0);
  return res;
}

vec3 calcNorm(vec3 p){
  float d=map(p).x;
  vec2 e=vec2(EPS,0.0);
  return normalize(vec3(map(p+e.xyy).x-d,
                        map(p+e.yxy).x-d,
                        map(p+e.yyx).x-d));
}

float softShadow(vec3 ro,vec3 rd,float mint,float maxt,float k){
  float res=1.0,t=mint;
  for(int i=0;i<14;i++){
    float h=map(ro+rd*t).x;
    res=min(res,k*h/t);
    t+=clamp(h,0.02,0.18);
    if(res<0.005||t>maxt) break;
  }
  return clamp(res,0.0,1.0);
}

// ── sky / background ───────────────────────────────────
vec3 skyColor(vec3 rd, float T){
  float h = rd.y*0.5+0.5;
  vec3 col;

  if(u_mode<0.5){
    // OUTSIDE: deep void, stars
    col = mix(vec3(0.018,0.015,0.012), vec3(0.028,0.022,0.018), h);
    vec2 sp = rd.xz/(abs(rd.y)+0.01)*28.0;
    float star = step(0.975, hash(floor(sp)));
    float blink = 0.5+0.5*sin(T*1.8+hash1(floor(sp.x)*31.0+floor(sp.y))*6.28);
    col += vec3(star*blink*0.30);
  } else if(u_mode<1.5){
    // LOGIC: cold precision grid
    col = mix(vec3(0.010,0.012,0.022), vec3(0.018,0.024,0.042), h);
    float gx = smoothstep(0.03,0.0,abs(fract(rd.x*28.0)-0.5));
    float gy = smoothstep(0.03,0.0,abs(fract(rd.y*28.0)-0.5));
    col += vec3(0.494,0.643,0.784)*(gx+gy)*0.18;
    // concentric rings
    float r = length(rd.xz);
    float ring = smoothstep(0.01,0.0,abs(fract(r*4.0-T*0.12)-0.5))*0.06;
    col += vec3(0.494,0.643,0.784)*ring;
  } else if(u_mode<2.5){
    // REST: amber fog
    col = mix(vec3(0.042,0.026,0.010), vec3(0.065,0.042,0.018), h);
    float fog = fbm(rd.xz*2.0+T*0.08)*0.18;
    col += vec3(0.784,0.659,0.494)*fog;
  } else {
    // SHADOWS: voronoi cracks + purple
    col = mix(vec3(0.020,0.010,0.022), vec3(0.032,0.015,0.038), h);
    float crack = fbm(rd.xz*5.0+T*0.06)-0.5;
    col += vec3(0.722,0.494,0.659)*max(-crack,0.0)*0.35;
    float glitch = step(0.968,hash(vec2(floor(rd.y*9.0),floor(T*0.6))))*u_distort;
    col = mix(col,col.gbr,glitch*0.4);
  }
  return col;
}

// ── main ───────────────────────────────────────────────
void main(){
  // 기둥/효과 전부 제거 — 캔버스 투명, CSS 배경 + SVG 오버레이만 표시
  gl_FragColor = vec4(0.0);
  return;

  float T = u_time;
  vec2 uv = vUv;

  // Shadows UV distortion
  if(u_distort>0.0){
    float dv = (fbm(uv*2.8+vec2(T*0.06,-T*0.04))-0.5)*u_distort*0.09;
    uv += vec2(dv, dv*0.7);
  }

  // Screen coords (aspect-corrected)
  vec2 sc = (uv-0.5)*2.0;
  sc.x *= u_resolution.x/u_resolution.y;

  // Camera
  float az  = u_cam.x*0.6;
  float el  = clamp(u_cam.y*0.3,-0.35,0.35);
  float dist= mix(6.2, 2.6, u_intro);
  float ht  = mix(0.85, 0.28, u_intro) + el*0.5;

  vec3 ro = vec3(sin(az)*dist, ht, -cos(az)*dist);
  vec3 ta = vec3(0.0,-0.05,0.3);
  vec3 fw = normalize(ta-ro);
  vec3 ri = normalize(cross(fw,vec3(0,1,0)));
  vec3 up = cross(ri,fw);
  vec3 rd  = normalize(sc.x*ri + sc.y*up + 1.5*fw);

  // Ray march
  float t=0.01, matId=0.0;
  for(int i=0;i<STEPS;i++){
    vec2 h=map(ro+rd*t);
    if(h.x<EPS){ matId=h.y; break; }
    if(t>MAXD) break;
    t+=h.x*0.88;
  }

  vec3  col   = vec3(0.0);
  float alpha = 0.0; // 0 = 완전 투명(배경 이미지 표시), 1 = 불투명

  if(t>=MAXD){
    // 레이 미스 → 완전 투명 (CSS 배경 이미지가 보임)
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 pos = ro+rd*t;
  vec3 nor = calcNorm(pos);

  vec3 lDir  = normalize(vec3(1.8,3.2,-1.5));
  float diff = max(dot(nor,lDir),0.0);
  float sha  = softShadow(pos+nor*0.003,lDir,0.01,7.0,8.0);
  float spec = pow(max(dot(reflect(-lDir,nor),-rd),0.0),52.0);
  float amb  = 0.04+0.03*nor.y;
  vec3  rimD = normalize(vec3(-1.2,0.4,1.0));
  float rim  = pow(max(dot(nor,rimD),0.0),2.0)*0.25;

  if(matId==1.0){
    // Logic — cold hairline metal
    vec3 base = vec3(0.063,0.071,0.102);
    vec3 acc  = vec3(0.494,0.643,0.784);
    vec3 lp   = pos-vec3(-1.2,-0.1,0.0);
    float hl  = noise(vec2(lp.x*55.0+lp.z*28.0, T*0.004))*0.07;
    float hln = smoothstep(0.025,0.0,abs(fract(lp.y*7.0)-0.5))*0.12;
    col = base*(amb+diff*sha*0.65)+acc*spec*sha*0.95;
    col += acc*(hln+hl*0.5)+acc*rim*0.18;

  } else if(matId==2.0){
    // Rest — warm satin
    vec3 base = vec3(0.082,0.071,0.055);
    vec3 acc  = vec3(0.784,0.659,0.494);
    col = base*(amb+diff*sha*0.55)+acc*spec*sha*0.55;
    col += acc*0.045+acc*rim*0.14;

  } else if(matId==3.0){
    // Shadows — purple, glitch
    vec3 base = vec3(0.071,0.055,0.071);
    vec3 acc  = vec3(0.722,0.494,0.659);
    col = base*(amb+diff*sha*0.52)+acc*spec*sha*0.82;
    col += acc*rim*0.22;
    if(u_distort>0.0){
      vec3 pS = pos-vec3(1.3,-0.1,0.1);
      float g = fbm(pS.xy*5.0+T*2.0)*u_distort;
      col = mix(col,col.gbr,g*0.32);
      col.r += u_distort*0.018;
      col.b -= u_distort*0.012;
    }

  } else {
    // Floor — 완전 투명 (우주 배경 그대로 노출)
    alpha = 0.0;
  }

  // 물체 alpha: fog에 따라 가장자리를 부드럽게 투명화
  float fog = exp(-t*0.10); // 가까울수록 불투명
  if(matId != 4.0) alpha = mix(0.0, 1.0, fog);

  // Chromatic aberration + glitch (Shadows)
  if(u_distort>0.0){
    float ab = u_distort*0.010;
    col.r += ab;
    col.b -= ab*0.7;
    float tear = step(0.986,hash(vec2(floor(vUv.y*18.0),floor(T*0.85))))*u_distort;
    col = mix(col,col.gbr,tear*0.4);
  }

  // ACES-ish tone map
  col = col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col = pow(max(col,0.0),vec3(1.0/1.85));

  gl_FragColor = vec4(col, alpha);
}
