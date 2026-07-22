/* =========================================================
 * main.js — 場景、互動、動畫、遊戲流程
 * ========================================================= */

let renderer, scene, camera, clock;
let boardGroup, pieceLayer, markerLayer, fxLayer;
const tweens = [];

const state = {
  phase: 'setup',            // setup | play | over
  turn: 'US',
  board: null,               // [12][5]
  pieces: [],
  meshes: new Map(),         // pieceId -> THREE.Group
  labels: new Map(),
  selected: null,
  selectedMoves: null,
  swapSel: null,
  markers: [],
  busy: false,
  showLabels: true,
  sound: true,
};

/* ---------- 攝影機環繞 ---------- */
const cam = { az: 0, polar: 0.98, radius: 96, target: new THREE.Vector3(0, 0, 6), shake: 0 };
function applyCamera() {
  const sp = Math.sin(cam.polar), r = cam.radius;
  const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
  camera.position.set(
    cam.target.x + r * sp * Math.sin(cam.az) + sx,
    cam.target.y + r * Math.cos(cam.polar) + sy,
    cam.target.z + r * sp * Math.cos(cam.az));
  camera.lookAt(cam.target);
}

/* ---------- Tween ---------- */
const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function addTween(dur, onUpdate, onDone, ease) {
  tweens.push({ t: 0, dur, onUpdate, onDone, ease: ease || easeIO });
}

/* ---------- 音效 ---------- */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  return AC;
}
function sfx(type) {
  if (!state.sound) return;
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime;
  const g = ac.createGain(); g.connect(ac.destination);
  if (type === 'select') {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 760;
    o.connect(g); g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.start(t0); o.stop(t0 + 0.1);
  } else if (type === 'move') {
    const o = ac.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(240, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.22);
    o.connect(g); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    o.start(t0); o.stop(t0 + 0.26);
  } else if (type === 'boom') {
    const len = 0.7, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t0); f.frequency.exponentialRampToValueAtTime(120, t0 + len);
    src.connect(f); f.connect(g); g.gain.setValueAtTime(0.6, t0);
    src.start(t0);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(35, t0 + 0.5);
    const g2 = ac.createGain(); g2.connect(ac.destination);
    g2.gain.setValueAtTime(0.5, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    o.connect(g2); o.start(t0); o.stop(t0 + 0.6);
  } else if (type === 'win' || type === 'lose') {
    const notes = type === 'win' ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const gg = ac.createGain(); gg.connect(ac.destination);
      const s = t0 + i * 0.18;
      gg.gain.setValueAtTime(0.001, s); gg.gain.linearRampToValueAtTime(0.14, s + 0.03);
      gg.gain.exponentialRampToValueAtTime(0.001, s + 0.5);
      o.connect(gg); o.start(s); o.stop(s + 0.55);
    });
  }
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
function setMsg(html) { $('msg').innerHTML = html; }
function setTurnUI() {
  const el = $('turnBox');
  if (state.phase === 'setup') { el.textContent = '佈陣階段'; el.className = 'turn setup'; }
  else if (state.phase === 'over') { el.textContent = '戰役結束'; el.className = 'turn over'; }
  else if (state.turn === 'US') { el.textContent = '我方回合（美軍）'; el.className = 'turn us'; }
  else { el.textContent = '敵方回合（共軍）'; el.className = 'turn cn'; }
}
function addKill(p) {
  const list = $(p.side === 'US' ? 'lostUS' : 'lostCN');
  const div = document.createElement('div');
  div.className = 'kill';
  div.textContent = p.role + '・' + p.name;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

/* ---------- 初始化 ---------- */
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  $('c3d').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1420);
  scene.fog = new THREE.Fog(0x0e1420, 220, 420);

  camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 1, 600);

  scene.add(new THREE.AmbientLight(0xbfd0e8, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.05);
  sun.position.set(60, 110, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 110;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.far = 320;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6688cc, 0.35);
  rim.position.set(-50, 60, -80); scene.add(rim);

  boardGroup = buildBoard3D(scene);
  pieceLayer = new THREE.Group(); scene.add(pieceLayer);
  markerLayer = new THREE.Group(); scene.add(markerLayer);
  fxLayer = new THREE.Group(); scene.add(fxLayer);

  clock = new THREE.Clock();
  bindInput();
  bindUI();
  newGame();

  cam.radius = 190;
  addTween(1.6, k => { cam.radius = 190 - 94 * k; }, null);

  animate();
}

