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
float hash1(float n){ return fract(sin(n)*43758.5453); }
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
          4=서가(棚)  5=책  6=스틸 책상  7=의자  8=작업등
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

  /* ── 서가 본체 (왼쪽 벽) ── */
  vec3 shP = p - vec3(-RW+0.13, FY+0.50, 0.0);
  float dSh = sdBox(shP, vec3(0.13, 0.50, 1.20));
  if(dSh < res.x) res = vec2(dSh, 4.0);

  /* 서가 선반 가로대 6개 */
  float shelfStep = 0.18;
  for(int s=0;s<6;s++){
    float sy = FY + 0.12 + float(s)*shelfStep;
    vec3 slP = p - vec3(-RW+0.14, sy, 0.0);
    float dSl = sdBox(slP, vec3(0.01,0.015,1.20));
    if(dSl<res.x) res=vec2(dSl,4.0);
  }

  /* 책 20권 (서가 위) */
  for(int b=0;b<20;b++){
    float fb = float(b);
    float bz  = -1.10 + fb*0.115 + hash1(fb)*0.02;
    float bh  = 0.055 + hash1(fb+10.0)*0.038;
    int   row = int(mod(fb, 2.0));
    float by  = FY + 0.12 + float(row)*shelfStep + bh;
    vec3 bP   = p - vec3(-RW+0.15, by, bz);
    float dbk = sdBox(bP, vec3(0.018, bh, 0.040+hash1(fb+30.0)*0.015));
    if(dbk<res.x) res=vec2(dbk,5.0);
  }

  /* ── 스틸 책상 (중앙-오른쪽) ── */
  vec3 dkP = p - vec3(0.35, FY+0.38, 0.10);
  float dDk = sdBox(dkP, vec3(0.75,0.028,0.42));
  if(dDk<res.x) res=vec2(dDk,6.0);

  /* 책상 다리 4개 */
  float dlh = 0.175;
  vec3 dk0=p-vec3(-0.36,FY+dlh, 0.10-0.36); float dd0=sdBox(dk0,vec3(0.018,dlh,0.018)); if(dd0<res.x)res=vec2(dd0,6.0);
  vec3 dk1=p-vec3( 1.06,FY+dlh, 0.10-0.36); float dd1=sdBox(dk1,vec3(0.018,dlh,0.018)); if(dd1<res.x)res=vec2(dd1,6.0);
  vec3 dk2=p-vec3(-0.36,FY+dlh, 0.10+0.36); float dd2=sdBox(dk2,vec3(0.018,dlh,0.018)); if(dd2<res.x)res=vec2(dd2,6.0);
  vec3 dk3=p-vec3( 1.06,FY+dlh, 0.10+0.36); float dd3=sdBox(dk3,vec3(0.018,dlh,0.018)); if(dd3<res.x)res=vec2(dd3,6.0);

  /* ── 의자 시트 ── */
  vec3 chP = p - vec3(0.30, FY+0.22, -0.38);
  float dCh = sdBox(chP, vec3(0.24,0.038,0.22));
  if(dCh<res.x) res=vec2(dCh,7.0);

  /* 의자 등받이 */
  vec3 cbP = p - vec3(0.30, FY+0.44, -0.55);
  float dCb = sdBox(cbP, vec3(0.24,0.20,0.025));
  if(dCb<res.x) res=vec2(dCb,7.0);

  /* ── 작업등 (책상 오른쪽) ── */
  vec3 lpP = p - vec3(0.90, FY+0.55, -0.15);
  float dLp = sdBox(lpP, vec3(0.025,0.14,0.025));
  if(dLp<res.x) res=vec2(dLp,8.0);

  /* 작업등 갓 */
  vec3 lsP = p - vec3(0.82, FY+0.68, -0.10);
  float dLs = sdBox(lsP, vec3(0.09,0.045,0.07));
  if(dLs<res.x) res=vec2(dLs,8.0);

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
  vec3 ta = vec3(0.0, -0.05, 0.15);
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

  vec3 bg = mix(vec3(0.022,0.028,0.022), vec3(0.035,0.042,0.032), vUv.y);
  if(t>=MAXD){ gl_FragColor=vec4(bg,1.0); return; }

  vec3 pos = ro+rd*t;
  vec3 nor = calcNorm(pos);

  /* ── 조명 ── */
  vec3 lMain = normalize(vec3(0.3, 2.0, -0.6));
  float diff  = max(dot(nor,lMain),0.0);
  float spec  = pow(max(dot(reflect(-lMain,nor),-rd),0.0),36.0);
  float amb   = 0.10 + max(nor.y,0.0)*0.06;

  /* 다운라이트 2개 */
  vec3 dl0 = vec3(-0.40, CY-0.10, 0.0);
  vec3 dl1 = vec3( 0.55, CY-0.10, 0.0);
  float ld0 = length(dl0-pos);
  float ld1 = length(dl1-pos);
  float ldf = max(dot(nor,normalize(dl0-pos)),0.0)/(ld0*ld0*0.5+0.4)
            + max(dot(nor,normalize(dl1-pos)),0.0)/(ld1*ld1*0.5+0.4);

  /* 작업등 포인트 라이트 */
  vec3 wlp  = vec3(0.82, FY+0.70, -0.10);
  float wld = length(wlp-pos);
  float wdf = max(dot(nor,normalize(wlp-pos)),0.0)/(wld*wld*0.6+0.5);

  /* 창문 간접광 (오른쪽 뒷벽) */
  float windf = max(dot(nor,normalize(vec3(1.0,0.4,1.0))),0.0)*0.30;

  vec3 col = vec3(0.0);
  vec3 logicAccent = vec3(0.494,0.643,0.784); // #7EA4C8

  if(matId==1.0){
    /* 바닥: 어두운 원목 */
    float grain=pos.x*14.0+fbm(pos.xz*3.2)*1.0;
    float rings=sin(grain*PI)*0.5+0.5+noise(pos.xz*vec2(170.0,6.0))*0.11;
    col=mix(vec3(0.030,0.024,0.014),vec3(0.055,0.042,0.024),clamp(rings,0.0,1.0));
    float sv=fract(pos.x*14.0), sw=fwidth(pos.x*14.0)*1.2;
    col-=(smoothstep(sw,0.0,sv)+smoothstep(1.0-sw,1.0,sv))*0.018;
    col*=(amb+diff*0.60+ldf*2.2+wdf*2.8+windf*0.3);

  } else if(matId==2.0){
    /* 벽: 세이지 그린 */
    float wn=noise(pos.xy*12.0+pos.z*7.0)*0.04+noise(pos.xz*5.0)*0.02;
    col=vec3(0.048,0.056,0.042)+wn;
    col*=(amb+diff*0.42+ldf*1.0+wdf*1.4+windf*0.7);
    /* 창문: 뒷벽 왼편 (로직 차가운 빛) */
    if(pos.z>RD-0.05){
      float wx=smoothstep(0.52,0.50,abs(pos.x+0.55));
      float wy=smoothstep(0.40,0.38,abs(pos.y-0.10));
      col=mix(col, vec3(0.75,0.88,1.00)*1.2, wx*wy);
    }
    /* 패널 세로선 */
    float panel=smoothstep(0.006,0.0,abs(fract(pos.x*1.5+0.25)-0.5))*0.04;
    col+=logicAccent*panel;

  } else if(matId==3.0){
    /* 천장 */
    col=vec3(0.032,0.038,0.028);
    col*=(amb+diff*0.25+ldf*0.5);
    /* 다운라이트 글로우 */
    col+=logicAccent*exp(-length(pos.xz-dl0.xz)*2.5)*0.18;
    col+=logicAccent*exp(-length(pos.xz-dl1.xz)*2.5)*0.18;

  } else if(matId==4.0){
    /* 서가: 다크 월넛 */
    float hl=noise(vec2(pos.y*60.0,pos.z*8.0))*0.04+noise(vec2(pos.z*22.0,pos.y*4.0))*0.02;
    col=vec3(0.032,0.024,0.014)+hl;
    /* 선반 라인 강조 */
    float sl=smoothstep(0.008,0.0,abs(fract(pos.y*5.5)-0.5))*0.05;
    col+=logicAccent*sl;
    col*=(amb+diff*0.55+ldf*1.6+wdf*1.0);

  } else if(matId==5.0){
    /* 책: 다양한 색 */
    float hue=hash1(floor(pos.z*9.0)+floor(pos.y*5.5)*13.0);
    vec3 bc;
    if(hue<0.33)      bc=vec3(0.55,0.70,0.55);   // 초록 계열
    else if(hue<0.66) bc=vec3(0.65,0.60,0.45);   // 베이지
    else              bc=vec3(0.40,0.50,0.65);    // 파랑 계열
    col=bc*0.38;
    col*=(amb+diff*0.55+ldf*1.4);

  } else if(matId==6.0){
    /* 스틸 책상: 헤어라인 메탈 */
    float hl=noise(vec2(pos.x*180.0+T*0.002,pos.z*8.0))*0.5+0.5;
    col=vec3(0.055,0.065,0.052)+vec3(0.022)*hl;
    col*=(amb+diff*0.70+spec*0.45+ldf*2.0+wdf*1.8);
    col+=logicAccent*spec*0.12;

  } else if(matId==7.0){
    /* 의자: 패브릭 */
    float fn=noise(pos.xz*42.0+pos.y*30.0)*0.04;
    col=vec3(0.038,0.046,0.036)+fn;
    col*=(amb+diff*0.50+ldf*1.4);

  } else if(matId==8.0){
    /* 작업등: 금속+빛 */
    col=mix(vec3(0.20,0.22,0.18), vec3(0.88,0.82,0.62)*1.4,
            smoothstep(0.06,0.0,abs(pos.y-(FY+0.68))));
    col*=(amb+diff*0.4+wdf*3.0);
  }

  /* 다운라이트 + 작업등 글로우 */
  col+=logicAccent*exp(-ld0*2.8)*0.10;
  col+=logicAccent*exp(-ld1*2.8)*0.10;
  col+=vec3(0.88,0.82,0.62)*exp(-wld*3.5)*0.15;

  /* AO 생략 (성능) */

  /* 비네트 */
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.22*dot(vd,vd);

  /* 톤맵 + 감마 */
  col=col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col=pow(max(col,0.0),vec3(1.0/2.0));
  gl_FragColor=vec4(col,1.0);
}
