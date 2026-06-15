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
   matId: 1=바닥  2=벽  3=천장
          4=헤드보드  5=침대 이불  6=베개  7=나이트스탠드  8=램프갓  9=커튼
──────────────────────────────────────────────────────── */
vec2 map(vec3 p){
  float T = u_time;

  /* 방 면 */
  vec2 res = vec2(p.y - FY, 1.0);
  float dC = CY - p.y; if(dC<res.x) res=vec2(dC,3.0);
  float dB = RD - p.z;  if(dB<res.x) res=vec2(dB,2.0);
  float dF = p.z + RD;  if(dF<res.x) res=vec2(dF,2.0);
  float dL = p.x + RW;  if(dL<res.x) res=vec2(dL,2.0);
  float dR = RW - p.x;  if(dR<res.x) res=vec2(dR,2.0);

  /* ── 헤드보드 (뒷벽 중앙) ── */
  vec3 hbP = p - vec3(0.0, FY+0.62, RD-0.12);
  float dHb = sdBox(hbP, vec3(0.82,0.52,0.08));
  if(dHb<res.x) res=vec2(dHb,4.0);

  /* 헤드보드 상단 몰딩 */
  vec3 hmP = p - vec3(0.0, FY+1.02, RD-0.10);
  float dHm = sdBox(hmP, vec3(0.84,0.04,0.06));
  if(dHm<res.x) res=vec2(dHm,4.0);

  /* ── 침대 프레임 ── */
  vec3 frP = p - vec3(0.0, FY+0.14, RD-0.65);
  float dFr = sdBox(frP, vec3(0.82,0.14,0.62));
  if(dFr<res.x) res=vec2(dFr,4.0);

  /* ── 이불 ── */
  float bedVol = fbm(p.xz*5.5+T*0.003)*0.04+0.02;
  vec3 dvP = p - vec3(0.0, FY+0.32+bedVol, RD-0.65);
  float dDv = sdBox(dvP, vec3(0.78,0.10,0.58));
  if(dDv<res.x) res=vec2(dDv,5.0);

  /* ── 베개 2개 ── */
  vec3 pl0 = p - vec3(-0.28, FY+0.36, RD-0.24);
  float dp0 = sdBox(pl0, vec3(0.20,0.065,0.13));
  if(dp0<res.x) res=vec2(dp0,6.0);

  vec3 pl1 = p - vec3( 0.28, FY+0.36, RD-0.24);
  float dp1 = sdBox(pl1, vec3(0.20,0.065,0.13));
  if(dp1<res.x) res=vec2(dp1,6.0);

  /* ── 나이트스탠드 왼쪽 ── */
  vec3 ns0 = p - vec3(-1.08, FY+0.20, RD-0.62);
  float dn0 = sdBox(ns0, vec3(0.18,0.20,0.18));
  if(dn0<res.x) res=vec2(dn0,7.0);

  /* 왼쪽 서랍 라인 */
  vec3 dr0 = p - vec3(-1.08, FY+0.18, RD-0.60);
  float dd0 = sdBox(dr0, vec3(0.155,0.005,0.155));
  if(dd0<res.x) res=vec2(dd0,7.0);

  /* ── 나이트스탠드 오른쪽 ── */
  vec3 ns1 = p - vec3( 1.08, FY+0.20, RD-0.62);
  float dn1 = sdBox(ns1, vec3(0.18,0.20,0.18));
  if(dn1<res.x) res=vec2(dn1,7.0);

  /* 오른쪽 서랍 라인 */
  vec3 dr1 = p - vec3( 1.08, FY+0.18, RD-0.60);
  float dd1 = sdBox(dr1, vec3(0.155,0.005,0.155));
  if(dd1<res.x) res=vec2(dd1,7.0);

  /* ── 램프갓 왼쪽 ── */
  vec3 lg0 = p - vec3(-1.08, FY+0.50, RD-0.62);
  float dg0 = sdBox(lg0, vec3(0.08,0.065,0.06));
  if(dg0<res.x) res=vec2(dg0,8.0);

  /* 램프 기둥 왼쪽 */
  vec3 lk0 = p - vec3(-1.08, FY+0.35, RD-0.62);
  float dk0 = sdBox(lk0, vec3(0.012,0.12,0.012));
  if(dk0<res.x) res=vec2(dk0,8.0);

  /* ── 램프갓 오른쪽 ── */
  vec3 lg1 = p - vec3( 1.08, FY+0.50, RD-0.62);
  float dg1 = sdBox(lg1, vec3(0.08,0.065,0.06));
  if(dg1<res.x) res=vec2(dg1,8.0);

  /* 램프 기둥 오른쪽 */
  vec3 lk1 = p - vec3( 1.08, FY+0.35, RD-0.62);
  float dk1 = sdBox(lk1, vec3(0.012,0.12,0.012));
  if(dk1<res.x) res=vec2(dk1,8.0);

  /* ── 커튼 왼쪽 ── */
  vec3 ct0 = p - vec3(-RW+0.04, FY+0.20, 0.55);
  float dc0 = sdBox(ct0, vec3(0.04, CY-FY-0.20, 0.55));
  if(dc0<res.x) res=vec2(dc0,9.0);

  /* ── 커튼 오른쪽 ── */
  vec3 ct1 = p - vec3(RW-0.04, FY+0.20, 0.55);
  float dc1 = sdBox(ct1, vec3(0.04, CY-FY-0.20, 0.55));
  if(dc1<res.x) res=vec2(dc1,9.0);

  return res;
}