/* ---------- 開新局 ---------- */
function newGame() {
  state.pieces = [];
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  state.meshes.forEach(m => pieceLayer.remove(m));
  state.meshes.clear(); state.labels.clear();
  clearMarkers(); state.selected = null; state.selectedMoves = null; state.swapSel = null;
  state.phase = 'setup'; state.turn = 'US'; state.busy = false;
  $('lostUS').innerHTML = ''; $('lostCN').innerHTML = '';
  $('overlay').classList.add('hidden');

  const us = createArmy('US'), cn = createArmy('CN');
  randomSetup('US', us); randomSetup('CN', cn);
  state.pieces = us.concat(cn);
  for (const p of state.pieces) state.board[p.r][p.c] = p;
  for (const p of state.pieces) spawnMesh(p);

  $('setupBar').classList.remove('hidden');
  $('btnStart').classList.remove('hidden');
  setTurnUI();
  setMsg('佈陣階段：點選我方兩個單位可互換位置（軍旗限大本營、地雷限後兩列、飛彈不可在前線）。調整完點「開戰」。');
}

function spawnMesh(p) {
  const hidden = (p.side === 'CN') && !p.revealed;
  const g = buildPieceMesh(p, hidden);
  const w = worldPos(p.r, p.c);
  g.position.set(w.x, 0, w.z);
  pieceLayer.add(g);
  state.meshes.set(p.id, g);
  if (!hidden) attachLabel(p, g);
  return g;
}
function attachLabel(p, g) {
  const color = p.side === 'US' ? '#a8d4ff' : '#ffb4a4';
  const sp = makeLabelSprite(p.role + '・' + p.name.split(' ')[0], color);
  sp.position.y = 8.6;
  sp.visible = state.showLabels;
  g.add(sp);
  state.labels.set(p.id, sp);
}
function refreshMesh(p) {
  const old = state.meshes.get(p.id);
  if (old) pieceLayer.remove(old);
  state.labels.delete(p.id);
  if (!p.alive) { state.meshes.delete(p.id); return null; }
  return spawnMesh(p);
}

/* ---------- 標記 ---------- */
function clearMarkers() {
  for (const m of state.markers) markerLayer.remove(m);
  state.markers = [];
}
function showMarkers(piece, moves) {
  clearMarkers();
  for (const mv of moves) {
    const w = worldPos(mv.r, mv.c);
    let m;
    if (mv.attack) {
      m = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.22, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.3 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.32, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.9 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
      m.add(ring);
    } else {
      m = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 22),
        new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.62 }));
    }
    m.position.set(w.x, 0.55, w.z);
    m.userData.marker = { piece, mv };
    markerLayer.add(m);
    state.markers.push(m);
  }
}

/* ---------- 選取效果 ---------- */
function setSelected(piece) {
  if (state.selected) {
    const g0 = state.meshes.get(state.selected.id);
    if (g0) { g0.position.y = 0; g0.userData.selected = false; g0.scale.setScalar(1); }
  }
  state.selected = piece;
  if (piece) {
    const g = state.meshes.get(piece.id);
    if (g) g.userData.selected = true;
    sfx('select');
  }
}

