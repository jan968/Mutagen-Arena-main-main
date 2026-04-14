function updateStatsUI(eloDelta) {
  const p = gameState.player;

  // Update Class Badge & Avatar
  const identity = getFighterIdentity(p);
  const badge = document.getElementById('classBadge');
  const avatar = document.getElementById('playerAvatar');

  if (badge) {
    badge.textContent = identity.classTitle;
    badge.style.borderColor = identity.vfxColor || 'rgba(255,255,255,0.15)';
    badge.style.color = identity.vfxColor || '#fff';
    badge.style.boxShadow = `0 0 15px ${identity.vfxColor}44`;
  }

  // Swap image based on class (for all player-side avatars)
  let imgUrl = 'assets/images/player_avatar.png'; // Default Assassin/Rogue
  if (identity.attackType === 'STR') imgUrl = 'assets/images/player_warrior.png';
  if (identity.attackType === 'INT') imgUrl = 'assets/images/player_mage.png';
  // Handle hybrid/advanced classes by checking their primary theme
  if (['SPELLBLADE', 'WARLOCK'].includes(identity.attackType)) imgUrl = 'assets/images/player_avatar.png';
  if (['NIGHTSHADE'].includes(identity.attackType)) imgUrl = 'assets/images/player_avatar.png';

  // Update both the profile view and the battle overlay avatars
  const playerAvatars = document.querySelectorAll('#playerAvatar, #playerAvatarProfile');
  playerAvatars.forEach(av => {
    av.style.backgroundImage = `url('${imgUrl}')`;
  });

  const eloEl = document.getElementById('eloValue');
  eloEl.textContent = p.elo;
  popAnimate(eloEl);

  const trendEl = document.getElementById('eloTrend');
  if (eloDelta > 0) {
    trendEl.textContent = `▲ +${eloDelta}`;
    trendEl.className = 'stat-trend up';
  } else if (eloDelta < 0) {
    trendEl.textContent = `▼ ${eloDelta}`;
    trendEl.className = 'stat-trend down';
  } else {
    trendEl.textContent = '— 0';
    trendEl.className = 'stat-trend';
  }

  const wr = p.totalBattles > 0
    ? Math.round((p.wins / p.totalBattles) * 100)
    : 0;
  document.getElementById('winRateValue').textContent = wr + '%';
  document.getElementById('totalBattlesValue').textContent = p.totalBattles;
  document.getElementById('winsValue').textContent = p.wins;
  document.getElementById('lossesValue').textContent = p.losses;
  document.getElementById('streakValue').textContent = p.winStreak;

  document.getElementById('strBar').style.width = p.strength + '%';
  document.getElementById('strValue').textContent = p.strength;
  document.getElementById('agiBar').style.width = p.agility + '%';
  document.getElementById('agiValue').textContent = p.agility;
  document.getElementById('intBar').style.width = p.intelligence + '%';
  document.getElementById('intValue').textContent = p.intelligence;

  // We no longer track standard HP in the hidden stat block from the previous step.
  // The 'hpValue' and 'hpBar' added to the UI were maxHP indicators.
  const hpLabel = document.getElementById('hpValue');
  if (hpLabel) {
    // 150 is the new "Base HP", 0.5 is the new scaling factor
    const maxHP = 150 + Math.floor(p.strength * 0.5);
    hpLabel.textContent = `${maxHP}/${maxHP}`;
  }

  updateCoinsUI();
}

function updateCoinsUI() {
  const el = document.getElementById('coinsValue');
  el.textContent = gameState.player.coins;
  popAnimate(el);
}

function popAnimate(el) {
  el.classList.remove('stat-pop');
  void el.offsetHeight;
  el.classList.add('stat-pop');
}

function renderMutations() {
  const container = document.getElementById('mutationsList');
  const countEl = document.getElementById('mutationCount');
  const mutations = gameState.player.mutations || [];

  countEl.textContent = `${mutations.length}/5`;

  if (mutations.length === 0) {
    container.innerHTML = '<div class="log-empty">No mutations yet. Win battles to evolve!</div>';
    return;
  }

  container.innerHTML = mutations.map(mName => {
    const mutObj = new MUTATION_TYPES[mName]();
    let rarityColor = 'var(--text-primary)';
    if (mutObj.rarity === 'Rare') rarityColor = 'var(--accent-blue)';
    if (mutObj.rarity === 'Epic') rarityColor = 'var(--accent-purple)';
    if (mutObj.rarity === 'Legendary') rarityColor = 'var(--accent-orange)';

    return `
      <div class="mutation-card" style="border-left: 3px solid ${rarityColor}">
        <div class="mutation-header">
          <strong style="color: ${rarityColor}">${mutObj.name}</strong>
          <span class="mutation-rarity" style="color: ${rarityColor}; font-size: 0.75rem;">${mutObj.rarity}</span>
        </div>
        <div class="mutation-desc">${mutObj.description}</div>
      </div>
    `;
  }).join('');
}