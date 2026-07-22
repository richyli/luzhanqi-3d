/* =========================================================
 * ai.js — 電腦對手（中方）：深度 1 期望值評估
 * 只使用「已揭露」的玩家棋子資訊，未揭露者以機率分布估算
 * ========================================================= */

const AI_VALUE = { 9: 10, 8: 8, 7: 6.5, 6: 5, 5: 4.2, 4: 3.6, 3: 3.1, 2: 2.6, 1: 3.4 };
function pieceValue(p) {
  if (p.role === '軍旗') return 100;
  if (p.role === '地雷') return 4;
  if (p.role === '炸彈') return 5.5;
  return AI_VALUE[p.rank] || 3;
}

/* 玩家未揭露棋子的剩餘分布 */
function hiddenPool(pieces, side) {
  return pieces.filter(p => p.side === side && p.alive && !p.revealed);
}

/* AI 攻擊未知棋子的期望淨值 */
function expectedAttackValue(att, pool) {
  if (!pool.length) return 0;
  let ev = 0;
  for (const d of pool) {
    const res = resolveBattle(att, d);
    let gain = 0;
    if (res.flagCaptured) gain = 100;
    else {
      if (res.defenderDies) gain += pieceValue(d);
      if (res.attackerDies) gain -= pieceValue(att);
    }
    ev += gain;
  }
  return ev / pool.length;
}

/* 位置分：往敵方大本營推進 + 佔行營 */
function positionScore(piece, r, c) {
  if (piece.side !== 'CN') return 0;
  let s = (r - piece.r) * 0.12;                     // 往下推進（r 變大）
  if (isCamp(r, c)) s += 0.35;                      // 行營安全
  const dHQ = Math.min(Math.abs(r - 11) + Math.abs(c - 1), Math.abs(r - 11) + Math.abs(c - 3));
  s += (12 - dHQ) * 0.03;
  if (piece.rank >= 8) s -= 0.5;                    // 高階別衝太快
  if (piece.role === '工兵' && r >= 9) s += 0.4;    // 工兵晚期挖雷
  return s;
}

/* 走完後是否暴露在已知較強敵子攻擊範圍（粗略：相鄰檢查） */
function exposurePenalty(piece, r, c, board, pieces) {
  if (isCamp(r, c)) return 0;
  let pen = 0;
  for (const nb of (ADJ.get(key(r, c)) || [])) {
    const e = board[nb.r][nb.c];
    if (e && e.side !== piece.side && e.revealed) {
      if (e.role === '炸彈' || (e.rank > piece.rank && piece.role !== '炸彈'))
        pen = Math.max(pen, pieceValue(piece) * 0.45);
    }
  }
  return pen;
}

function aiChooseMove(state) {
  const { board, pieces } = state;
  const pool = hiddenPool(pieces, 'US');
  const moves = [];

  for (const p of pieces) {
    if (!p.alive || p.side !== 'CN') continue;
    for (const mv of legalMoves(p, board)) {
      let score = positionScore(p, mv.r, mv.c);
      if (mv.attack) {
        const def = board[mv.r][mv.c];
        if (def.revealed) {
          const res = resolveBattle(p, def);
          if (res.flagCaptured) score += 1000;
          else {
            if (res.defenderDies) score += pieceValue(def);
            if (res.attackerDies) score -= pieceValue(p) * 1.05;
            if (res.defenderDies && !res.attackerDies) score += 0.8;
          }
        } else {
          score += expectedAttackValue(p, pool);
          if (isHQ(mv.r, mv.c)) score += 3.0;        // 大本營裡可能是軍旗
          if (p.role === '工兵') {
            const rows = sideRows('US');
            if (rows.back.includes(mv.r)) score += 1.6;  // 後排可能地雷
          }
        }
      } else {
        score -= exposurePenalty(p, mv.r, mv.c, board, pieces);
        if (isHQ(mv.r, mv.c)) score -= 2.0;          // 進大本營鎖死
      }
      score += Math.random() * 0.55;
      moves.push({ piece: p, mv, score });
    }
  }
  if (!moves.length) return null;
  moves.sort((a, b) => b.score - a.score);
  return moves[0];
}