/* ---------- 輸入 ---------- */
function bindInput() {
  const el = renderer.domElement;
  let down = null, dragging = false;
  el.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, az: cam.az, polar: cam.polar };
    dragging = false;
  });
  el.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!dragging && Math.hypot(dx, dy) > 6) dragging = true;
    if (dragging) {
      cam.az = down.az - dx * 0.005;
      cam.polar = Math.min(1.32, Math.max(0.25, down.polar - dy * 0.004));
    }
  });
  el.addEventListener('pointerup', e => {
    if (down && !dragging) handleClick(e);
    down = null; dragging = false;
  });
  el.addEventListener('wheel', e => {
    cam.radius = Math.min(230, Math.max(45, cam.radius + e.deltaY * 0.08));
  }, { passive: true });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

const raycaster = new THREE.Raycaster();
function pickAt(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const nd = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(nd, camera);
  const hitM = raycaster.intersectObjects(markerLayer.children, true);
  for (const h of hitM) {
    let o = h.object;
    while (o && !o.userData.marker) o = o.parent;
    if (o) return { marker: o.userData.marker };
  }
  const hitP = raycaster.intersectObjects(pieceLayer.children, true);
  for (const h of hitP) {
    let o = h.object;
    while (o && !o.userData.pieceId) o = o.parent;
    if (o) return { piece: state.pieces.find(p => p.id === o.userData.pieceId) };
  }
  return {};
}

function handleClick(e) {
  if (state.busy || state.phase === 'over') return;
  const hit = pickAt(e);

  if (state.phase === 'setup') {
    if (!hit.piece || hit.piece.side !== 'US') { setSelected(null); state.swapSel = null; return; }
    if (!state.swapSel) {
      state.swapSel = hit.piece; setSelected(hit.piece);
      setMsg('已選 <b>' + hit.piece.role + '・' + hit.piece.name + '</b>，點另一個我方單位互換位置。');
    } else if (state.swapSel === hit.piece) {
      state.swapSel = null; setSelected(null);
    } else {
      trySwap(state.swapSel, hit.piece);
    }
    return;
  }

  // play
  if (state.turn !== 'US') return;
  if (hit.marker) { doMove(hit.marker.piece, hit.marker.mv); return; }
  // 直接點敵方棋子＝攻擊（若在已選單位的合法攻擊範圍內）
  if (hit.piece && hit.piece.side === 'CN' && state.selected && state.selectedMoves) {
    const mv = state.selectedMoves.find(m => m.attack && m.r === hit.piece.r && m.c === hit.piece.c);
    if (mv) { doMove(state.selected, mv); return; }
  }
  if (hit.piece && hit.piece.side === 'US') {
    setSelected(hit.piece);
    const moves = legalMoves(hit.piece, state.board);
    state.selectedMoves = moves;
    showMarkers(hit.piece, moves);
    if (hit.piece.immobile) setMsg('<b>' + hit.piece.role + '・' + hit.piece.name + '</b>：' + hit.piece.desc + '（不可移動）');
    else if (isHQ(hit.piece.r, hit.piece.c)) setMsg('大本營內的單位不得再移動。');
    else setMsg('<b>' + hit.piece.role + '・' + hit.piece.name + '</b>：' + hit.piece.desc +
      '。綠點＝可走，紅圈＝攻擊。');
  } else {
    setSelected(null); clearMarkers(); state.selectedMoves = null;
  }
}

/* ---------- 佈陣換位 ---------- */
function trySwap(a, b) {
  const okA = setupCellOK(a, b.r, b.c), okB = setupCellOK(b, a.r, a.c);
  if (!okA || !okB) {
    setMsg('⚠️ 換位違反佈陣規則（軍旗限大本營、地雷限後兩列、飛彈不可在前線列）。');
    state.swapSel = null; setSelected(null);
    return;
  }
  const [ar, ac] = [a.r, a.c];
  a.r = b.r; a.c = b.c; b.r = ar; b.c = ac;
  state.board[a.r][a.c] = a; state.board[b.r][b.c] = b;
  for (const p of [a, b]) {
    const g = state.meshes.get(p.id);
    const w = worldPos(p.r, p.c);
    const from = g.position.clone();
    addTween(0.45, k => {
      g.position.x = from.x + (w.x - from.x) * k;
      g.position.z = from.z + (w.z - from.z) * k;
      g.position.y = Math.sin(k * Math.PI) * 4;
    }, () => { g.position.y = 0; });
  }
  sfx('move');
  state.swapSel = null; setSelected(null);
  setMsg('已換位。可繼續調整，或點「開戰」。');
}

