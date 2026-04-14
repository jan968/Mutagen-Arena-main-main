function showResult(battleResult, narrative, eloDelta) {
  const resultPanel = document.getElementById('resultPanel');
  const banner = document.getElementById('resultBanner');
  const icon = document.getElementById('resultIcon');
  const text = document.getElementById('resultText');
  const narrativeBox = document.getElementById('narrativeBox');
  const details = document.getElementById('battleDetails');

  resultPanel.classList.remove('hidden');

  if (battleResult.won) {
    banner.className = 'result-banner victory';
    icon.textContent = '🏆';
    text.textContent = 'VICTORY!';
  } else {
    banner.className = 'result-banner defeat';
    icon.textContent = '💀';
    text.textContent = 'DEFEAT';
  }

  narrativeBox.textContent = narrative;

  const eloDeltaStr = eloDelta >= 0 ? `+${eloDelta}` : `${eloDelta}`;
  const isClose = battleResult.margin < 0.35;
  const coinsChange = battleResult.won ? 3 : -1;
  details.innerHTML = `
    <span>vs ${battleResult.opponent.name}</span>
    <span>Opp. Elo: ${battleResult.opponent.elo}</span>
    <span>Δ Elo: ${eloDeltaStr}</span>
    <span>${isClose ? '⚡ Close fight' : '💥 Decisive'}</span>
    <span>${coinsChange >= 0 ? '+' : ''}${coinsChange} 🪙</span>
  `;

  // Handle mutation alert
  const alertBox = document.getElementById('mutationAlert');
  if (battleResult.mutationGained) {
    const mutName = battleResult.mutationGained;
    const mutObj = new MUTATION_TYPES[mutName]();
    let rarityColor = 'var(--text-primary)';
    if (mutObj.rarity === 'Rare') rarityColor = 'var(--accent-blue)';
    if (mutObj.rarity === 'Epic') rarityColor = 'var(--accent-purple)';
    if (mutObj.rarity === 'Legendary') rarityColor = 'var(--accent-orange)';

    alertBox.innerHTML = `🌟 <strong>Body Evolved!</strong> You gained: <span style="color: ${rarityColor}; font-weight: bold;">${mutName}</span>`;
    alertBox.classList.remove('hidden', 'fading');
    renderMutations();

    // Auto-hide alert after 5 seconds
    if (window._mutationTimeout) clearTimeout(window._mutationTimeout);
    window._mutationTimeout = setTimeout(() => {
      alertBox.classList.add('fading');
      // Wait for fade transition then hide truly
      setTimeout(() => alertBox.classList.add('hidden'), 500);
    }, 5000);
  } else {
    alertBox.classList.add('hidden');
  }

  // Re-trigger animations
  banner.style.animation = 'none';
  banner.offsetHeight;
  banner.style.animation = '';
  narrativeBox.style.animation = 'none';
  narrativeBox.offsetHeight;
  narrativeBox.style.animation = '';
}