/* =========================================================
 * models.js — 3D 模型庫：武器棋子 + 棋盤場景（Three.js r128）
 * ========================================================= */

const CELL = 10, GAP_EXTRA = 3.5;

function worldPos(r, c) {
  const x = (c - 2) * CELL;
  let z = (r - 5.5) * CELL;
  z += (r >= 6 ? GAP_EXTRA : -GAP_EXTRA);
  return { x, z };
}

/* ---------- 材質快取 ---------- */
const _matCache = new Map();
function M(color, opts) {
  const k = color + JSON.stringify(opts || {});
  if (!_matCache.has(k))
    _matCache.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.25 }, opts)));
  return _matCache.get(k);
}

function box(w, h, d, color, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
  m.position.set(x || 0, y || 0, z || 0);
  if (ry) m.rotation.y = ry;
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), M(color));
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  return m;
}
function cone(r, h, color, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 12), M(color));
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  return m;
}

/* 平面延伸翼（Shape → Extrude，thickness 薄） */
function wingShape(pts, color, thickness) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness || 0.18, bevelEnabled: false });
  const m = new THREE.Mesh(g, M(color));
  m.rotation.x = -Math.PI / 2;   // shape 的 y → 世界 -z（機首朝 -z）
  m.castShadow = true;
  return m;
}

/* ---------- 陣營配色 ---------- */
const SIDE_COLOR = {
  US: { main: 0x8a7f5f, dark: 0x5c5540, accent: 0x3b6ea5, jet: 0x4c525a, ring: 0x2f6fbf },
  CN: { main: 0x5d7048, dark: 0x405030, accent: 0xc03a2b, jet: 0x555c50, ring: 0xcf3a2a },
};

/* ============ 各式武器模型 ============ */

function mBomberB2(C) {
  const g = new THREE.Group();
  const body = wingShape([[0, -4.6], [1.1, -3.2], [5.4, 2.6], [5.4, 3.4], [3.4, 2.1], [1.7, 3.4], [0, 2.2],
                          [-1.7, 3.4], [-3.4, 2.1], [-5.4, 3.4], [-5.4, 2.6], [-1.1, -3.2]], 0x2e3238, 0.55);
  body.position.y = 2.6;
  g.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8), M(0x3a3f46));
  hump.scale.set(1, 0.42, 1.9); hump.position.set(0, 3.1, -1.2); hump.castShadow = true;
  g.add(hump);
  g.userData.hover = true; g.userData.hoverAmp = 0.5;
  return g;
}

function mBomberH6(C) {
  const g = new THREE.Group();
  const fus = cyl(0.75, 0.75, 7.6, 0x98a0a8, 0, 2.8, 0);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), M(0xb8ccd8, { metalness: 0.5 }));
  nose.position.set(0, 2.8, -3.9); nose.scale.set(1, 1, 1.5); g.add(nose);
  const tailc = cone(0.72, 1.8, 0x98a0a8, 0, 2.8, 4.4); tailc.rotation.x = Math.PI / 2; g.add(tailc);
  const wing = box(11, 0.16, 2.1, 0x8b939b, 0, 2.9, 0.2); wing.rotation.y = 0; g.add(wing);
  for (const s of [-1, 1]) {
    const nac = cyl(0.42, 0.42, 2.6, 0x6d757d, s * 1.7, 2.55, 0.3);
    nac.rotation.x = Math.PI / 2; g.add(nac);
  }
  g.add(box(3.6, 0.14, 1.3, 0x8b939b, 0, 3.3, 4.5));
  const fin = box(0.14, 1.7, 1.4, 0xc03a2b, 0, 3.9, 4.7); g.add(fin);
  g.userData.hover = true; g.userData.hoverAmp = 0.5;
  return g;
}

