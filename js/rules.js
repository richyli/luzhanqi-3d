/* =========================================================
 * rules.js — 陸軍棋規則引擎（棋盤圖、走法、戰鬥判定、佈陣）
 * 棋盤：5 欄(c:0-4) × 12 列(r:0-11)
 *   紅方（中國）r:0-5（上半），藍方（美國）r:6-11（下半）
 *   前線列：r5（中）/ r6（美），山界在兩列之間，僅 c0,c2,c4 相通
 * ========================================================= */

const COLS = 5, ROWS = 12;

/* ---------- 角色定義 ---------- */
const ROLES = [
  { role: '司令', rank: 9, n: 1 },
  { role: '軍長', rank: 8, n: 1 },
  { role: '師長', rank: 7, n: 2 },
  { role: '旅長', rank: 6, n: 2 },
  { role: '團長', rank: 5, n: 2 },
  { role: '營長', rank: 4, n: 2 },
  { role: '連長', rank: 3, n: 3 },
  { role: '排長', rank: 2, n: 3 },
  { role: '工兵', rank: 1, n: 3 },
  { role: '炸彈', rank: 0, n: 2, special: 'bomb' },
  { role: '地雷', rank: 0, n: 3, special: 'mine', immobile: true },
  { role: '軍旗', rank: 0, n: 1, special: 'flag', immobile: true },
];

/* ---------- 武器對照（美 / 中 正式現役裝備） ---------- */
const WEAPONS = {
  US: {
    '司令': { name: 'B-2 幽靈轟炸機',  kind: 'bomberB2',  desc: '諾斯洛普·格魯曼匿蹤戰略轟炸機，全軍最高指揮象徵' },
    '軍長': { name: 'F-22 猛禽',       kind: 'fighter',   desc: '第五代匿蹤空優戰鬥機' },
    '師長': { name: 'F-35 閃電II',     kind: 'fighter',   desc: '聯合打擊戰鬥機，三軍通用' },
    '旅長': { name: 'AH-64 阿帕契',    kind: 'heli',      desc: '主力攻擊直升機' },
    '團長': { name: 'M1A2 艾布蘭',     kind: 'tank',      desc: '主力戰車，120mm 滑膛砲' },
    '營長': { name: 'M2 布萊德雷',     kind: 'ifv',       desc: '步兵戰鬥車' },
    '連長': { name: 'M142 海馬斯',     kind: 'mlrs',      desc: '高機動性多管火箭系統' },
    '排長': { name: '史崔克裝甲車',    kind: 'apc',       desc: '八輪裝甲運兵車' },
    '工兵': { name: 'M9 裝甲工兵車',   kind: 'engineer',  desc: '戰鬥工兵車，可排除地雷' },
    '炸彈': { name: '戰斧巡弋飛彈',    kind: 'missile',   desc: 'BGM-109，與目標同歸於盡' },
    '地雷': { name: 'M15 反戰車地雷',  kind: 'mine',      desc: '重型反戰車地雷，僅工兵可排除' },
    '軍旗': { name: '星條旗',          kind: 'flag',      desc: '軍旗被奪即敗' },
  },
  CN: {
    '司令': { name: '轟-6K 轟炸機',    kind: 'bomberH6',  desc: '戰略轟炸機，全軍最高指揮象徵' },
    '軍長': { name: '殲-20 威龍',      kind: 'fighter',   desc: '第五代匿蹤戰鬥機' },
    '師長': { name: '殲-16',           kind: 'fighter',   desc: '多用途重型戰鬥機' },
    '旅長': { name: '直-10 武裝直升機', kind: 'heli',     desc: '主力攻擊直升機' },
    '團長': { name: '99A 主戰坦克',    kind: 'tank',      desc: '解放軍最先進主力戰車' },
    '營長': { name: '04A 步兵戰車',    kind: 'ifv',       desc: '履帶式步兵戰鬥車' },
    '連長': { name: 'PHL-191 火箭炮',  kind: 'mlrs',      desc: '遠程多管火箭炮' },
    '排長': { name: 'ZBL-08 裝甲車',   kind: 'apc',       desc: '八輪裝甲運兵車' },
    '工兵': { name: 'GCZ-112 工程車',  kind: 'engineer',  desc: '裝甲工程車，可排除地雷' },
    '炸彈': { name: '長劍-10 巡弋飛彈', kind: 'missile',  desc: 'CJ-10，與目標同歸於盡' },
    '地雷': { name: '72式 反坦克地雷', kind: 'mine',      desc: '反戰車地雷，僅工兵可排除' },
    '軍旗': { name: '八一軍旗',        kind: 'flag',      desc: '軍旗被奪即敗' },
  },
};

/* ---------- 棋盤格位 ---------- */
const key = (r, c) => r + ',' + c;
const inBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

const CAMPS = new Set([key(2,1), key(2,3), key(3,2), key(4,1), key(4,3),
                       key(7,1), key(7,3), key(8,2), key(9,1), key(9,3)]);
