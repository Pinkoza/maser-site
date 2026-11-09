/* Maser Construction: scroll-driven 3D city. Home = camera flight, other pages = ambient skyline. */
(function () {
  'use strict';
  var cv = document.getElementById('c');
  if (!cv || !window.THREE) { return; }
  var T = THREE;
  var home = cv.getAttribute('data-mode') === 'home';
  var mobile = Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer:coarse)').matches;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var r;
  try { r = new T.WebGLRenderer({ canvas: cv, antialias: !mobile, alpha: true }); }
  catch (e) { cv.style.display = 'none'; return; }
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  r.setClearColor(0x000000, 0);
  var sc = new T.Scene();
  var cam = new T.PerspectiveCamera(48, 1, 0.1, 500);

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rand = rng(20261108);
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- geometry builder (edges + faces, baked world positions) ---------- */
  function Builder() { this.lp = []; this.lph = []; this.fp = []; this.fph = []; this.fsh = []; }
  Builder.prototype.box = function (cx, cz, w, d, y0, y1, rot, ph) {
    var c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2, i;
    var base = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    var V = [];
    for (i = 0; i < 4; i++) V.push([cx + base[i][0] * c - base[i][1] * s, y0, cz + base[i][0] * s + base[i][1] * c]);
    for (i = 0; i < 4; i++) V.push([V[i][0], y1, V[i][2]]);
    var E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (i = 0; i < E.length; i++) {
      this.lp.push(V[E[i][0]][0], V[E[i][0]][1], V[E[i][0]][2], V[E[i][1]][0], V[E[i][1]][1], V[E[i][1]][2]);
      this.lph.push(ph, ph);
    }
    var F = [[0, 1, 5, 4, 0.55], [1, 2, 6, 5, 0.8], [2, 3, 7, 6, 0.5], [3, 0, 4, 7, 0.7], [4, 5, 6, 7, 1.0]];
    var tri = [0, 1, 2, 0, 2, 3];
    for (i = 0; i < F.length; i++) {
      var q = [V[F[i][0]], V[F[i][1]], V[F[i][2]], V[F[i][3]]];
      for (var k = 0; k < 6; k++) { var v = q[tri[k]]; this.fp.push(v[0], v[1], v[2]); this.fph.push(ph); this.fsh.push(F[i][4]); }
    }
  };
  function mkGeo(pos, ph, sh) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new T.Float32BufferAttribute(ph, 1));
    var s = sh; if (!s) { s = []; for (var i = 0; i < ph.length; i++) s.push(1); }
    g.setAttribute('aShade', new T.Float32BufferAttribute(s, 1));
    return g;
  }

  /* ---------- shared uniforms + shaders ---------- */
  var U = {
    uGrow: { value: 0 }, uScan: { value: 2 }, uTime: { value: 0 },
    uRip: { value: new T.Vector4(0, 0, -50, 0) },
    uC1: { value: new T.Color(0xc8ff3d) }, uC2: { value: new T.Color(0x4de1ff) }, uC3: { value: new T.Color(0xff6b4a) }
  };
  var VS = [
    'attribute float aPhase; attribute float aShade;',
    'uniform float uGrow; uniform vec4 uRip;',
    'varying float vY; varying float vShade; varying float vDist;',
    'void main(){',
    ' vec3 p=position;',
    ' float g=smoothstep(aPhase*.6,aPhase*.6+.4,uGrow);',
    ' p.y*=g;',
    ' float d=distance(position.xz,uRip.xy); float x=(d-uRip.z)*.8;',
    ' p.y+=exp(-x*x)*uRip.w*step(.01,position.y)*g;',
    ' vY=p.y; vShade=aShade;',
    ' vec4 mv=modelViewMatrix*vec4(p,1.); vDist=-mv.z;',
    ' gl_Position=projectionMatrix*mv;',
    '}'].join('\n');
  var HEAD = 'uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uScan; uniform float uHero; uniform float uAlpha;\nvarying float vY; varying float vShade; varying float vDist;\n';
  var FL = HEAD + [
    'void main(){',
    ' float below=1.-smoothstep(uScan-.2,uScan+.2,vY);',
    ' float x=(vY-uScan)*1.8; float near=exp(-x*x);',
    ' vec3 base=mix(uC2,uC1,clamp(vY/9.,0.,1.));',
    ' base=mix(base,vec3(1.),uHero*.25);',
    ' vec3 col=base*(.5+.7*below)+uC3*near*1.4;',
    ' float fade=exp(-vDist*.03);',
    ' float a=(.28+.5*below+.6*near)*(1.+uHero*.7)*fade*uAlpha;',
    ' gl_FragColor=vec4(col,a);',
    '}'].join('\n');
  var FF = HEAD + [
    'void main(){',
    ' float below=1.-smoothstep(uScan-.2,uScan+.2,vY);',
    ' float x=(vY-uScan)*1.8; float near=exp(-x*x);',
    ' vec3 tint=mix(uC2,uC1,clamp(vY/9.,0.,1.))*vShade;',
    ' float a=(.03+.34*below+.18*near)*(1.+uHero*.6);',
    ' a*=exp(-vDist*.03)*uAlpha;',
    ' gl_FragColor=vec4(tint+uC3*near*.4,a);',
    '}'].join('\n');
  function mat(frag, hero, fill) {
    var u = Object.assign({}, U, { uHero: { value: hero }, uAlpha: { value: 1 } });
    return new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: frag, transparent: true, depthWrite: false, blending: fill ? T.NormalBlending : T.AdditiveBlending });
  }

  /* ---------- ground ---------- */
  var gmat = new T.ShaderMaterial({
    uniforms: { uCol: { value: new T.Color(0x4de1ff) }, uRip: U.uRip },
    vertexShader: 'varying vec2 vW; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vW=wp.xz; gl_Position=projectionMatrix*viewMatrix*wp; }',
    fragmentShader: [
      'uniform vec3 uCol; uniform vec4 uRip; varying vec2 vW;',
      'float grid(vec2 p,float s){ vec2 q=p/s; vec2 g=abs(fract(q-.5)-.5)/max(fwidth(q),vec2(.0001)); return 1.-min(min(g.x,g.y),1.); }',
      'void main(){',
      ' float r=length(vW); float fade=exp(-r*.026);',
      ' float g=grid(vW,2.)*.45+grid(vW,10.)*.8;',
      ' float x=(distance(vW,uRip.xy)-uRip.z)*.8; float rip=exp(-x*x)*uRip.w;',
      ' float glow=exp(-r*r*.012)*.22;',
      ' vec3 col=mix(uCol,vec3(1.,.42,.29),clamp(rip,0.,1.));',
      ' float a=g*.55*fade+rip*.7*fade+glow;',
      ' gl_FragColor=vec4(col,clamp(a,0.,1.));',
      '}'].join('\n'),
    transparent: true, depthWrite: false, extensions: { derivatives: true }
  });
  var ground = new T.Mesh(new T.PlaneGeometry(300, 300), gmat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.renderOrder = 0;
  sc.add(ground);

  /* ---------- the city ---------- */
  var cityB = new Builder();
  var S = mobile ? 2.5 : 2.1, N = mobile ? 7 : 10, gx, gz;
  var CTX = -7.6, CTZ = 5.6; /* Calgary Tower nod */
  for (gx = -N; gx <= N; gx++) {
    for (gz = -N; gz <= N; gz++) {
      var x = gx * S + (rand() - 0.5) * 0.35, z = gz * S + (rand() - 0.5) * 0.35;
      var dd = Math.hypot(x, z);
      if (dd < 4.8) continue;
      if (rand() < 0.12) continue;
      if (Math.hypot(x - CTX, z - CTZ) < 1.6) continue;
      var down = Math.exp(-dd * dd / 90);
      var h = 0.5 + rand() * (1.1 + 2.6 * down) + (rand() < 0.07 ? rand() * 3.5 * (0.3 + down) : 0);
      var w = 1 + rand() * 0.65, d = 1 + rand() * 0.65;
      cityB.box(x, z, w, d, 0, h, 0, Math.min(1, 0.15 + dd / 32 + rand() * 0.15));
    }
  }
  cityB.box(CTX, CTZ, 0.3, 0.3, 0, 8.6, 0.4, 0.3);
  cityB.box(CTX, CTZ, 1.15, 1.15, 7.0, 7.7, 0.785, 0.3);
  cityB.box(CTX, CTZ, 0.09, 0.09, 8.6, 11, 0, 0.3);

  var heroB = new Builder(), FLN = 14, FHT = 0.64, i;
  for (i = 0; i < FLN; i++) {
    var k = i / (FLN - 1), sk = 1 + 0.22 * Math.sin(k * Math.PI) - 0.38 * k;
    heroB.box(0, 0, 2.8 * sk, 2.1 * sk, i * FHT, (i + 1) * FHT - 0.07, k * 1.1, (i / FLN) * 0.5);
  }
  var TOWER_H = FLN * FHT;

  var cityFill = new T.Mesh(mkGeo(cityB.fp, cityB.fph, cityB.fsh), mat(FF, 0, true)); cityFill.renderOrder = 1; cityFill.frustumCulled = false;
  var cityLine = new T.LineSegments(mkGeo(cityB.lp, cityB.lph), mat(FL, 0, false)); cityLine.renderOrder = 2; cityLine.frustumCulled = false;
  var heroFill = new T.Mesh(mkGeo(heroB.fp, heroB.fph, heroB.fsh), mat(FF, 1, true)); heroFill.renderOrder = 1; heroFill.frustumCulled = false;
  var heroLine = new T.LineSegments(mkGeo(heroB.lp, heroB.lph), mat(FL, 1, false)); heroLine.renderOrder = 2; heroLine.frustumCulled = false;
  sc.add(cityFill, cityLine, heroFill, heroLine);

  /* ---------- MEP veins: glowing helices with travelling pulses ---------- */
  var HN = 3, PN = 36;
  function helix(h, s) {
    var a = (s * 2.4 + h / HN) * Math.PI * 2, rad = 0.6 + 0.1 * Math.sin(s * Math.PI * 3 + h);
    return [Math.cos(a) * rad, s * TOWER_H, Math.sin(a) * rad];
  }
  var hl = [], h2, j;
  for (h2 = 0; h2 < HN; h2++) { for (j = 0; j < 90; j++) { var a1 = helix(h2, j / 90), a2 = helix(h2, (j + 1) / 90); hl.push(a1[0], a1[1], a1[2], a2[0], a2[1], a2[2]); } }
  var hGeo = new T.BufferGeometry(); hGeo.setAttribute('position', new T.Float32BufferAttribute(hl, 3));
  var hMat = new T.LineBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  var hLines = new T.LineSegments(hGeo, hMat); hLines.renderOrder = 3; sc.add(hLines);
  var mepPos = new Float32Array(HN * PN * 3);
  var mGeo = new T.BufferGeometry(); mGeo.setAttribute('position', new T.BufferAttribute(mepPos, 3));
  var mMat = new T.PointsMaterial({ color: 0xffb08a, size: mobile ? 0.2 : 0.16, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  var mPts = new T.Points(mGeo, mMat); mPts.frustumCulled = false; mPts.renderOrder = 3; sc.add(mPts);

  /* ---------- permit seal on top of the tower ---------- */
  function circle(rad, n) { var p = []; for (var q = 0; q < n; q++) { var a = q / n * Math.PI * 2; p.push(Math.cos(a) * rad, 0, Math.sin(a) * rad); } return p; }
  function loopGeo(rad, n) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(circle(rad, n), 3)); return g; }
  var sealMat = new T.LineBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  var seal = new T.Group();
  seal.add(new T.LineLoop(loopGeo(1.15, 72), sealMat), new T.LineLoop(loopGeo(0.8, 56), sealMat));
  for (i = 0; i < 4; i++) { var sg = new T.BufferGeometry(); var an = i * Math.PI / 2; sg.setAttribute('position', new T.Float32BufferAttribute([Math.cos(an) * 1.15, 0, Math.sin(an) * 1.15, Math.cos(an) * 1.5, 0, Math.sin(an) * 1.5], 3)); seal.add(new T.Line(sg, sealMat)); }
  seal.position.y = TOWER_H + 0.7; seal.scale.setScalar(0.001); sc.add(seal);

  /* ---------- "serving Canada": expanding rings + beacons ---------- */
  var rings = [], rg = loopGeo(1, 128);
  for (i = 0; i < 4; i++) { var rm = new T.LineBasicMaterial({ color: 0xc8ff3d, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }); var rl = new T.LineLoop(rg, rm); rl.position.y = 0.02; sc.add(rl); rings.push(rl); }
  var bp = [], bc = [];
  for (i = 0; i < 9; i++) {
    var ba = rand() * Math.PI * 2, br = 30 + rand() * 18, bh = 9 + rand() * 20, bx = Math.cos(ba) * br, bz = Math.sin(ba) * br;
    bp.push(bx, 0, bz, bx, bh, bz); bc.push(0.78, 1, 0.24, 0, 0, 0);
  }
  var bGeo = new T.BufferGeometry(); bGeo.setAttribute('position', new T.Float32BufferAttribute(bp, 3)); bGeo.setAttribute('color', new T.Float32BufferAttribute(bc, 3));
  var bMat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  var beacons = new T.LineSegments(bGeo, bMat); beacons.renderOrder = 3; sc.add(beacons);

  /* ---------- mountains + stars ---------- */
  var mp = [];
  for (i = 0; i < 17; i++) {
    var ang = Math.PI * (0.85 + rand() * 0.8), rad = 70 + rand() * 40, hg = 10 + rand() * 16, rr = hg * (0.55 + rand() * 0.3);
    var cg = new T.ConeGeometry(rr, hg, 5 + Math.floor(rand() * 2), 1, true);
    cg.rotateY(rand() * 3); cg.translate(Math.cos(ang) * rad, hg / 2, Math.sin(ang) * rad);
    var eg = new T.EdgesGeometry(cg, 15), arr = eg.attributes.position.array;
    for (j = 0; j < arr.length; j++) mp.push(arr[j]);
  }
  var mtGeo = new T.BufferGeometry(); mtGeo.setAttribute('position', new T.Float32BufferAttribute(mp, 3));
  var mtn = new T.LineSegments(mtGeo, new T.LineBasicMaterial({ color: 0x8a96ff, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false }));
  mtn.renderOrder = 0; sc.add(mtn);
  var sp = [];
  for (i = 0; i < 520; i++) { var sa = rand() * Math.PI * 2, se = 0.08 + rand() * 1.2, sr = 220; sp.push(Math.cos(sa) * Math.cos(se) * sr, Math.sin(se) * sr, Math.sin(sa) * Math.cos(se) * sr); }
  var stGeo = new T.BufferGeometry(); stGeo.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
  var stars = new T.Points(stGeo, new T.PointsMaterial({ color: 0xcdd8ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false }));
  sc.add(stars);

  /* ---------- camera path ---------- */
  var K = [
    [[15, 9, 17], [0, 4.2, 0]],
    [[8.2, 6.6, 9.4], [0, 5.2, 0]],
    [[-6.8, 3.4, 6.6], [0, 6.4, 0]],
    [[3.4, 5.6, 4.2], [0, 5.2, 0]],
    [[11.5, 8.5, 11.5], [0, 5, 0]],
    [[0, 26, 26], [0, 1, 0]],
    [[14, 6.8, 11], [0, 4.4, 0]]
  ];
  var cp = new T.CatmullRomCurve3(K.map(function (q) { return new T.Vector3(q[0][0], q[0][1], q[0][2]); }), false, 'centripetal');
  var ct = new T.CatmullRomCurve3(K.map(function (q) { return new T.Vector3(q[1][0], q[1][1], q[1][2]); }), false, 'centripetal');
  var pv = new T.Vector3(), tv = new T.Vector3();
  var SIDE = [1, 1, -1, 1, -1, 1, 0];
  function sideAt(k) { var a = Math.floor(clamp(k, 0, SIDE.length - 1)), b = Math.min(SIDE.length - 1, a + 1), f = clamp(k - a, 0, 1); f = f * f * (3 - 2 * f); return SIDE[a] + (SIDE[b] - SIDE[a]) * f; }

  /* ---------- scroll -> section progress ---------- */
  var secs = [].slice.call(document.querySelectorAll('[data-k]')), cent = [];
  function measure() { cent = secs.map(function (s) { var b = s.getBoundingClientRect(); return b.top + window.scrollY + b.height / 2; }); }
  function kpNow() {
    if (!home || !cent.length) return 0;
    var y = window.scrollY + innerHeight / 2;
    if (y <= cent[0]) return 0;
    for (var q = 0; q < cent.length - 1; q++) { if (y < cent[q + 1]) return q + (y - cent[q]) / (cent[q + 1] - cent[q]); }
    return cent.length - 1;
  }
  var stampEl = document.getElementById('stamp'), labEl = document.getElementById('lab');
  var dots = [].slice.call(document.querySelectorAll('.dots a')), idx = -1;
  function setIdx(n) {
    if (n === idx) return; idx = n;
    if (stampEl) stampEl.classList.toggle('on', n === 4);
    if (labEl && secs[n]) labEl.textContent = secs[n].getAttribute('data-label') || '';
    dots.forEach(function (d, q) { d.classList.toggle('on', q === n); });
  }

  /* ---------- interaction: shockwave ---------- */
  var rip = { x: 0, z: 0, t0: -100 }, clock = 0;
  function ripple(x, z) { rip.x = x; rip.z = z; rip.t0 = clock; }
  var ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
  function clickRipple(cx, cy) {
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    if (ray.ray.intersectPlane(plane, hit) && hit.length() < 90) ripple(hit.x, hit.z); else ripple((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  }
  addEventListener('click', function (e) {
    if (reduce) return;
    if (e.target.closest && e.target.closest('a,button,input,textarea,select,summary,label')) return;
    clickRipple(e.clientX, e.clientY);
  });
  var mx = 0, my = 0;
  addEventListener('pointermove', function (e) { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });

  function size() {
    var w = innerWidth, h = innerHeight;
    r.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 1 ? 64 : 48; cam.updateProjectionMatrix(); measure();
  }
  addEventListener('resize', size); size();
  addEventListener('load', measure);
  if (window.ResizeObserver) { new ResizeObserver(measure).observe(document.body); }

  /* ---------- loop ---------- */
  var last = performance.now(), kpS = 0, scanV = 3, introDone = reduce, introT = 0, nextAuto = 6;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    var tt = reduce ? 0 : clock;
    introT += dt;
    var ig = reduce ? 1 : 1 - Math.pow(1 - clamp(introT / 3.6, 0, 1), 3);
    U.uGrow.value = ig;
    if (!introDone && introT > 2.2) { introDone = true; ripple(0, 0); }
    if (!reduce && clock > nextAuto) { nextAuto = clock + 7 + Math.random() * 4; var aa = Math.random() * 6.28, ar = 6 + Math.random() * 9; ripple(Math.cos(aa) * ar, Math.sin(aa) * ar); }

    var kp = kpNow(); kpS += (kp - kpS) * Math.min(1, dt * 4);
    if (home) setIdx(Math.round(kpS));

    var scanT;
    if (!home) scanT = 5 + 4 * Math.sin(tt * 0.3);
    else if (kpS < 0.8) scanT = 3 + 1.8 * Math.sin(tt * 0.5);
    else if (kpS < 4.5) scanT = -0.5 + (kpS - 0.8) / 3.7 * 15;
    else scanT = 16;
    scanV += (scanT - scanV) * Math.min(1, dt * 3);
    U.uScan.value = scanV;

    var age = clock - rip.t0;
    U.uRip.value.set(rip.x, rip.z, age * 9, age < 7 ? 1.1 * Math.exp(-age * 1.1) : 0);

    var mepA = home ? sstep(2.4, 3, kpS) * (1 - sstep(3.7, 4.3, kpS)) : 0;
    var sealA = home ? sstep(3.7, 4.1, kpS) * (1 - sstep(5.2, 5.8, kpS)) : 0;
    var ringA = home ? sstep(4.6, 5.3, kpS) : 0.35;
    hMat.opacity = mepA * 0.45; mMat.opacity = mepA;
    for (var h = 0; h < HN; h++) {
      for (var q = 0; q < PN; q++) {
        var s = (q / PN + clock * 0.14 * (h % 2 ? 1 : -1) + h * 0.13) % 1; if (s < 0) s += 1;
        var hp = helix(h, s), o = (h * PN + q) * 3; mepPos[o] = hp[0]; mepPos[o + 1] = hp[1]; mepPos[o + 2] = hp[2];
      }
    }
    mGeo.attributes.position.needsUpdate = true;
    seal.scale.setScalar(Math.max(0.001, sealA)); seal.rotation.y = tt * 0.9; sealMat.opacity = sealA;
    for (var m = 0; m < rings.length; m++) {
      var rr2 = ((tt * 0.09 + m / rings.length) % 1), R = 4 + rr2 * 62;
      rings[m].scale.set(R, 1, R); rings[m].material.opacity = Math.min(1, (1 - rr2) * (1 - rr2) * ringA * 1.5);
    }
    bMat.opacity = Math.min(1, ringA * 1.4);
    stars.rotation.y = tt * 0.004;

    if (home) {
      var tk = clamp(kpS / (K.length - 1), 0, 1);
      cp.getPoint(tk, pv); ct.getPoint(tk, tv);
    } else {
      pv.set(15, 9, 17); tv.set(0, 3.6, 0);
    }
    if (!reduce) { var fz = 1 + (1 - ig) * 0.9; pv.x *= fz; pv.z *= fz; pv.y += (1 - ig) * 10; }
    var sway = (reduce ? 0 : Math.sin(tt * 0.12) * 0.1 + (home ? 0 : tt * 0.035)) + mx * 0.22;
    var cs = Math.cos(sway), sn = Math.sin(sway), px = pv.x * cs + pv.z * sn, pz = -pv.x * sn + pv.z * cs;
    cam.position.set(px, pv.y + (reduce ? 0 : -my * 0.9), pz);
    var tx = tv.x * cs + tv.z * sn, tz = -tv.x * sn + tv.z * cs;
    cam.lookAt(tx, tv.y, tz);
    if (home) {
      var vw = innerWidth, vh = innerHeight;
      if (vw > 900) cam.setViewOffset(vw, vh, -sideAt(kpS) * vw * 0.2, 0, vw, vh); else cam.setViewOffset(vw, vh, 0, vh * 0.16, vw, vh);
    }
    r.render(sc, cam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.documentElement.classList.add('gl');
})();
