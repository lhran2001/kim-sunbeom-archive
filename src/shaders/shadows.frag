precision highp float;
varying vec2 vUv;

uniform float u_time;
uniform vec2  u_cam;
uniform float u_mode;
uniform float u_distort;
uniform float u_intro;
uniform float u_glow;
uniform vec2  u_resolution;

#define PI    3.14159265359
#define STEPS 80
#define MAXD  20.0
#define EPS   0.001

mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

float hash(vec2 p){
  p=fract(p*vec2(234.34,435.345));
  p+=dot(p,p+34.23);
  return fract(p.x*p.y);
}
float hash1(float n){ return fract(sin(n)*43758.5453); }

float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<7;i++){ v+=a*noise(p); p=p*2.1+vec2(5.2,1.3); a*=0.5; }
  return v;
}
float fbm3(vec2 p){ return fbm(p+fbm(p+fbm(p))); }

// Voronoi cracks
float voronoi(vec2 p){
  vec2 b=floor(p),f=fract(p);
  float md=8.0;
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 g=vec2(float(x),float(y));
      vec2 o=hash(b+g)*0.8+0.1;
      float d=length(g+o-f);
      md=min(md,d);
    }
  }
  return md;
}

float sdBox(vec3 p, vec3 b){
  vec3 q=abs(p)-b;
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}

vec2 map(vec3 p){
  float T=u_time;
  float d=u_distort;

  vec3 pS=p-vec3(0.0,0.0,0.2);
  float tr=fbm(pS.xy*3.0+T*0.9)*d*0.08;
  pS+=vec3(tr,tr*0.6,-tr*0.4);
  pS.xz*=rot(-T*0.013+d*0.3);
  float dS=sdBox(pS,vec3(0.22,0.68,0.14));
  // surface fracture
  dS-=fbm(pS.xy*8.0+T*0.3)*d*0.015;

  float dF=p.y+0.65;
  vec2 res=vec2(dF,4.0);
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

void main(){
  float T=u_time;
  float d=max(u_distort,0.3); // always some distortion in shadows view

  vec2 uv=vUv;

  // Heavy UV warp
  float warpV=fbm(uv*3.2+vec2(T*0.07,-T*0.05));
  float warpH=fbm(uv*3.2+vec2(-T*0.05,T*0.09));
  vec2 warp=(vec2(warpV,warpH)-0.5)*d*0.14;
  uv+=warp;

  vec2 sc=(uv-0.5)*2.0;
  sc.x*=u_resolution.x/u_resolution.y;

  float az=u_cam.x*0.5;
  float el=clamp(u_cam.y*0.25,-0.3,0.3);
  float dist=mix(5.0,2.2,u_intro);

  vec3 ro=vec3(sin(az)*dist,0.3+el,-cos(az)*dist);
  vec3 ta=vec3(0.0,0.0,0.2);
  vec3 fw=normalize(ta-ro);
  vec3 ri=normalize(cross(fw,vec3(0,1,0)));
  vec3 up=cross(ri,fw);
  vec3 rd=normalize(sc.x*ri+sc.y*up+1.4*fw);

  float t=0.01,matId=0.0;
  for(int i=0;i<STEPS;i++){
    vec2 h=map(ro+rd*t);
    if(h.x<EPS){ matId=h.y; break; }
    if(t>MAXD) break;
    t+=h.x*0.85;
  }

  // Background: deep purple void with voronoi cracks
  vec3 bg=mix(vec3(0.022,0.010,0.025),vec3(0.042,0.018,0.048),vUv.y);
  float vc=voronoi(rd.xz*6.0+T*0.04);
  bg+=vec3(0.722,0.494,0.659)*smoothstep(0.08,0.0,vc)*0.45;
  // glitch bands
  float band=step(0.97,hash(vec2(floor(vUv.y*24.0),floor(T*1.2))))*d;
  bg=mix(bg,bg.gbr,band*0.5);
  // scanlines
  float scan=0.5+0.5*sin(vUv.y*u_resolution.y*0.8);
  bg*=0.92+0.08*scan;

  vec3 col=bg;

  if(t<MAXD){
    vec3 pos=ro+rd*t;
    vec3 nor=calcNorm(pos);
    vec3 lDir=normalize(vec3(0.5,2.0,-1.0));
    float diff=max(dot(nor,lDir),0.0);
    float spec=pow(max(dot(reflect(-lDir,nor),-rd),0.0),38.0);
    float amb=0.06;

    if(matId==3.0){
      vec3 base=vec3(0.085,0.055,0.090);
      vec3 acc=vec3(0.722,0.494,0.659);

      // Surface crack pattern
      vec3 pS=pos-vec3(0.0,0.0,0.2);
      float crack=voronoi(pS.xy*6.0+T*0.15);
      float crackLine=smoothstep(0.07,0.0,crack);

      col=base*(amb+diff*0.55)+acc*spec*0.9;
      col=mix(col,acc,crackLine*d*0.6);

      // Chromatic aberration
      float ab=d*0.022;
      col.r+=ab;
      col.b-=ab*0.8;

      // Subsurface scatter: purple glow from within
      float sss=exp(-crack*3.0)*d;
      col+=vec3(0.5,0.2,0.6)*sss*0.3;

    } else {
      // floor
      col=vec3(0.020,0.012,0.022);
      float fr=pow(1.0-abs(dot(nor,-rd)),4.0);
      col+=vec3(0.722,0.494,0.659)*fr*0.12;
    }

    float fog=1.0-exp(-t*0.14);
    col=mix(col,bg*0.3,fog);
  }

  // Global chromatic aberration
  float ab=d*0.014;
  col.r+=ab;
  col.b-=ab*0.6;

  // Glitch tear horizontal
  float tear=step(0.984,hash(vec2(floor(vUv.y*20.0),floor(T*1.0))))*d;
  col=mix(col,col.gbr,tear*0.45);

  // Vignette (heavy)
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.55*dot(vd,vd);

  // Tone map
  col=col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col=pow(max(col,0.0),vec3(1.0/1.9));

  gl_FragColor=vec4(col,1.0);
}
