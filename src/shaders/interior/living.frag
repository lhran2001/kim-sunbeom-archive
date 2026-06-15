precision highp float;
varying vec2 vUv;
uniform float u_time;
uniform vec2  u_cam;
uniform vec2  u_resolution;

#define STEPS 42
#define MAXD  12.0
#define EPS   0.012
#define PI    3.14159265
#define FY   -0.55
#define CY    0.95
#define RW    1.8
#define RD    1.8

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(5.2,1.3);a*=0.5;}
  return v;
}
float sdBox(vec3 p, vec3 b){
  vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}

/* ── Scene ──────────────────────────────────────────────
   카메라는 방 안에서 바라봄.
   벽·바닥·천장 = 안쪽에서 양수 거리 (half-space)
   가구 = 표준 sdBox (양수 = 바깥)
   matId: 1=바닥  2=벽  3=천장  4=소파  5=테이블  6=러그
──────────────────────────────────────────────────────── */
vec2 map(vec3 p){

  /* ── 방 벽·바닥·천장 ─────── */
  float dFloor = p.y  - FY;         // 바닥 위에서 양수
  float dCeil  = CY   - p.y;        // 천장 아래서 양수
  float dWallB = RD   - p.z;        // 뒷벽 앞에서 양수
  float dWallF = p.z  + RD;         // 앞벽 뒤에서 양수
  float dWallL = p.x  + RW;         // 왼벽 오른쪽서 양수
  float dWallR = RW   - p.x;        // 오른벽 왼쪽서 양수

  /* 가장 가까운 벽 면 */
  vec2 res = vec2(dFloor, 1.0);
  if(dCeil  < res.x) res = vec2(dCeil,  3.0);
  if(dWallB < res.x) res = vec2(dWallB, 2.0);
  if(dWallF < res.x) res = vec2(dWallF, 2.0);
  if(dWallL < res.x) res = vec2(dWallL, 2.0);
  if(dWallR < res.x) res = vec2(dWallR, 2.0);

  /* ── 소파 시트 ── */
  vec3 sp = p - vec3(0.0, FY+0.21, RD-0.48);
  float dS = sdBox(sp, vec3(0.82,0.21,0.35));
  if(dS < res.x) res = vec2(dS, 4.0);

  /* ── 소파 등받이 ── */
  vec3 sb = p - vec3(0.0, FY+0.52, RD-0.20);
  float dSb = sdBox(sb, vec3(0.82,0.28,0.12));
  if(dSb < res.x) res = vec2(dSb, 4.0);

  /* ── 소파 팔걸이 L ── */
  vec3 al = p - vec3(-0.88, FY+0.28, RD-0.48);
  float dAl = sdBox(al, vec3(0.07,0.28,0.37));
  if(dAl < res.x) res = vec2(dAl, 4.0);

  /* ── 소파 팔걸이 R ── */
  vec3 ar = p - vec3( 0.88, FY+0.28, RD-0.48);
  float dAr = sdBox(ar, vec3(0.07,0.28,0.37));
  if(dAr < res.x) res = vec2(dAr, 4.0);

  /* ── 러그 ── */
  vec3 rp = p - vec3(0.0, FY+0.005, 0.22);
  float dRug = sdBox(rp, vec3(0.78,0.005,0.55));
  if(dRug < res.x) res = vec2(dRug, 6.0);

  /* ── 커피 테이블 상판 ── */
  vec3 tp = p - vec3(0.0, FY+0.30, 0.18);
  float dTop = sdBox(tp, vec3(0.38,0.035,0.22));
  if(dTop < res.x) res = vec2(dTop, 5.0);

  /* ── 테이블 다리 4개 ── */
  float lh = 0.148;
  vec3 ta0 = p-vec3(-0.32,FY+lh, 0.18-0.17); float dt0=sdBox(ta0,vec3(0.02,lh,0.02)); if(dt0<res.x)res=vec2(dt0,5.0);
  vec3 ta1 = p-vec3( 0.32,FY+lh, 0.18-0.17); float dt1=sdBox(ta1,vec3(0.02,lh,0.02)); if(dt1<res.x)res=vec2(dt1,5.0);
  vec3 ta2 = p-vec3(-0.32,FY+lh, 0.18+0.17); float dt2=sdBox(ta2,vec3(0.02,lh,0.02)); if(dt2<res.x)res=vec2(dt2,5.0);
  vec3 ta3 = p-vec3( 0.32,FY+lh, 0.18+0.17); float dt3=sdBox(ta3,vec3(0.02,lh,0.02)); if(dt3<res.x)res=vec2(dt3,5.0);

  return res;
}

vec3 calcNorm(vec3 p){
  float d=map(p).x; vec2 e=vec2(EPS,0.0);
  return normalize(vec3(map(p+e.xyy).x-d, map(p+e.yxy).x-d, map(p+e.yyx).x-d));
}