function mFighter(C, variant) {
  // variant: 'f22' | 'f35' | 'j20' | 'j16'
  const g = new THREE.Group();
  const col = variant === 'j20' ? 0x3d4340 : (variant === 'j16' ? 0x5a6258 : C.jet);
  const fus = cyl(0.32, 0.62, 5.6, col, 0, 2.6, 0.2);
  fus.rotation.x = -Math.PI / 2; g.add(fus);
  const nose = cone(0.32, 1.5, col, 0, 2.6, -3.3); nose.rotation.x = -Math.PI / 2; g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), M(0x2b4b66, { metalness: 0.6, roughness: 0.3 }));
  canopy.scale.set(0.85, 0.6, 1.6); canopy.position.set(0, 3.15, -1.5); g.add(canopy);

  let wing;
  if (variant === 'j20') {  // 三角翼 + 鴨翼
    wing = wingShape([[0.5, -0.4], [3.6, 2.2], [3.6, 2.8], [0.5, 2.6], [-0.5, 2.6], [-3.6, 2.8], [-3.6, 2.2], [-0.5, -0.4]], col);
    const can = wingShape([[0.45, -2.1], [1.9, -1.5], [1.9, -1.1], [0.45, -1.4], [-0.45, -1.4], [-1.9, -1.1], [-1.9, -1.5], [-0.45, -2.1]], col);
    can.position.y = 2.75; g.add(can);
  } else if (variant === 'f22') {
    wing = wingShape([[0.5, -0.8], [3.9, 1.6], [3.9, 2.3], [0.5, 2.4], [-0.5, 2.4], [-3.9, 2.3], [-3.9, 1.6], [-0.5, -0.8]], col);
  } else {
    wing = wingShape([[0.5, -0.5], [3.3, 1.7], [3.3, 2.3], [0.5, 2.3], [-0.5, 2.3], [-3.3, 2.3], [-3.3, 1.7], [-0.5, -0.5]], col);
  }
  wing.position.y = 2.55; g.add(wing);

  const twin = variant !== 'f35';
  for (const s of twin ? [-1, 1] : [0]) {
    const t = box(0.12, 1.5, 1.3, col, s * 0.7, 3.4, 2.6);
    if (twin) t.rotation.z = -s * 0.35;
    g.add(t);
  }
  for (const s of twin ? [-1, 1] : [0]) {
    const noz = cyl(0.3, 0.36, 0.7, 0x333333, s * 0.42, 2.6, 3.1);
    noz.rotation.x = Math.PI / 2; g.add(noz);
  }
  g.userData.hover = true; g.userData.hoverAmp = 0.45;
  return g;
}

function mHeli(C) {
  const g = new THREE.Group();
  const body = box(1.35, 1.5, 4.0, C.dark, 0, 1.9, -0.3); g.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), M(0x2b4b66, { metalness: 0.6, roughness: 0.3 }));
  canopy.scale.set(0.9, 0.85, 1.2); canopy.position.set(0, 2.35, -2.15); g.add(canopy);
  const boom = cyl(0.22, 0.34, 3.2, C.dark, 0, 2.1, 3.1);
  boom.rotation.x = Math.PI / 2; g.add(boom);
  g.add(box(0.12, 1.15, 0.8, C.dark, 0, 2.9, 4.6));
  const tr = box(0.06, 1.3, 0.28, 0x333333, 0.14, 2.9, 4.7); g.add(tr);
  g.add(box(3.4, 0.14, 0.7, C.dark, 0, 1.85, -0.5));                 // 短翼
  for (const s of [-1, 1]) g.add(cyl(0.3, 0.3, 1.1, 0x3a3a3a, s * 1.55, 1.6, -0.5, 8)); // 火箭莢艙(橫放)
  const gun = cyl(0.09, 0.09, 1.3, 0x222222, 0, 1.15, -2.3); gun.rotation.x = Math.PI / 2; g.add(gun);
  for (const s of [-1, 1]) { const skid = box(0.14, 0.12, 3.2, 0x444444, s * 0.75, 0.85, -0.3); g.add(skid);
    g.add(box(0.12, 0.75, 0.12, 0x444444, s * 0.75, 1.2, -1.3)); g.add(box(0.12, 0.75, 0.12, 0x444444, s * 0.75, 1.2, 0.7)); }
  const rotor = new THREE.Group();
  rotor.add(box(7.2, 0.07, 0.4, 0x2a2a2a, 0, 0, 0));
  rotor.add(box(0.4, 0.07, 7.2, 0x2a2a2a, 0, 0, 0));
  rotor.add(cyl(0.2, 0.26, 0.5, 0x333333, 0, -0.15, 0));
  rotor.position.set(0, 2.95, -0.3);
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

