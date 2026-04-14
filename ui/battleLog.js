function updateBattleLog(battleResult, eloDelta) {
  gameState.battleLog.unshift({
    won: battleResult.won,
    opponentName: battleResult.opponent.name,
    opponentElo: battleResult.opponent.elo,
    eloDelta,
  });
  if (gameState.battleLog.length > 5) gameState.battleLog.pop();
  renderBattleLog();
}

function renderBattleLog() {
  const container = document.getElementById('logEntries');

  if (gameState.battleLog.length === 0) {
    container.innerHTML = '<div class="log-empty">No battles fought yet. Enter the arena!</div>';
    return;
  }

  container.innerHTML = gameState.battleLog.map((entry, i) => {
    const cls = entry.won ? 'win' : 'loss';
    const icon = entry.won ? '✅' : '❌';
    const eloCls = entry.eloDelta >= 0 ? 'positive' : 'negative';
    const eloStr = entry.eloDelta >= 0 ? `+${entry.eloDelta}` : `${entry.eloDelta}`;
    return `
      <div class="log-entry ${cls}" style="animation-delay: ${i * 0.06}s">
        <span class="log-entry-icon">${icon}</span>
        <span class="log-entry-text">vs <strong>${entry.opponentName}</strong> (Elo ${entry.opponentElo})</span>
        <span class="log-entry-elo ${eloCls}">${eloStr}</span>
      </div>
    `;
  }).join('');
}