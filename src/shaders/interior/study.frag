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

  float floorY=0.72;
  float ceilY=0.08;
  float shelfR=0.28; // bookshelf occupies left 28%
  float deskL=0.32,deskR=0.80;
  float deskY=floorY-0.22,deskH=0.08;

  // ── Base wall: cool sage (study) ──
  vec3 col=mix(vec3(0.042,0.050,0.040), vec3(0.060,0.070,0.055), uv.y);

  // ── Ceiling with downlights ──
  if(uv.y<ceilY){
    col=vec3(0.038,0.044,0.036);
    // Two downlights
    for(int i=0;i<2;i++){
      float lx=0.35+float(i)*0.30;
      float d=length(uv-vec2(lx,0.0));
      col+=vec3(0.784,0.820,0.700)*exp(-d*9.0)*0.45;
    }
  }

  // ── Bookshelf (left wall) ──
  if(uv.x<shelfR && uv.y>ceilY && uv.y<floorY){
    vec3 shelf=vec3(0.038,0.045,0.035);
    // Shelf horizontal lines
    float sl=smoothstep(0.006,0.0,abs(fract(uv.y*7.0)-0.5));
    shelf+=vec3(0.9,0.85,0.8)*sl*0.15;
    // Books: coloured spines
    for(int b=0;b<14;b++){
      float bx=shelfR*(float(b)/14.0+hash(vec2(float(b),1.0))*0.05);
      float bw=0.012+hash(vec2(float(b),2.0))*0.006;
      float bh=hash(vec2(float(b),3.0))*0.08+0.05;
      float sRow=floor(uv.y*7.0)/7.0+0.02;
      float inBook=step(abs(uv.x-bx),bw)*step(abs(uv.y-(sRow+bh*0.5)),bh*0.5);
      float hue=hash(vec2(float(b),4.0));
      vec3 bc=mix(vec3(0.9,0.85,0.7)*hue, vec3(0.6,0.75,0.6)*(1.0-hue), step(0.5,hue));
      shelf=mix(shelf,bc*0.35,inBook);
    }
    // Accent: sage glow on spine
    shelf+=vec3(0.604,0.667,0.533)*0.04;
    col=shelf;
  }

  // ── Steel desk ──
  bool inDesk = uv.x>deskL && uv.x<deskR && uv.y>deskY && uv.y<deskY+deskH;
  if(inDesk){
    float hl=noise(vec2(uv.x*55.0+T*0.003, uv.y*0.5))*0.5+0.5;
    vec3 steel=vec3(0.065,0.072,0.060)+vec3(0.030)*hl;
    // Hairlines
    float hline=noise(vec2(uv.x*1.1,uv.y*0.4+T*0.005))*0.5+0.5;
    steel+=hline*0.02;
    col=steel;
  }

  // ── Work lamp (desk lamp, right side of desk) ──
  vec2 lampPos=vec2(0.72,deskY);
  float lampD=length(uv-lampPos);
  float lampGlow=exp(-lampD*10.0)*0.6;
  col+=vec3(0.9,0.88,0.72)*lampGlow;
  // Focused cone on desk surface
  if(uv.y>deskY-0.02 && uv.y<deskY+deskH+0.01){
    float cone=exp(-abs(uv.x-0.70)*12.0)*0.3;
    col+=vec3(0.9,0.88,0.72)*cone;
  }

  // ── Downlight cones ──
  for(int i=0;i<2;i++){
    float lx=0.35+float(i)*0.30;
    float cx=smoothstep(0.18,0.0,abs(uv.x-lx));
    float cy=smoothstep(ceilY,floorY,uv.y)*0.3;
    col+=vec3(0.784,0.820,0.700)*cx*cy*0.08;
  }

  // ── Floor: dark wood ──
  if(uv.y>floorY){
    float rings=sin((uv.x*9.0+fbm(uv*2.0)*1.4)*3.14)*0.5+0.5;
    vec3 wood=mix(vec3(0.030,0.025,0.015),vec3(0.048,0.038,0.022),rings);
    wood+=noise(uv*vec2(180.0,6.0))*0.015;
    // Lamp reflection on floor
    float rf=exp(-length(vec2(uv.x-lampPos.x,(uv.y-floorY)*2.5))*6.0)*0.3;
    wood+=vec3(0.784,0.820,0.700)*rf;
    col=wood;
  }

  // ── Vignette ──
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.42*dot(vd,vd);

  col=pow(max(col,0.0),vec3(1.0/1.8));
  gl_FragColor=vec4(col,1.0);
}