function mTank(C, variant) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const tr = box(1.0, 0.95, 5.4, 0x33352f, s * 1.75, 0.85, 0); g.add(tr);
    g.add(box(1.02, 0.3, 5.5, 0x272923, s * 1.75, 1.35, 0));
  }
  const hull = box(3.4, 0.85, 5.2, C.main, 0, 1.7, 0); g.add(hull);
  const glacis = box(3.35, 0.8, 1.5, C.main, 0, 1.75, -2.5); glacis.rotation.x = 0.5; g.add(glacis);
  let turret;
  if (variant === 'm1') {
    turret = box(2.7, 0.95, 3.1, C.main, 0, 2.6, 0.15);
    g.add(box(2.0, 0.5, 1.2, C.dark, 0, 3.2, 0.9));      // 車長塔
  } else {
    turret = box(2.4, 0.85, 2.7, C.main, 0, 2.55, 0.2);
    const wedge = box(2.3, 0.7, 1.1, C.dark, 0, 2.6, -1.15); wedge.rotation.x = 0.35; g.add(wedge);
  }
  g.add(turret);
  const barrel = cyl(0.14, 0.17, 3.6, 0x2f2f2f, 0, 2.65, -3.0);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const muz = cyl(0.2, 0.2, 0.5, 0x262626, 0, 2.65, -4.6, 10); muz.rotation.x = Math.PI / 2; g.add(muz);
  return g;
}

function mIFV(C) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(box(0.85, 0.8, 4.4, 0x33352f, s * 1.45, 0.75, 0));
  const hull = box(2.8, 1.0, 4.3, C.main, 0, 1.55, 0); g.add(hull);
  const front = box(2.75, 0.9, 1.2, C.main, 0, 1.6, -2.0); front.rotation.x = 0.55; g.add(front);
  g.add(box(1.5, 0.65, 1.5, C.dark, 0, 2.4, 0.3));
  const gun = cyl(0.08, 0.1, 2.2, 0x2f2f2f, 0, 2.5, -1.5); gun.rotation.x = Math.PI / 2; g.add(gun);
  return g;
}

function mMLRS(C, variant) {
  const g = new THREE.Group();
  const nw = variant === 'phl' ? 4 : 3;
  for (const s of [-1, 1]) for (let i = 0; i < nw; i++) {
    const w = cyl(0.55, 0.55, 0.4, 0x2a2a2a, s * 1.45, 0.55, -1.9 + i * (3.8 / (nw - 1)), 12);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  g.add(box(2.6, 0.5, 5.2, C.main, 0, 1.15, 0));
  g.add(box(2.4, 1.1, 1.5, C.dark, 0, 1.95, -1.9));                       // 駕駛艙
  const pod = box(2.2, 1.3, 3.4, C.main, 0, 2.3, 1.0);
  pod.rotation.x = -0.32; g.add(pod);
  const holes = box(2.0, 1.1, 0.2, 0x1e1e1e, 0, 2.85, 2.55); holes.rotation.x = -0.32; g.add(holes);
  return g;
}

function mAPC(C) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const w = cyl(0.5, 0.5, 0.4, 0x242424, s * 1.4, 0.5, -1.95 + i * 1.3, 12);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  const hull = box(2.6, 1.1, 4.6, C.main, 0, 1.45, 0); g.add(hull);
  const front = box(2.55, 1.0, 1.3, C.main, 0, 1.5, -2.1); front.rotation.x = 0.6; g.add(front);
  g.add(box(0.9, 0.5, 0.9, C.dark, 0, 2.25, -0.6));
  const gun = cyl(0.06, 0.07, 1.4, 0x2b2b2b, 0, 2.35, -1.6); gun.rotation.x = Math.PI / 2; g.add(gun);
  return g;
}