const HQS = { CN: [key(0,1), key(0,3)], US: [key(11,1), key(11,3)] };
const HQ_SET = new Set([...HQS.CN, ...HQS.US]);

const isCamp = (r, c) => CAMPS.has(key(r, c));
const isHQ = (r, c) => HQ_SET.has(key(r, c));

/* ---------- 邊（道路 / 鐵路 / 行營斜線） ---------- */
const edgeKey = (r1, c1, r2, c2) => {
  if (r1 > r2 || (r1 === r2 && c1 > c2)) [r1, c1, r2, c2] = [r2, c2, r1, c1];
  return r1 + ',' + c1 + '|' + r2 + ',' + c2;
};

const ADJ = new Map();      // "r,c" -> [{r,c}]
const RAIL_EDGES = new Set();
const ALL_EDGES = new Set();

function addEdge(r1, c1, r2, c2, rail) {
  const ek = edgeKey(r1, c1, r2, c2);
  if (!ALL_EDGES.has(ek)) {
    ALL_EDGES.add(ek);
    const k1 = key(r1, c1), k2 = key(r2, c2);
    if (!ADJ.has(k1)) ADJ.set(k1, []);
    if (!ADJ.has(k2)) ADJ.set(k2, []);
    ADJ.get(k1).push({ r: r2, c: c2 });
    ADJ.get(k2).push({ r: r1, c: c1 });
  }
  if (rail) RAIL_EDGES.add(ek);
}
const isRailEdge = (r1, c1, r2, c2) => RAIL_EDGES.has(edgeKey(r1, c1, r2, c2));

(function buildBoard() {
  // 半場內正交邊
  for (const [rs, re] of [[0, 5], [6, 11]]) {
    for (let r = rs; r <= re; r++)
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) addEdge(r, c, r, c + 1, false);
        if (r + 1 <= re) addEdge(r, c, r + 1, c, false);
      }
  }
  // 山界三通道（皆為鐵路）
  addEdge(5, 0, 6, 0, true); addEdge(5, 2, 6, 2, true); addEdge(5, 4, 6, 4, true);
  // 鐵路：橫向 r1, r5, r6, r10 全列
  for (const r of [1, 5, 6, 10])
    for (let c = 0; c + 1 < COLS; c++) addEdge(r, c, r, c + 1, true);
  // 鐵路：縱向 c0, c4（r1-r5 與 r6-r10）
  for (const c of [0, 4]) {
    for (let r = 1; r < 5; r++) addEdge(r, c, r + 1, c, true);
    for (let r = 6; r < 10; r++) addEdge(r, c, r + 1, c, true);
  }
  // 行營斜線（每個行營連四角）
  for (const ck of CAMPS) {
    const [r, c] = ck.split(',').map(Number);
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr, nc = c + dc;
      const sameHalf = (r <= 5) === (nr <= 5);
      if (inBoard(nr, nc) && sameHalf) addEdge(r, c, nr, nc, false);
    }
  }
})();

/* ---------- 走法產生 ----------
 * 回傳 [{r, c, path:[{r,c}...], attack:bool}]
 * board: 12x5 陣列，元素為 piece 或 null
 */
function legalMoves(piece, board) {
  if (!piece.alive) return [];
  const R = ROLES.find(x => x.role === piece.role);
  if (R.immobile) return [];
  if (isHQ(piece.r, piece.c)) return [];          // 進大本營不得再動

  const out = [];
  const seen = new Set();
  const push = (r, c, path, attack) => {
    const k = key(r, c);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ r, c, path, attack });
  };

  // 一步（道路 / 鐵路 / 斜線皆可走一步）
  for (const nb of (ADJ.get(key(piece.r, piece.c)) || [])) {
    const occ = board[nb.r][nb.c];
    if (!occ) push(nb.r, nb.c, [{ r: nb.r, c: nb.c }], false);
    else if (occ.side !== piece.side && !isCamp(nb.r, nb.c))
      push(nb.r, nb.c, [{ r: nb.r, c: nb.c }], true);
  }

  // 鐵路行駛
  if (piece.role === '工兵') {
    // 工兵：鐵路上可轉彎（BFS）
    const start = key(piece.r, piece.c);
    const visited = new Set([start]);
    const queue = [{ r: piece.r, c: piece.c, path: [] }];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of (ADJ.get(key(cur.r, cur.c)) || [])) {
        if (!isRailEdge(cur.r, cur.c, nb.r, nb.c)) continue;
        const k = key(nb.r, nb.c);
        if (visited.has(k)) continue;
        visited.add(k);
        const occ = board[nb.r][nb.c];
        const path = cur.path.concat([{ r: nb.r, c: nb.c }]);
        if (!occ) {
          push(nb.r, nb.c, path, false);
          queue.push({ r: nb.r, c: nb.c, path });
        } else if (occ.side !== piece.side && !isCamp(nb.r, nb.c)) {
          push(nb.r, nb.c, path, true);   // 停在敵子；不可穿越
        }
      }
    }
  } else {
    // 其他棋子：鐵路直線
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let cr = piece.r, cc = piece.c;
      const path = [];
      while (true) {
        const nr = cr + dr, nc = cc + dc;
        if (!inBoard(nr, nc) || !isRailEdge(cr, cc, nr, nc)) break;
        const occ = board[nr][nc];
        path.push({ r: nr, c: nc });
        if (!occ) {
          push(nr, nc, path.slice(), false);
          cr = nr; cc = nc;
        } else {
          if (occ.side !== piece.side && !isCamp(nr, nc))
            push(nr, nc, path.slice(), true);
          break;
        }
      }
    }
  }
  return out;
}