vec3 calcNorm(vec3 p){
  float d=map(p).x; vec2 e=vec2(EPS,0.0);
  return normalize(vec3(map(p+e.xyy).x-d,map(p+e.yxy).x-d,map(p+e.yyx).x-d));
}

void main(){
  float T = u_time;
  vec2 sc = (vUv-0.5)*2.0;
  sc.x *= u_resolution.x/u_resolution.y;

  /* ── 카메라: 방 안에서 공전 ── */
  float az   = u_cam.x * 0.9;
  float el   = clamp(u_cam.y*0.4, -0.5, 0.5);
  float camR = 1.3;
  float camH = 0.18 + el*0.55;

  vec3 ro = vec3(sin(az)*camR, camH, -cos(az)*camR+0.10);
  vec3 ta = vec3(0.0, -0.02, 0.25);
  vec3 fw = normalize(ta-ro);
  vec3 ri = normalize(cross(fw,vec3(0,1,0)));
  vec3 up = cross(ri,fw);
  vec3 rd = normalize(sc.x*ri + sc.y*up + 1.25*fw);

  /* ── 레이마칭 ── */
  float t=0.01, matId=0.0;
  for(int i=0;i<STEPS;i++){
    vec2 h=map(ro+rd*t);
    if(h.x<EPS){matId=h.y;break;}
    if(t>MAXD) break;
    t+=h.x*0.85;
  }

  vec3 bg = mix(vec3(0.018,0.012,0.020), vec3(0.028,0.018,0.030), vUv.y);
  if(t>=MAXD){ gl_FragColor=vec4(bg,1.0); return; }

  vec3 pos = ro+rd*t;
  vec3 nor = calcNorm(pos);

  /* ── 조명 ── */
  vec3 lMain = normalize(vec3(0.2, 1.8, -0.5));
  float diff  = max(dot(nor,lMain),0.0);
  float spec  = pow(max(dot(reflect(-lMain,nor),-rd),0.0),28.0);
  float amb   = 0.07 + max(nor.y,0.0)*0.04;

  /* 나이트스탠드 램프 2개 */
  vec3 lp0 = vec3(-1.08, FY+0.52, RD-0.62);
  vec3 lp1 = vec3( 1.08, FY+0.52, RD-0.62);
  float ld0 = length(lp0-pos);
  float ld1 = length(lp1-pos);
  float ldf = max(dot(nor,normalize(lp0-pos)),0.0)/(ld0*ld0*0.6+0.5)
            + max(dot(nor,normalize(lp1-pos)),0.0)/(ld1*ld1*0.6+0.5);

  /* 달빛 창문 (오른쪽 벽) */
  vec3 moonDir = normalize(vec3(1.2, 0.6, 0.4));
  float moondf = max(dot(nor,moonDir),0.0)*0.30;

  vec3 warmAccent   = vec3(0.784,0.610,0.408); // 따뜻한 램프색
  vec3 shadowAccent = vec3(0.722,0.494,0.659); // #B87EA8

  vec3 col = vec3(0.0);

  if(matId==1.0){
    /* 바닥: 따뜻한 어두운 원목 */
    float grain=pos.x*13.0+fbm(pos.xz*3.0)*0.9;
    float rings=sin(grain*PI)*0.5+0.5+noise(pos.xz*vec2(160.0,5.5))*0.10;
    col=mix(vec3(0.028,0.018,0.010),vec3(0.052,0.036,0.020),clamp(rings,0.0,1.0));
    float sv=fract(pos.x*13.0), sw=fwidth(pos.x*13.0)*1.2;
    col-=(smoothstep(sw,0.0,sv)+smoothstep(1.0-sw,1.0,sv))*0.016;
    col*=(amb+diff*0.50+ldf*2.8+moondf*0.4);
    col+=warmAccent*ldf*0.15;

  } else if(matId==2.0){
    /* 벽: 어두운 베이지-그레이 */
    float wn=noise(pos.xy*11.0+pos.z*7.0)*0.04+noise(pos.xz*4.5)*0.02;
    col=vec3(0.042,0.030,0.022)+wn;
    col*=(amb+diff*0.40+ldf*1.2+moondf*0.7);
    /* 창문: 오른쪽 벽 달빛 */
    if(pos.x > RW-0.05){
      float wy=smoothstep(0.46,0.44,abs(pos.y-0.08));
      float wz=smoothstep(0.54,0.52,abs(pos.z-0.18));
      col=mix(col, vec3(0.45,0.52,0.68)*1.3, wy*wz);
      /* 창틀 */
      float fv=smoothstep(0.006,0.0,abs(pos.z-0.18))*wy;
      float fh=smoothstep(0.006,0.0,abs(pos.y-0.08))*wz;
      col-=(fv+fh)*0.06;
    }
    /* 나이트스탠드 뒷벽 후광 */
    col+=warmAccent*exp(-length(pos.xz-lp0.xz)*2.5)*0.08;
    col+=warmAccent*exp(-length(pos.xz-lp1.xz)*2.5)*0.08;

  } else if(matId==3.0){
    /* 천장 */
    col=vec3(0.025,0.018,0.014);
    col*=(amb+diff*0.22+ldf*0.4);

  } else if(matId==4.0){
    /* 헤드보드·프레임: 짙은 월넛 패브릭 */
    float ch=noise(vec2(pos.x*100.0,pos.y*7.0))*0.04+noise(vec2(pos.x*30.0,pos.y*2.5))*0.02;
    col=mix(vec3(0.025,0.016,0.010), vec3(0.042,0.028,0.018), ch);
    /* 수평 채널 스티치 */
    float st=smoothstep(0.008,0.0,abs(fract(pos.y*7.0)-0.5))*0.04;
    col+=warmAccent*st;
    col*=(amb+diff*0.50+ldf*1.4+moondf*0.3);

  } else if(matId==5.0){
    /* 이불: 따뜻한 아이보리 */
    float vol=fbm(pos.xz*5.0+T*0.003)*0.06+0.02;
    float bump=sin(fbm(pos.xz*7.0)*PI)*0.5+0.5;
    col=mix(vec3(0.18,0.14,0.10), vec3(0.32,0.26,0.20), bump+vol);
    /* 누빔 마름모 */
    float qu=pos.x*8.0+pos.z*4.0, qv=pos.x*8.0-pos.z*4.0;
    float qw=fwidth(qu)*0.8;
    col-=(smoothstep(qw,0.0,fract(qu))+smoothstep(1.0-qw,1.0,fract(qu))
         +smoothstep(qw,0.0,fract(qv))+smoothstep(1.0-qw,1.0,fract(qv)))*0.022;
    col*=(amb+diff*0.55+ldf*2.0+moondf*0.4);
    col+=warmAccent*ldf*0.10;

  } else if(matId==6.0){
    /* 베개: 밝은 크림 */
    float pn=fbm(pos.xz*9.0+T*0.002)*0.04;
    col=vec3(0.42,0.36,0.28)+pn;
    col*=(amb+diff*0.60+ldf*2.2+moondf*0.3);

  } else if(matId==7.0){
    /* 나이트스탠드: 다크 월넛 */
    float hn=noise(vec2(pos.y*80.0,pos.z*10.0))*0.04;
    col=vec3(0.030,0.020,0.012)+hn;
    col*=(amb+diff*0.55+ldf*2.0);

  } else if(matId==8.0){
    /* 램프갓: 따뜻한 빛 */
    float glow=smoothstep(0.07,0.0,abs(pos.y-(FY+0.50)));
    col=mix(vec3(0.25,0.20,0.15), vec3(0.90,0.72,0.42)*1.5, glow);
    col*=(amb+0.5+ldf*1.5);

  } else if(matId==9.0){
    /* 커튼: 두꺼운 천 */
    float folds=noise(vec2(pos.y*14.0,pos.z*6.0))*0.50
              + noise(vec2(pos.y*4.0,pos.z*2.0))*0.28
              + noise(vec2(pos.y*40.0,pos.z*18.0))*0.14;
    col=mix(vec3(0.055,0.035,0.028), vec3(0.075,0.050,0.038), folds);
    col*=(amb+diff*0.40+moondf*0.6);
  }

  /* 나이트스탠드 램프 글로우 */
  col+=warmAccent*exp(-ld0*3.2)*0.14;
  col+=warmAccent*exp(-ld1*3.2)*0.14;

  /* shadows 모드 보라빛 미세 글리치 */
  float glitch=fbm(pos.xy*4.0+T*0.5)*0.03;
  col+=shadowAccent*glitch*0.25;

  /* AO 생략 (성능) */

  /* 비네트 */
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.24*dot(vd,vd);

  /* 톤맵 + 감마 */
  col=col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col=pow(max(col,0.0),vec3(1.0/2.0));
  gl_FragColor=vec4(col,1.0);
}