function mEngineer(C) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(box(0.95, 0.85, 4.4, 0x33352f, s * 1.5, 0.8, 0.2));
  g.add(box(3.0, 1.0, 4.2, C.main, 0, 1.6, 0.2));
  g.add(box(1.7, 1.0, 1.6, C.dark, 0, 2.5, 1.0));
  const blade = box(3.6, 1.3, 0.25, 0x8a8a80, 0, 1.15, -2.6);
  blade.rotation.x = -0.25; g.add(blade);
  for (const s of [-1, 1]) { const arm = box(0.18, 0.18, 1.6, 0x6f6f66, s * 1.2, 1.5, -1.7); arm.rotation.x = 0.25; g.add(arm); }
  const flagpole = cyl(0.04, 0.04, 1.4, 0xcccccc, 1.2, 3.2, 1.6); g.add(flagpole);
  g.add(box(0.7, 0.45, 0.05, 0xf5d033, 1.55, 3.6, 1.6));
  return g;
}

function mMissile(C) {
  const g = new THREE.Group();
  g.add(box(2.6, 0.55, 3.6, C.dark, 0, 0.85, 0.2));
  const rail = box(0.9, 0.18, 4.6, 0x555550, 0, 1.9, 0.1); rail.rotation.x = -0.6; g.add(rail);
  const msl = cyl(0.32, 0.32, 4.2, 0xd8d8d2, 0, 2.35, 0);
  msl.rotation.x = Math.PI / 2 - 0.6; g.add(msl);
  const tip = cone(0.32, 0.9, C.accent, 0, 2.35 + 2.33 * Math.cos(0.6) * 0.62, -2.33 * 0.83);
  tip.rotation.x = -0.6; tip.position.set(0, 3.55, -1.6); g.add(tip);
  for (const a of [0, Math.PI / 2]) {
    const fin = box(1.15, 0.06, 0.5, C.accent, 0, 1.25, 1.55);
    fin.rotation.z = a; fin.rotation.x = -0.6; g.add(fin);
  }
  g.add(box(0.5, 0.7, 0.5, 0x44443e, 0.9, 0.6, 1.5));
  return g;
}

function mMine(C) {
  const g = new THREE.Group();
  const body = cyl(1.5, 1.7, 0.7, 0x3a3d35, 0, 0.55, 0, 18); g.add(body);
  g.add(cyl(0.55, 0.55, 0.35, 0x2c2e28, 0, 1.05, 0, 12));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    g.add(cone(0.12, 0.55, 0x8a8578, Math.cos(a) * 1.0, 1.3, Math.sin(a) * 1.0, 6));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.08, 8, 24), M(C.accent));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; g.add(ring);
  return g;
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv);
  tx.anisotropy = 4;
  return tx;
}

function flagTexture(side) {
  return canvasTexture(256, 160, (ctx, w, h) => {
    if (side === 'US') {
      for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#B22234'; ctx.fillRect(0, i * h / 13, w, h / 13 + 1); }
      ctx.fillStyle = '#3C3B6E'; ctx.fillRect(0, 0, w * 0.42, h * 7 / 13);
      ctx.fillStyle = '#fff';
      for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
        ctx.beginPath(); ctx.arc(9 + x * 17, 9 + y * 16, 3.4, 0, 7); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#DE2910'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#FFDE00';
      const star = (cx, cy, r) => {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
          ctx[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
        }
        ctx.closePath(); ctx.fill();
      };
      star(70, 62, 34);
      ctx.font = 'bold 52px "Microsoft JhengHei", sans-serif';
      ctx.fillText('八一', 130, 84);
    }
  });
}

function mFlag(C, side) {
  const g = new THREE.Group();
  g.add(cyl(1.6, 2.0, 0.8, 0x8f8a7c, 0, 0.5, 0, 16));
  g.add(cyl(1.2, 1.5, 0.5, 0x767162, 0, 1.1, 0, 16));
  const pole = cyl(0.09, 0.12, 6.2, 0xd8d4c8, 0, 4.2, 0); g.add(pole);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), M(0xf5d033));
  orb.position.set(0, 7.35, 0); g.add(orb);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1, 8, 1),
    new THREE.MeshStandardMaterial({ map: flagTexture(side), side: THREE.DoubleSide, roughness: 0.9 }));
  fl.position.set(1.75, 6.2, 0);
  fl.castShadow = true;
  g.add(fl);
  g.userData.flagMesh = fl;
  return g;
}

