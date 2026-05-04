precision highp float;
varying vec2 vUv;
uniform float u_time;
uniform vec2  u_resolution;

float hash(vec2 p){ p=fract(p*vec2(234.34,435.345)); p+=dot(p,p+34.23); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(5.2,1.3);a*=0.5;} return v; }

void main(){
  float T=u_time;
  vec2 uv=vUv;

  float floorY=0.70;
  float ceilY=0.08;
  float bedL=0.22, bedR=0.78;
  float bedTop=floorY-0.30, bedBot=floorY;
  float nsL=0.06, nsR=0.94; // nightstand x edges

  // ── Base: very dark warm charcoal ──
  vec3 col=mix(vec3(0.030,0.022,0.018), vec3(0.045,0.032,0.026), uv.y);

  // ── Ceiling ──
  if(uv.y<ceilY){
    col=vec3(0.025,0.018,0.015);
  }

  // ── Curtains (sides) ──
  float curtL=smoothstep(0.14,0.0,uv.x);
  float curtR=smoothstep(0.86,1.0,uv.x);
  if((curtL>0.0||curtR>0.0) && uv.y>ceilY && uv.y<floorY){
    float curt=max(curtL,curtR);
    // Fabric folds
    float folds=sin(uv.x*80.0+uv.y*5.0)*0.5+0.5;
    vec3 curtCol=mix(vec3(0.050,0.035,0.045),vec3(0.065,0.045,0.058),folds)*0.8;
    // Very faint warm glow through curtain
    curtCol+=vec3(0.5,0.3,0.2)*0.02;
    col=mix(col,curtCol,curt);
  }

  // ── Back wall ──
  if(uv.x>0.14 && uv.x<0.86 && uv.y>ceilY && uv.y<floorY){
    vec3 wall=mix(vec3(0.038,0.028,0.022), vec3(0.052,0.038,0.030), uv.y*0.7);
    float tex=noise(uv*vec2(50.0,30.0))*0.025;
    wall+=tex;
    col=wall;
  }

  // ── Bed (centre) ──
  bool inBed= uv.x>bedL && uv.x<bedR && uv.y>bedTop && uv.y<bedBot;
  if(inBed){
    // Goose-down duvet: volumetric fbm bumps
    float duv=fbm(uv*3.0+T*0.003)*0.06+0.04;
    float height=0.5+0.5*sin(fbm(uv*5.0)*6.28);
    vec3 bedBase=mix(vec3(0.065,0.052,0.048),vec3(0.090,0.072,0.066),height);
    bedBase+=duv*0.15;
    // Pillow area: lighter
    float pillowX=smoothstep(0.30,0.32,uv.x)*smoothstep(0.70,0.68,uv.x);
    float pillowY=smoothstep(bedTop+0.08,bedTop+0.06,uv.y);
    bedBase=mix(bedBase, bedBase+vec3(0.06,0.05,0.045), pillowX*pillowY);
    // Subtle warm ambient
    bedBase+=vec3(0.784,0.659,0.494)*0.05;
    col=bedBase;
  }

  // ── Nightstand + indirect lamp (both sides) ──
  vec2 lamps[2];
  lamps[0]=vec2(nsL+0.06, bedTop+0.12);
  lamps[1]=vec2(nsR-0.06, bedTop+0.12);

  for(int i=0;i<2;i++){
    vec2 lp=lamps[i];
    // Nightstand body
    bool inNS= abs(uv.x-lp.x)<0.05 && uv.y>bedTop && uv.y<bedTop+0.18;
    if(inNS) col=vec3(0.048,0.036,0.028);
    // Lamp glow: warm amber indirect
    float ld=length(uv-lp);
    col+=vec3(0.784,0.659,0.494)*exp(-ld*9.5)*0.55;
    // Glow on wall behind lamp
    col+=vec3(0.784,0.659,0.494)*exp(-length(uv-vec2(lp.x,lp.y-0.06))*6.0)*0.20;
  }

  // ── Carpet (floor) ──
  if(uv.y>floorY){
    float carpet=fbm(uv*8.0+T*0.001)*0.06+0.04;
    vec3 carpetCol=mix(vec3(0.055,0.038,0.050),vec3(0.070,0.048,0.062),carpet);
    // Lamp reflection on carpet
    for(int i=0;i<2;i++){
      vec2 lp=lamps[i];
      float rf=exp(-length(vec2(uv.x-lp.x,(uv.y-floorY)*3.0))*5.5)*0.3;
      carpetCol+=vec3(0.784,0.659,0.494)*rf;
    }
    col=carpetCol;
  }

  // ── Vignette (heavy for bedroom intimacy) ──
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.52*dot(vd,vd);

  col=pow(max(col,0.0),vec3(1.0/1.8));
  gl_FragColor=vec4(col,1.0);
}