/* ---------- 執行移動 ---------- */
function doMove(piece, mv) {
  state.busy = true;
  clearMarkers(); setSelected(null); state.selectedMoves = null;
  const g = state.meshes.get(piece.id);
  const defender = mv.attack ? state.board[mv.r][mv.c] : null;

  state.board[piece.r][piece.c] = null;

  const pts = [worldPos(piece.r, piece.c)].concat(mv.path.map(pt => worldPos(pt.r, pt.c)));
  const isAir = ['bomberB2', 'bomberH6', 'fighter', 'heli'].includes(piece.kind);
  const segDur = isAir ? 0.16 : 0.24;
  const dur = Math.max(0.5, pts.length * segDur + (isAir ? 0.55 : 0.1));
  sfx('move');

  const total = pts.length - 1;
  addTween(dur, k => {
    const f = k * total;
    const i = Math.min(total - 1, Math.floor(f));
    const t = f - i;
    const p0 = pts[i], p1 = pts[i + 1];
    g.position.x = p0.x + (p1.x - p0.x) * t;
    g.position.z = p0.z + (p1.z - p0.z) * t;
    if (isAir) g.position.y = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 8;
    else g.position.y = Math.abs(Math.sin(f * Math.PI * 2.2)) * 0.35;
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    if (dx * dx + dz * dz > 0.001) {
      const target = Math.atan2(-dx, -dz);
      let d = target - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.25;
    }
  }, () => {
    g.position.y = 0;
    if (defender) resolveCombat(piece, defender, mv);
    else {
      piece.r = mv.r; piece.c = mv.c;
      state.board[mv.r][mv.c] = piece;
      afterAction(piece.side);
    }
  }, t => t);
}

/* ---------- 戰鬥 ---------- */
function resolveCombat(att, def, mv) {
  const res = resolveBattle(att, def);
  const w = worldPos(mv.r, mv.c);

  const attName = att.role + '・' + att.name;
  const defName = def.role + '・' + def.name;

  // 揭露倖存者
  const newlyRevealed = [];
  for (const [p, dies] of [[att, res.attackerDies], [def, res.defenderDies]]) {
    if (!dies && !p.revealed) { p.revealed = true; newlyRevealed.push(p); }
  }

  explode(w.x, w.z, res.attackerDies && res.defenderDies);

  setTimeout(() => {
    if (res.flagCaptured) {
      def.alive = false; addKill(def);
      att.r = mv.r; att.c = mv.c; state.board[mv.r][mv.c] = att;
      refreshAfterCombat(att, def, newlyRevealed);
      setMsg('🚩 <b>' + attName + '</b> 奪下 <b>' + defName + '</b>！');
      gameOver(att.side);
      return;
    }
    if (res.defenderDies) { def.alive = false; addKill(def); }
    if (res.attackerDies) { att.alive = false; addKill(att); }

    if (res.defenderDies && !res.attackerDies) {
      att.r = mv.r; att.c = mv.c; state.board[mv.r][mv.c] = att;
      setMsg('💥 <b>' + attName + '</b> 擊毀 <b>' + defName + '</b>！');
    } else if (res.attackerDies && !res.defenderDies) {
      setMsg('💥 <b>' + attName + '</b> 進攻失敗，遭 <b>' + defName + '</b> 摧毀。');
    } else {
      state.board[mv.r][mv.c] = null;
      setMsg('💥 <b>' + attName + '</b> 與 <b>' + defName + '</b> 同歸於盡。');
    }

    refreshAfterCombat(att, def, newlyRevealed);

    // 司令陣亡 → 亮軍旗
    for (const p of [att, def]) {
      if (!p.alive && p.role === '司令') {
        const flag = state.pieces.find(x => x.side === p.side && x.role === '軍旗' && x.alive);
        if (flag && !flag.revealed) { flag.revealed = true; refreshMesh(flag); }
      }
    }
    afterAction(att.side);
  }, 620);
}