void main(){
  float T = u_time;
  vec2 sc = (vUv-0.5)*2.0;
  sc.x *= u_resolution.x / u_resolution.y;

  /* ── 카메라: 방 안에서 공전 ── */
  float az      = u_cam.x * 0.9;
  float el      = clamp(u_cam.y * 0.4, -0.5, 0.5);
  float camR    = 1.3;                          // 공전 반지름 (방 내부)
  float camH    = 0.18 + el * 0.55;             // 눈높이

  vec3 ro = vec3(sin(az)*camR, camH, -cos(az)*camR + 0.15);
  vec3 ta = vec3(0.0, -0.08, 0.25);             // 소파 방향을 봄

  vec3 fw = normalize(ta - ro);
  vec3 ri = normalize(cross(fw, vec3(0,1,0)));
  vec3 up = cross(ri, fw);

  /* 원근 투영 */
  float fov = 1.25;
  vec3 rd = normalize(sc.x*ri + sc.y*up + fov*fw);

  /* ── 레이마칭 ── */
  float t=0.01, matId=0.0;
  for(int i=0;i<STEPS;i++){
    vec2 h=map(ro+rd*t);
    if(h.x<EPS){ matId=h.y; break; }
    if(t>MAXD) break;
    t+=h.x*0.85;
  }

  vec3 bg = vec3(0.038,0.026,0.014);
  if(t>=MAXD){ gl_FragColor=vec4(bg,1.0); return; }

  vec3 pos = ro+rd*t;
  vec3 nor = calcNorm(pos);

  /* ── 조명 ── */
  vec3 lDir  = normalize(vec3(0.4, 1.8, -0.8));
  float diff = max(dot(nor,lDir),0.0);
  float spec = pow(max(dot(reflect(-lDir,nor),-rd),0.0),28.0);
  float amb  = 0.10 + max(nor.y,0.0)*0.06;

  /* 펜던트 포인트 라이트 */
  vec3 lamp  = vec3(0.0, CY-0.14, 0.20);
  float ld   = length(lamp-pos);
  float ldf  = max(dot(nor,normalize(lamp-pos)),0.0)/(ld*ld*0.5+0.4);

  /* 창문 간접광 */
  vec3 winDir = normalize(vec3(0.8,0.5,1.0));
  float wdf   = max(dot(nor,winDir),0.0)*0.35;

  vec3 col = vec3(0.0);

  if(matId==1.0){
    float grain=pos.x*14.0+fbm(pos.xz*3.5)*1.0;
    float rings=sin(grain*PI)*0.5+0.5+noise(pos.xz*vec2(180.0,6.0))*0.12;
    col=mix(vec3(0.058,0.040,0.018),vec3(0.095,0.070,0.032),clamp(rings,0.0,1.0));
    float sv=fract(pos.x*14.0), sw=fwidth(pos.x*14.0)*1.2;
    col-=(smoothstep(sw,0.0,sv)+smoothstep(1.0-sw,1.0,sv))*0.020;
    col*=(amb+diff*0.65+ldf*2.4+wdf*0.28);
    col+=vec3(0.784,0.659,0.494)*ldf*0.18;

  } else if(matId==2.0){
    float wn=noise(pos.xy*11.0+pos.z*7.0)*0.04+noise(pos.xz*4.5)*0.02;
    col=vec3(0.072,0.056,0.038)+wn;
    col*=(amb+diff*0.45+wdf*0.8+ldf*1.0);
    /* 창문 (뒷벽 오른편) */
    if(pos.z > RD-0.05){
      float wx=smoothstep(0.56,0.54,abs(pos.x-0.65));
      float wy=smoothstep(0.44,0.42,abs(pos.y-0.08));
      col=mix(col, vec3(0.94,0.82,0.60)*1.6+fbm(pos.xy*2.5+T*0.04)*0.08, wx*wy);
    }

  } else if(matId==3.0){
    col=vec3(0.050,0.038,0.025);
    col*=(amb+diff*0.28+ldf*0.45);
    col+=vec3(0.784,0.659,0.494)*exp(-length(pos.xz-vec2(0.0,0.2))*1.8)*0.25;

  } else if(matId==4.0){
    float fab=noise(pos.xz*38.0+pos.y*26.0)*0.04+fbm(pos.xz*7.5)*0.02;
    col=vec3(0.062,0.048,0.036)+fab;
    col+=vec3(0.784,0.659,0.494)*smoothstep(0.012,0.0,abs(fract(pos.x*1.15)-0.5))*0.05;
    col*=(amb+diff*0.55+ldf*1.8+wdf*0.22);
    col+=vec3(0.784,0.659,0.494)*0.015;

  } else if(matId==5.0){
    float hl=noise(vec2(pos.x*80.0+T*0.002,pos.z*9.0))*0.06;
    col=vec3(0.040,0.028,0.015)+hl;
    col*=(amb+diff*0.70+spec*0.28+ldf*2.0);

  } else if(matId==6.0){
    float rn=fbm(pos.xz*6.0)*0.06+noise(pos.xz*48.0)*0.02;
    col=vec3(0.090,0.062,0.042)+rn;
    col+=vec3(0.784,0.659,0.494)*(
      smoothstep(0.015,0.0,abs(fract(pos.x*3.0)-0.5))+
      smoothstep(0.015,0.0,abs(fract(pos.z*3.0)-0.5)))*0.035;
    col*=(amb+diff*0.55+ldf*1.6);
  }

  /* 펜던트 글로우 */
  col+=vec3(0.784,0.659,0.494)*exp(-ld*3.0)*0.12;

  /* AO 생략 (성능) — 코너 음영은 amb로 대체 */

  /* 비네트 */
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.22*dot(vd,vd);

  /* 톤맵 + 감마 */
  col=col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col=pow(max(col,0.0),vec3(1.0/2.0));
  gl_FragColor=vec4(col,1.0);
}
