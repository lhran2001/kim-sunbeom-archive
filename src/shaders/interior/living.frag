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

  float floorY=0.68;
  float ceilY=0.10;

  // ── Base: warm amber wall ──
  vec3 wallCol=mix(vec3(0.055,0.042,0.025), vec3(0.080,0.062,0.035), uv.y);
  vec3 col=wallCol;

  // ── Ceiling ──
  if(uv.y<ceilY){
    col=vec3(0.048,0.038,0.022);
    // Pendant light position: top-centre area
    float pend=smoothstep(0.08,0.0,length(uv-vec2(0.5,0.0)));
    col+=vec3(0.784,0.659,0.494)*pend*0.5;
  }

  // ── Back wall: plaster + natural light window ──
  if(uv.y>ceilY && uv.y<floorY){
    vec3 plaster=mix(vec3(0.065,0.050,0.030),vec3(0.090,0.070,0.042),uv.y*0.5);
    float tex=noise(uv*vec2(60.0,40.0))*0.03;
    plaster+=tex;

    // Window (right side): bright natural light bleed
    float winX=smoothstep(0.62,0.80,uv.x);
    float winY=smoothstep(0.15,0.22,uv.y)*smoothstep(0.62,0.56,uv.y);
    vec3 sunlight=vec3(0.9,0.78,0.55)*1.2;
    plaster=mix(plaster, sunlight, winX*winY*0.85);
    // Glow spill from window
    float glow=winX*smoothstep(0.72,0.5,uv.y)*0.4;
    plaster+=vec3(0.784,0.659,0.494)*glow;

    col=plaster;
  }

  // ── Sofa silhouette (centre-left) ──
  float sofaX=smoothstep(0.12,0.14,uv.x)*smoothstep(0.68,0.70,uv.x);
  float sofaY=smoothstep(floorY-0.18,floorY-0.20,uv.y)*smoothstep(floorY,floorY-0.01,uv.y);
  if(sofaX*sofaY>0.5){
    // Sofa: warm fabric, slightly darker than wall
    vec3 fabric=vec3(0.068,0.052,0.032);
    float fab=fbm(uv*12.0+T*0.002)*0.06;
    fabric+=fab;
    // Cushion highlight
    float cushX=abs(fract(uv.x*3.5)-0.5);
    float cush=smoothstep(0.18,0.0,cushX)*0.08;
    fabric+=vec3(0.784,0.659,0.494)*cush;
    col=fabric;
  }

  // ── Pendant lamp glow ──
  float lampDist=length(uv-vec2(0.5,ceilY));
  float lampGlow=exp(-lampDist*8.0)*0.55;
  col+=vec3(0.784,0.659,0.494)*lampGlow;
  // Light cone downward
  float coneX=smoothstep(0.22,0.0,abs(uv.x-0.5));
  float coneY=smoothstep(ceilY,floorY,uv.y);
  col+=vec3(0.784,0.659,0.494)*coneX*coneY*0.08;

  // ── Wooden floor ──
  if(uv.y>floorY){
    // Wood grain base
    float rings=sin((uv.x*7.0+fbm(uv*2.5)*1.6)*3.14)*0.5+0.5;
    vec3 wood=mix(vec3(0.062,0.042,0.020),vec3(0.088,0.062,0.030),rings);
    wood+=noise(uv*vec2(200.0,8.0))*0.02;
    // Floor reflection of lamp
    float reflDist=length(vec2(uv.x-0.5, (uv.y-floorY)*3.0));
    float refl=exp(-reflDist*5.0)*0.35;
    wood+=vec3(0.784,0.659,0.494)*refl;
    // Board seams
    float seam=smoothstep(0.012,0.0,abs(fract(uv.x*9.0)-0.5));
    wood-=seam*0.04;
    col=wood;
  }

  // ── Vignette ──
  vec2 vd=(vUv-0.5)*2.0;
  col*=1.0-0.40*dot(vd,vd);

  col=pow(max(col,0.0),vec3(1.0/1.8));
  gl_FragColor=vec4(col,1.0);
}
