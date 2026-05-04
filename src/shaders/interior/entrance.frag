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

  // ── Perspective warp: corridor depth ──
  // Map uv to corridor: centre = vanishing point
  vec2 pUv=uv;

  // Ceiling plane
  float ceilY=0.15;
  // Floor plane
  float floorY=0.72;
  // Side wall centres
  float wallL=0.20, wallR=0.80;

  // Background colour — gunmetal cold
  vec3 col=vec3(0.045,0.050,0.060);

  // ── Ceiling: linear LED strip ──
  float ceilMask=smoothstep(ceilY+0.005,ceilY,uv.y);
  col=mix(col, vec3(0.088,0.095,0.115), ceilMask);
  // LED strip along centre of ceiling
  float ledX=smoothstep(0.14,0.0,abs(uv.x-0.5));
  float ledY=smoothstep(0.016,0.0,abs(uv.y-0.965));
  // ceiling LED
  float cLed=smoothstep(0.015,0.0,abs(uv.y-ceilY+0.005))*ledX;
  col=mix(col, vec3(0.494,0.643,0.784)*1.4+vec3(0.6,0.7,0.9), cLed);

  // ── Walls: hairline steel panels ──
  bool inWallL = uv.x<wallL && uv.y>ceilY && uv.y<floorY;
  bool inWallR = uv.x>wallR && uv.y>ceilY && uv.y<floorY;

  float hlL=noise(vec2(uv.y*0.6+T*0.003, uv.x*1.2))*0.5+0.5;
  float hlR=noise(vec2(uv.y*0.6+T*0.003, uv.x*1.2))*0.5+0.5;

  if(inWallL){
    vec3 steel=vec3(0.060,0.068,0.082)+vec3(0.025)*hlL;
    // Panel seams
    float seam=smoothstep(0.006,0.0,abs(fract(uv.y*4.0)-0.5));
    steel+=vec3(0.494,0.643,0.784)*seam*0.12;
    col=steel;
  }
  if(inWallR){
    vec3 steel=vec3(0.060,0.068,0.082)+vec3(0.025)*hlR;
    float seam=smoothstep(0.006,0.0,abs(fract(uv.y*4.0)-0.5));
    steel+=vec3(0.494,0.643,0.784)*seam*0.12;
    col=steel;
  }

  // ── Back wall (centre) ──
  bool inBack = uv.x>wallL && uv.x<wallR && uv.y>ceilY && uv.y<floorY;
  if(inBack){
    vec3 back=vec3(0.052,0.058,0.070);
    float hl=noise(vec2(uv.x*1.0+T*0.002, uv.y*0.8))*0.08;
    back+=hl;
    // Recessed panel lines
    float px=smoothstep(0.004,0.0,abs(fract(uv.x*6.0+0.5)-0.5));
    float py=smoothstep(0.004,0.0,abs(fract(uv.y*3.5)-0.5));
    back+=vec3(0.494,0.643,0.784)*(px+py)*0.07;
    col=back;
  }

  // ── Ceiling LED glow (soft spread on walls) ──
  float glowX=1.0-abs(uv.x-0.5)*2.0;
  float glowY=max(0.0,1.0-(uv.y-ceilY)*6.0);
  col+=vec3(0.494,0.643,0.784)*glowX*glowY*0.06;

  // ── Floor: polished concrete ──
  if(uv.y>floorY){
    vec3 concrete=vec3(0.038,0.040,0.045);
    float grain=noise(uv*vec2(80.0,40.0))*0.04;
    concrete+=grain;

    // Floor reflection of LED
    float reflLed=smoothstep(0.14,0.0,abs(uv.x-0.5))*smoothstep(floorY+0.0,floorY+0.18,uv.y);
    concrete+=vec3(0.494,0.643,0.784)*reflLed*0.12*(1.0-uv.y);

    // Subtle grid
    float gx=smoothstep(0.015,0.0,abs(fract(uv.x*8.0)-0.5));
    float gy=smoothstep(0.015,0.0,abs(fract((uv.y-floorY)*5.0+0.5)-0.5));
    concrete+=vec3(0.06)*(gx+gy)*0.5;

    col=concrete;
  }

  // ── Atmospheric depth: linear fog to vanishing ──
  float fog=smoothstep(0.85,0.18,abs(uv.x-0.5)*2.0)*smoothstep(0.25,0.68,uv.y);
  col=mix(col,vec3(0.494,0.643,0.784)*0.04+col,fog*0.15);

  // ── Vignette ──
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.45*dot(vd,vd);

  // Gamma
  col=pow(max(col,0.0),vec3(1.0/1.8));
  gl_FragColor=vec4(col,1.0);
}