function refreshAfterCombat(att, def, newlyRevealed) {
  for (const p of [att, def]) {
    if (!p.alive) {
      const g = state.meshes.get(p.id);
      if (g) {
        addTween(0.7, k => { g.scale.setScalar(1 - k * 0.95); g.position.y = -k * 2.2; g.rotation.z = k * 0.6; },
          () => { pieceLayer.remove(g); state.meshes.delete(p.id); });
      }
    }
  }
  for (const p of newlyRevealed) if (p.alive) {
    const g = refreshMesh(p);
    if (g) { g.scale.setScalar(0.1); addTween(0.4, k => g.scale.setScalar(0.1 + 0.9 * k)); }
  }
}

/* ---------- 爆炸特效 ---------- */
function explode(x, z, big) {
  sfx('boom');
  cam.shake = big ? 3.2 : 2.0;
  addTween(0.5, k => { cam.shake = (big ? 3.2 : 2.0) * (1 - k); }, () => { cam.shake = 0; });

  const light = new THREE.PointLight(0xff9040, 4, 60);
  light.position.set(x, 5, z); fxLayer.add(light);
  addTween(0.55, k => { light.intensity = 4 * (1 - k); }, () => fxLayer.remove(light));

  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  fire.position.set(x, 2.5, z); fxLayer.add(fire);
  addTween(0.55, k => {
    fire.scale.setScalar(0.6 + k * (big ? 7 : 5));
    fire.material.opacity = 0.95 * (1 - k);
  }, () => fxLayer.remove(fire));

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 8, 30),
    new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 1.2, z); fxLayer.add(ring);
  addTween(0.65, k => { ring.scale.setScalar(1 + k * 8); ring.material.opacity = 0.85 * (1 - k); },
    () => fxLayer.remove(ring));

  const n = big ? 34 : 22;
  const parts = [];
  const geo = new THREE.TetrahedronGeometry(0.45);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: [0xff8833, 0xffbb44, 0x777777, 0x552211][i % 4], transparent: true
    }));
    m.position.set(x, 2, z);
    const a = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 16;
    m.userData.v = new THREE.Vector3(Math.cos(a) * sp * (0.4 + Math.random()), 9 + Math.random() * 14, Math.sin(a) * sp * (0.4 + Math.random()));
    fxLayer.add(m); parts.push(m);
  }
  addTween(1.1, k => {
    const dt = 1.1 / 60;
    for (const m of parts) {
      m.userData.v.y -= 38 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      if (m.position.y < 0.3) { m.position.y = 0.3; m.userData.v.multiplyScalar(0.3); }
      m.material.opacity = 1 - k;
      m.rotation.x += 0.2; m.rotation.z += 0.17;
    }
  }, () => parts.forEach(m => fxLayer.remove(m)), t => t);
}

/* ---------- 回合流程 ---------- */
function afterAction(movedSide) {
  if (state.phase === 'over') return;
  const next = movedSide === 'US' ? 'CN' : 'US';
  if (!hasAnyMove(next, state.board, state.pieces)) {
    gameOver(movedSide, next === 'US' ? '我方已無單位可動' : '敵方已無單位可動');
    return;
  }
  state.turn = next;
  state.busy = false;
  setTurnUI();
  if (next === 'CN') {
    state.busy = true;
    setTimeout(aiTurn, 750);
  }
}

function aiTurn() {
  if (state.phase !== 'play') return;
  const choice = aiChooseMove(state);
  if (!choice) { gameOver('US', '敵方已無可行動作'); return; }
  state.busy = true;
  doMove(choice.piece, choice.mv);
}