function hiddenTexture(side) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = side === 'CN' ? '#8f2f24' : '#3f5d7f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = side === 'CN' ? '#FFDE00' : '#ffffff';
    const cx = w / 2, cy = h / 2, r = 62;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      ctx[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
  });
}
const _hiddenTex = {};
function mHidden(side) {
  if (!_hiddenTex[side]) _hiddenTex[side] = hiddenTexture(side);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.9, 4.2),
    new THREE.MeshStandardMaterial({ map: _hiddenTex[side], roughness: 0.8 }));
  m.position.y = 1.6; m.castShadow = true;
  g.add(m);
  g.add(box(4.5, 0.25, 4.5, side === 'CN' ? 0x6d241c : 0x2e4560, 0, 0.15, 0));
  return g;
}

/* ============ 棋子工廠 ============ */
function buildPieceMesh(piece, forceHidden) {
  const C = SIDE_COLOR[piece.side];
  const g = new THREE.Group();

  // 底盤（陣營色圓環）
  const base = cyl(2.9, 3.1, 0.35, 0x1d1f24, 0, 0.18, 0, 24);
  base.receiveShadow = true;
  g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.14, 8, 32), M(C.ring, { emissive: C.ring, emissiveIntensity: 0.35 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.38; g.add(ring);

  let model;
  if (forceHidden) model = mHidden(piece.side);
  else switch (piece.kind) {
    case 'bomberB2': model = mBomberB2(C); break;
    case 'bomberH6': model = mBomberH6(C); break;
    case 'fighter':
      model = mFighter(C, piece.side === 'US' ? (piece.rank === 8 ? 'f22' : 'f35') : (piece.rank === 8 ? 'j20' : 'j16')); break;
    case 'heli': model = mHeli(C); break;
    case 'tank': model = mTank(C, piece.side === 'US' ? 'm1' : '99a'); break;
    case 'ifv': model = mIFV(C); break;
    case 'mlrs': model = mMLRS(C, piece.side === 'US' ? 'himars' : 'phl'); break;
    case 'apc': model = mAPC(C); break;
    case 'engineer': model = mEngineer(C); break;
    case 'missile': model = mMissile(C); break;
    case 'mine': model = mMine(C); break;
    case 'flag': model = mFlag(C, piece.side); break;
    default: model = mHidden(piece.side);
  }
  model.position.y = 0.35;
  g.add(model);
  g.userData.model = model;
  g.userData.pieceId = piece.id;
  g.userData.baseY = 0;
  if (model.userData.hover) { g.userData.hover = true; g.userData.hoverAmp = model.userData.hoverAmp || 0.4; g.userData.hoverPhase = Math.random() * Math.PI * 2; }
  if (model.userData.rotor) g.userData.rotor = model.userData.rotor;
  if (model.userData.flagMesh) g.userData.flagMesh = model.userData.flagMesh;

  // 朝向敵方
  g.rotation.y = piece.side === 'US' ? 0 : Math.PI;
  return g;
}

/* ============ 名牌 Sprite ============ */
function makeLabelSprite(text, colorCss) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 110;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(10,12,16,0.72)';
  const r = 30;
  ctx.beginPath();
  ctx.moveTo(r, 4); ctx.lineTo(512 - r, 4); ctx.quadraticCurveTo(508, 4, 508, r + 4);
  ctx.lineTo(508, 106 - r); ctx.quadraticCurveTo(508, 106, 512 - r, 106);
  ctx.lineTo(r, 106); ctx.quadraticCurveTo(4, 106, 4, 106 - r);
  ctx.lineTo(4, r + 4); ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 56px "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colorCss;
  ctx.fillText(text, 256, 58);
  const tx = new THREE.CanvasTexture(cv);
  tx.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
  sp.scale.set(9.5, 2.05, 1);
  sp.renderOrder = 10;
  return sp;
}

/* ============ 棋盤場景 ============ */
function padTexture(text, bg, fg) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = 'bold 72px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}

