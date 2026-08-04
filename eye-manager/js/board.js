/* Board, ladder, UCL, scouting — helpers used by state */
window.EYE_BOARD = (() => {
  const LADDER = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'rpl'];

  function targetForClub(club) {
    const rep = club.reputation || 70;
    if (club.customClub || rep < 62) return { place: 10, label: 'Избежать зоны вылета', cup: null };
    if (rep >= 88) return { place: 3, label: 'Топ-3', cup: 'semi' };
    if (rep >= 82) return { place: 4, label: 'Топ-4', cup: 'quarter' };
    if (rep >= 76) return { place: 6, label: 'Верхняя шестёрка', cup: 'quarter' };
    return { place: 8, label: 'Середина таблицы', cup: null };
  }

  function createBoard(club) {
    const t = targetForClub(club);
    return {
      confidence: club.customClub ? 72 : 65,
      targetPlace: t.place,
      targetLabel: t.label,
      cupTarget: t.cup,
      warnings: 0,
      sacked: false
    };
  }

  function applyMatchConfidence(board, won, drew, isCup) {
    let d = won ? 4 : drew ? 1 : -5;
    if (isCup) d = won ? 5 : -3;
    board.confidence = Math.max(0, Math.min(100, board.confidence + d));
    return board;
  }

  function seasonReview(board, place, cupReached) {
    let ok = place <= board.targetPlace;
    let bonus = ok ? 1 : 0;
    if (board.cupTarget === 'quarter' && ['1/4', '1/2', 'Финал', 'Чемпион'].includes(cupReached)) bonus++;
    if (board.cupTarget === 'semi' && ['1/2', 'Финал', 'Чемпион'].includes(cupReached)) bonus++;
    if (ok) board.confidence = Math.min(100, board.confidence + 12 + bonus * 4);
    else {
      board.confidence = Math.max(0, board.confidence - 15);
      board.warnings++;
    }
    const sacked = board.confidence < 22 || board.warnings >= 3;
    board.sacked = sacked;
    return { ok, sacked, bonus };
  }

  function neighborLeague(leagueId, dir) {
    const i = LADDER.indexOf(leagueId);
    if (i < 0) return null;
    const j = i + dir;
    if (j < 0 || j >= LADDER.length) return null;
    return LADDER[j];
  }

  return { LADDER, targetForClub, createBoard, applyMatchConfidence, seasonReview, neighborLeague };
})();