function gameOver(winner, reason) {
  state.phase = 'over';
  state.busy = false;
  setTurnUI();
  const win = winner === 'US';
  sfx(win ? 'win' : 'lose');
  $('overTitle').textContent = win ? '🎖️ 勝利！' : '☠️ 敗北';
  $('overText').textContent = (reason ? reason + '。' : '') + (win ? '美軍奪得八一軍旗，戰役告捷！' : '共軍奪得星條旗，我軍潰敗。');
  setTimeout(() => $('overlay').classList.remove('hidden'), 900);
}

/* ---------- UI 綁定 ---------- */
function bindUI() {
  $('btnShuffle').onclick = () => {
    if (state.phase !== 'setup') return;
    const us = state.pieces.filter(p => p.side === 'US');
    for (const p of us) { state.board[p.r][p.c] = null; p.r = -1; p.c = -1; }
    randomSetup('US', us);
    for (const p of us) {
      state.board[p.r][p.c] = p;
      const g = state.meshes.get(p.id);
      const w = worldPos(p.r, p.c);
      const from = g.position.clone();
      addTween(0.5, k => {
        g.position.x = from.x + (w.x - from.x) * k;
        g.position.z = from.z + (w.z - from.z) * k;
        g.position.y = Math.sin(k * Math.PI) * 3;
      }, () => { g.position.y = 0; });
    }
    sfx('move');
  };
  $('btnStart').onclick = () => {
    if (state.phase !== 'setup') return;
    state.phase = 'play'; state.turn = 'US';
    state.swapSel = null; setSelected(null);
    $('setupBar').classList.add('hidden');
    setTurnUI();
    setMsg('開戰！點選我方單位查看可行走法。鐵路可直線長驅，工兵鐵路可轉彎。');
    sfx('win');
  };
  $('btnRules').onclick = () => $('rulesModal').classList.remove('hidden');
  $('btnCloseRules').onclick = () => $('rulesModal').classList.add('hidden');
  $('btnLabels').onclick = () => {
    state.showLabels = !state.showLabels;
    state.labels.forEach(sp => sp.visible = state.showLabels);
    $('btnLabels').textContent = state.showLabels ? '隱藏名牌' : '顯示名牌';
  };
  $('btnSound').onclick = () => {
    state.sound = !state.sound;
    $('btnSound').textContent = state.sound ? '🔊 音效' : '🔇 靜音';
  };
  $('btnRestart').onclick = newGame;
  $('btnAgain').onclick = newGame;
}

/* ---------- 主迴圈 ---------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = tw.ease(Math.min(1, tw.t / tw.dur));
    tw.onUpdate && tw.onUpdate(k);
    if (tw.t >= tw.dur) {
      tweens.splice(i, 1);
      tw.onDone && tw.onDone();
    }
  }

  // 待機動畫
  state.meshes.forEach((g, id) => {
    if (g.userData.rotor) g.userData.rotor.rotation.y += dt * 18;
    if (g.userData.hover) {
      const model = g.userData.model;
      model.position.y = 0.35 + Math.sin(t * 2 + g.userData.hoverPhase) * g.userData.hoverAmp;
    }
    if (g.userData.flagMesh) g.userData.flagMesh.rotation.y = Math.sin(t * 2.6) * 0.18;
    if (g.userData.selected) {
      const s = 1 + Math.sin(t * 6) * 0.04;
      g.scale.setScalar(s);
    } else if (g.scale.x !== 1 && !g.userData.dying) {
      // 非選取狀態回復（避免與死亡動畫衝突：死亡動畫每幀覆寫 scale）
    }
  });

  // 標記脈動
  for (const m of state.markers) {
    const s = 1 + Math.sin(t * 5) * 0.12;
    m.scale.set(s, 1, s);
  }

  applyCamera();
  renderer.render(scene, camera);
}

init();