/* ---------- 戰鬥判定 ----------
 * 回傳 { attackerDies, defenderDies, flagCaptured }
 */
function resolveBattle(att, def) {
  if (def.role === '軍旗') return { attackerDies: false, defenderDies: true, flagCaptured: true };
  if (def.role === '地雷') {
    if (att.role === '工兵') return { attackerDies: false, defenderDies: true, flagCaptured: false };
    if (att.role === '炸彈') return { attackerDies: true, defenderDies: true, flagCaptured: false };
    return { attackerDies: true, defenderDies: false, flagCaptured: false };
  }
  if (att.role === '炸彈' || def.role === '炸彈')
    return { attackerDies: true, defenderDies: true, flagCaptured: false };
  if (att.rank > def.rank) return { attackerDies: false, defenderDies: true, flagCaptured: false };
  if (att.rank < def.rank) return { attackerDies: true, defenderDies: false, flagCaptured: false };
  return { attackerDies: true, defenderDies: true, flagCaptured: false };
}

/* ---------- 建立棋子清單 ---------- */
let PIECE_ID = 0;
function createArmy(side) {
  const pieces = [];
  for (const R of ROLES) {
    for (let i = 0; i < R.n; i++) {
      const w = WEAPONS[side][R.role];
      pieces.push({
        id: 'p' + (PIECE_ID++), side, role: R.role, rank: R.rank,
        special: R.special || null, immobile: !!R.immobile,
        name: w.name, kind: w.kind, desc: w.desc,
        r: -1, c: -1, alive: true, revealed: false,
      });
    }
  }
  return pieces;
}

/* ---------- 佈陣（隨機合法） ----------
 * 限制：軍旗在大本營；地雷在後兩列；炸彈不在前線列；行營空
 */
function sideRows(side) { return side === 'CN' ? { back: [0, 1], front: 5, all: [0, 1, 2, 3, 4, 5] } : { back: [10, 11], front: 6, all: [6, 7, 8, 9, 10, 11] }; }

function randomSetup(side, pieces, rng) {
  rng = rng || Math.random;
  const rows = sideRows(side);
  const cells = [];
  for (const r of rows.all)
    for (let c = 0; c < COLS; c++)
      if (!isCamp(r, c)) cells.push({ r, c });

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const take = (pred) => {
    const idx = cells.findIndex(pred);
    return idx >= 0 ? cells.splice(idx, 1)[0] : null;
  };

  shuffle(cells);
  // 軍旗 → 大本營
  const flag = pieces.find(p => p.role === '軍旗');
  const hqCell = take(cl => isHQ(cl.r, cl.c));
  flag.r = hqCell.r; flag.c = hqCell.c;
  // 地雷 → 後兩列（偏好靠近軍旗）
  const mines = pieces.filter(p => p.role === '地雷');
  for (const m of mines) {
    const cell = take(cl => rows.back.includes(cl.r));
    m.r = cell.r; m.c = cell.c;
  }
  // 炸彈 → 非前線列
  const bombs = pieces.filter(p => p.role === '炸彈');
  for (const b of bombs) {
    const cell = take(cl => cl.r !== rows.front);
    b.r = cell.r; b.c = cell.c;
  }
  // 其餘隨機
  const rest = pieces.filter(p => p.r < 0);
  shuffle(rest);
  for (const p of rest) {
    const cell = cells.pop();
    p.r = cell.r; p.c = cell.c;
  }
}

/* 佈陣約束檢查（換位用） */
function setupCellOK(piece, r, c) {
  const rows = sideRows(piece.side);
  if (!rows.all.includes(r) || isCamp(r, c)) return false;
  if (piece.role === '軍旗') return isHQ(r, c);
  if (piece.role === '地雷') return rows.back.includes(r);
  if (piece.role === '炸彈') return r !== rows.front;
  return true;
}

/* 某方是否還有可動棋子 */
function hasAnyMove(side, board, pieces) {
  for (const p of pieces)
    if (p.alive && p.side === side && legalMoves(p, board).length > 0) return true;
  return false;
}