function buildBoard3D(scene) {
  const g = new THREE.Group();

  // 大地
  const ground = new THREE.Mesh(new THREE.BoxGeometry(64, 2.4, 158), M(0x46603f, { roughness: 0.95, metalness: 0.05 }));
  ground.position.y = -1.2; ground.receiveShadow = true;
  g.add(ground);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(68, 1.6, 162), M(0x33302a, { roughness: 0.9 }));
  frame.position.y = -1.8; g.add(frame);

  // 邊（道路 / 鐵路）
  for (const ek of ALL_EDGES) {
    const [a, b] = ek.split('|');
    const [r1, c1] = a.split(',').map(Number);
    const [r2, c2] = b.split(',').map(Number);
    const p1 = worldPos(r1, c1), p2 = worldPos(r2, c2);
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const ang = Math.atan2(dx, dz);
    const mx = (p1.x + p2.x) / 2, mz = (p1.z + p2.z) / 2;
    const rail = RAIL_EDGES.has(ek);
    if (rail) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, len), M(0x5a4a38, { roughness: 1 }));
      bed.position.set(mx, 0.06, mz); bed.rotation.y = ang; bed.receiveShadow = true; g.add(bed);
      for (const s of [-0.55, 0.55]) {
        const railm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, len), M(0x9a9a94, { metalness: 0.7, roughness: 0.4 }));
        railm.position.set(mx + Math.cos(ang) * s, 0.16, mz - Math.sin(ang) * s);
        railm.rotation.y = ang; g.add(railm);
      }
      const nt = Math.floor(len / 2.2);
      for (let i = 0; i < nt; i++) {
        const t = (i + 0.5) / nt - 0.5;
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.36), M(0x4a3826));
        tie.position.set(mx + Math.sin(ang) * t * len, 0.13, mz + Math.cos(ang) * t * len);
        tie.rotation.y = ang; g.add(tie);
      }
    } else {
      const road = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, len), M(0xd9d2ba, { roughness: 1 }));
      road.position.set(mx, 0.05, mz); road.rotation.y = ang; road.receiveShadow = true; g.add(road);
    }
  }

  // 格位
  const campTex = padTexture('行營', '#cfe0b8', '#4a6b35');
  const hqTexUS = padTexture('大本營', '#c8d4e6', '#2f5d9e');
  const hqTexCN = padTexture('大本營', '#e8cfc8', '#a03325');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = worldPos(r, c);
    if (isCamp(r, c)) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 0.3, 28),
        new THREE.MeshStandardMaterial({ map: campTex, roughness: 0.9 }));
      pad.position.set(p.x, 0.15, p.z); pad.receiveShadow = true; g.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.12, 8, 32), M(0x6f8f4f));
      ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.32, p.z); g.add(ring);
    } else if (isHQ(r, c)) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.35, 7.6),
        new THREE.MeshStandardMaterial({ map: r < 6 ? hqTexCN : hqTexUS, roughness: 0.9 }));
      pad.position.set(p.x, 0.17, p.z); pad.receiveShadow = true; g.add(pad);
      for (const [ox, oz, w, d] of [[0, -3.9, 8, 0.5], [0, 3.9, 8, 0.5], [-3.9, 0, 0.5, 8], [3.9, 0, 0.5, 8]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), M(r < 6 ? 0x8f4a40 : 0x4a6a95));
        wall.position.set(p.x + ox, 0.6, p.z + oz); wall.castShadow = true; g.add(wall);
      }
    } else {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.24, 24), M(0xe4ddc6, { roughness: 0.95 }));
      pad.position.set(p.x, 0.12, p.z); pad.receiveShadow = true; g.add(pad);
    }
  }

  // 山界（c1, c3 之間隔）
  for (const cx of [-10, 10]) {
    const mg = new THREE.Group();
    const hs = [[0, 0, 4.6, 8.5], [-3.4, 1.8, 3.2, 5.6], [3.2, -1.6, 3.4, 6.2]];
    for (const [ox, oz, rr, hh] of hs) {
      const mtn = cone(rr, hh, 0x7d7d74, ox, hh / 2, oz, 9);
      mtn.castShadow = true; mg.add(mtn);
      const snow = cone(rr * 0.35, hh * 0.28, 0xeeeeea, ox, hh - hh * 0.13, oz, 9);
      mg.add(snow);
    }
    mg.position.set(cx, 0, 0);
    g.add(mg);
  }

  scene.add(g);
  return g;
}
