function updateStats(battleResult) {
  const player = gameState.player;
  const { won, opponent } = battleResult;

  const K = player.totalBattles < 10 ? 40 : (player.totalBattles < 30 ? 32 : 24);
  const expected = 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
  const actual = won ? 1 : 0;
  const eloDelta = Math.round(K * (actual - expected));

  player.elo = Math.max(100, player.elo + eloDelta);
  player.totalBattles++;

  let mutationGained = null; // Track if we got one

  if (won) {
    player.wins++;
    player.winStreak++;
    player.coins += 2;

    // 30% chance to gain a mutation on win
    if (Math.random() < 0.3) {
      const availableMutations = Object.keys(MUTATION_TYPES);

      // Ensure player.mutations array exists
      if (!player.mutations) player.mutations = [];

      // Find mutations the player DOESN'T already have
      const unowned = availableMutations.filter(name => !player.mutations.includes(name));

      if (unowned.length > 0) {
        const toAdd = unowned[Math.floor(Math.random() * unowned.length)];

        // Add it. If over 5, remove the oldest.
        player.mutations.push(toAdd);
        if (player.mutations.length > 5) {
          player.mutations.shift();
        }
        mutationGained = toAdd;
      }
    }

  } else {
    player.losses++;
    player.winStreak = 0;
    player.coins = Math.max(0, player.coins - 1);
  }

  // Hidden stats drift
  if (won) {
    if (battleResult.advantage === 'strength') player.strength = clamp(player.strength + 1, 10, 100);
    else player.agility = clamp(player.agility + 1, 10, 100);
  }

  return { eloDelta, mutationGained };
}

function startCooldown() {
  gameState.cooldownActive = true;
  gameState.cooldownTime = COOLDOWN_DURATION;

  const btn = document.getElementById('btnBattle');
  btn.disabled = true;
  btn.classList.add('cooldown');
  btn.innerHTML = `<span class="btn-icon">⏳</span> ${gameState.cooldownTime}s`;

  // Show cooldown panel
  const panel = document.getElementById('cooldownPanel');
  panel.classList.remove('hidden');

  const secondsEl = document.getElementById('cooldownSeconds');
  const circleEl = document.getElementById('cooldownCircle');
  const skipBtn = document.getElementById('btnSkip');

  // Update skip button state
  skipBtn.disabled = gameState.player.coins < SKIP_COST;

  // Initialize ring
  circleEl.style.strokeDasharray = CIRCUMFERENCE;
  circleEl.style.strokeDashoffset = '0';

  gameState.cooldownIntervalId = setInterval(() => {
    gameState.cooldownTime--;

    // Update ring
    const progress = (COOLDOWN_DURATION - gameState.cooldownTime) / COOLDOWN_DURATION;
    circleEl.style.strokeDashoffset = (progress * CIRCUMFERENCE).toFixed(2);

    // Update countdown text
    secondsEl.textContent = gameState.cooldownTime;
    btn.innerHTML = `<span class="btn-icon">⏳</span> ${gameState.cooldownTime}s`;

    if (gameState.cooldownTime <= 0) {
      endCooldown();
    }
  }, 1000);
}

function endCooldown() {
  if (gameState.cooldownIntervalId) {
    clearInterval(gameState.cooldownIntervalId);
    gameState.cooldownIntervalId = null;
  }

  gameState.cooldownActive = false;
  gameState.cooldownTime = 0;

  // Hide cooldown panel
  document.getElementById('cooldownPanel').classList.add('hidden');

  // Re-enable fight button
  const btn = document.getElementById('btnBattle');
  btn.disabled = false;
  btn.classList.remove('cooldown');
  btn.innerHTML = '<span class="btn-icon">⚔️</span> Fight!';
}

function skipCooldown() {
  if (!gameState.cooldownActive) return;
  if (gameState.player.coins < SKIP_COST) return;

  // Deduct coins
  gameState.player.coins -= SKIP_COST;
  updateCoinsUI();

  // End cooldown immediately
  endCooldown();
}

function trainPlayer() {
  // Don't allow training during battle
  if (gameState.isBattling) return;

  const player = gameState.player;
  const boost = Math.floor(Math.random() * 3) + 1;

  if (Math.random() < 0.5) {
    player.strength = clamp(player.strength + boost, 10, 100);
  } else {
    player.agility = clamp(player.agility + boost, 10, 100);
  }

  document.getElementById('strBar').style.width = player.strength + '%';
  document.getElementById('strValue').textContent = player.strength;
  document.getElementById('agiBar').style.width = player.agility + '%';
  document.getElementById('agiValue').textContent = player.agility;

  popAnimate(document.getElementById('strValue'));
  popAnimate(document.getElementById('agiValue'));

  const btn = document.getElementById('btnTrain');
  const origText = btn.innerHTML;
  btn.innerHTML = '<span class="btn-icon">✨</span> Trained!';
  btn.style.pointerEvents = 'none';
  setTimeout(() => {
    btn.innerHTML = origText;
    btn.style.pointerEvents = '';
  }, 800);
}

function resetGame() {
  if (gameState.isBattling) return;
  if (!confirm('Reset all progress? This cannot be undone.')) return;

  // Clear any active timers
  if (gameState.cooldownIntervalId) {
    clearInterval(gameState.cooldownIntervalId);
    gameState.cooldownIntervalId = null;
  }
  if (gameState.battleTimeoutId) {
    clearTimeout(gameState.battleTimeoutId);
    gameState.battleTimeoutId = null;
  }
  if (gameState.battleTextIntervalId) {
    clearInterval(gameState.battleTextIntervalId);
    gameState.battleTextIntervalId = null;
  }
  if (gameState.fighterAnimIntervalId) {
    clearInterval(gameState.fighterAnimIntervalId);
    gameState.fighterAnimIntervalId = null;
  }

  gameState.player = {
    elo: 1000,
    wins: 0,
    losses: 0,
    totalBattles: 0,
    strength: 50,
    agility: 100,
    winStreak: 0,
    coins: 20,
    mutations: ['Bloodletting', 'Corrosive Touch', 'Assasinate', 'Echo Strike']
  };
  gameState.battleLog = [];
  gameState.isBattling = false;
  gameState.cooldownActive = false;
  gameState.cooldownTime = 0;
  gameState.pendingOpponent = null;

  updateStatsUI(0);
  document.getElementById('resultPanel').classList.add('hidden');
  document.getElementById('battleOverlay').classList.add('hidden');
  document.getElementById('cooldownPanel').classList.add('hidden');
  renderBattleLog();
  renderMutations();

  const trendEl = document.getElementById('eloTrend');
  trendEl.textContent = '';
  trendEl.className = 'stat-trend';

  const btn = document.getElementById('btnBattle');
  btn.disabled = false;
  btn.classList.remove('fighting', 'cooldown');
  btn.innerHTML = '<span class="btn-icon">⚔️</span> Fight!';
}
