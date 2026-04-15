function startBattle() {
  // Guard: prevent if battling or on cooldown
  if (gameState.isBattling || gameState.cooldownActive) return;

  gameState.isBattling = true;
  isBattleActive = true;

  // Disable button immediately
  const btn = document.getElementById('btnBattle');
  btn.disabled = true;
  btn.classList.add('fighting');
  btn.innerHTML = '<span class="btn-icon">⏳</span> Fighting...';

  // Hide previous result
  document.getElementById('resultPanel').classList.add('hidden');
  document.getElementById('cooldownPanel').classList.add('hidden');

  // Generate opponent
  gameState.pendingOpponent = generateOpponent(gameState.player.elo);


  const playerMaxHP = 150 + Math.floor(gameState.player.strength * 0.5);
  console.log('=== BATTLE START ===');
  console.log(`YOU — HP: ${playerMaxHP} | STR: ${gameState.player.strength} | AGI: ${gameState.player.agility} | INT: ${gameState.player.intelligence} | Mutations: ${gameState.player.mutations.join(', ') || 'none'}`);
  console.log(`${gameState.pendingOpponent.name} — HP: ${150 + Math.floor(gameState.pendingOpponent.strength * 0.5)} | STR: ${gameState.pendingOpponent.strength} | AGI: ${gameState.pendingOpponent.agility} | INT: ${gameState.pendingOpponent.intelligence || 50} | Mutations: ${(gameState.pendingOpponent.mutations || []).join(', ') || 'none'}`);
  console.log('====================');


  // Run the massive turn-based simulation instantly in code
  const engine = new BattleEngine(gameState.player, gameState.pendingOpponent);
  const result = engine.runFullBattle();

  gameState.playerMaxHP = result.playerMaxHP;
  gameState.enemyMaxHP = result.enemyMaxHP;

  // Update HP text
  document.getElementById('playerHpText').textContent = `${gameState.playerMaxHP} / ${gameState.playerMaxHP}`;
  document.getElementById('enemyHpText').textContent = `${result.enemyMaxHP} / ${result.enemyMaxHP}`;

  // Reset display HP for the visual phase
  gameState.playerDisplayHp = 100;
  gameState.enemyDisplayHp = 100;

  // Reset ES bars
  const pMaxES = Math.floor(gameState.playerMaxHP * (0.10 + (gameState.player.intelligence / 10) * 0.01));
  const eMaxES = Math.floor(result.enemyMaxHP * (gameState.pendingOpponent.intelligence / 10) * 0.01);

  initEsAnimators(pMaxES, pMaxES, eMaxES, eMaxES);

  setEsBar(true, pMaxES, pMaxES, gameState.playerMaxHP);
  setEsBar(false, eMaxES, eMaxES, result.enemyMaxHP);

  // Snap text immediately — no animation on battle start
  esAnimators.player.snap(pMaxES);
  esAnimators.enemy.snap(eMaxES);

  initHpAnimators(gameState.playerMaxHP, result.enemyMaxHP);
  hpAnimators.player.snap(gameState.playerMaxHP);
  hpAnimators.enemy.snap(result.enemyMaxHP);


  // Show battle overlay
  const overlay = document.getElementById('battleOverlay');
  overlay.classList.remove('hidden');

  // Fix: Show ONLY the intro message, hide live text initially
  const liveText = document.getElementById('battleLiveText');
  liveText.classList.remove('fade-in');
  liveText.style.opacity = '0';

  // Setup Intro Overlay
  const introOverlay = document.getElementById('battleIntro');
  introOverlay.classList.remove('active');
  void introOverlay.offsetWidth;
  introOverlay.classList.add('active');

  // Subtle fighter animation
  const pLayer = document.getElementById('fighterPlayer');
  const eLayer = document.getElementById('fighterEnemy');
  pLayer.classList.remove('intro-scale');
  eLayer.classList.remove('intro-scale');
  void pLayer.offsetWidth; // Reflow
  pLayer.classList.add('intro-scale');
  eLayer.classList.add('intro-scale');

  VFX.init();

  // Reset Arena & Avatars (clear all animation classes)
  const arena = document.getElementById('fighterArena');
  arena.classList.remove('shake', 'vfx-flash');

  const playerAv = document.getElementById('playerAvatar');
  const enemyAv = document.getElementById('enemyAvatar');
  const avatarClasses = ['attack-lunge', 'hit-flash', 'echo-hit-flash', 'stun-effect', 'lifesteal-glow', 'shield-flash', 'bleed-tick'];
  playerAv.classList.remove(...avatarClasses);
  enemyAv.classList.remove(...avatarClasses);

  document.getElementById('fighterPlayer').querySelector('.charge-pips')?.remove();
  document.getElementById('fighterEnemy').querySelector('.charge-pips')?.remove();

  // Dynamic Player Avatar
  if (playerAv) {
    const playerIdentity = getFighterIdentity(gameState.player);
    let playerImgUrl = 'assets/images/player_avatar.png'; // Default Rogue
    if (playerIdentity.attackType === 'STR') playerImgUrl = 'assets/images/player_warrior.png';
    if (playerIdentity.attackType === 'INT') playerImgUrl = 'assets/images/player_mage.png';
    playerAv.style.backgroundImage = `url('${playerImgUrl}')`;
  }

  // Set enemy name and class in the arena
  const oppIdentity = getFighterIdentity(gameState.pendingOpponent);
  document.getElementById('enemyNameLabel').textContent = `${gameState.pendingOpponent.name} [${oppIdentity.classTitle}]`;

  // Swap enemy avatar based on class
  if (enemyAv) {
    const isEnemyMage = ['INT', 'SPELLBLADE', 'NIGHTSHADE'].includes(oppIdentity.attackType);
    const enemyImgUrl = isEnemyMage ? 'assets/images/enemy_mage.png' : 'assets/images/warrior_avatar.webp';
    enemyAv.style.backgroundImage = `url('${enemyImgUrl}')`;
  }

  // Reset HP bars to full (skip animation for reset)
  const playerHpBar = document.getElementById('playerHpBar');
  const enemyHpBar = document.getElementById('enemyHpBar');
  playerHpBar.style.transition = 'none';
  enemyHpBar.style.transition = 'none';
  playerHpBar.style.width = '100%';  // ← set directly here only
  enemyHpBar.style.width = '100%';   // ← set directly here only
  setHpBar(true, 100);               // color class only now
  setHpBar(false, 100);
  void playerHpBar.offsetHeight;
  playerHpBar.style.transition = '';
  enemyHpBar.style.transition = '';

  const eventGroups = result.eventQueue;
  const timePerEvent = 504; 
  const totalDuration = eventGroups.length * timePerEvent;

  // Fix: Calculate extra hidden delays (e.g., 600ms pauses for full charges) 
  // to ensure the progress bar stays perfectly in sync with the visual loop.
  let extraDelay = 0;
  for (const group of eventGroups) {
    if (group.some(e => e.type === 'CHARGE_UPDATE' && e.charges === 4)) {
      extraDelay += 600;
    }
  }
  const actualDuration = (eventGroups.length * timePerEvent) + extraDelay;

  // Progress Bar
  const progressBar = document.getElementById('battleProgressFill');
  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';

  // Battle Start Logic (wrapped for safety and timing)
  let battleStarted = false;
  const startCombat = () => {
    console.log('[startCombat] called, battleStarted:', battleStarted); // ← first line
    if (battleStarted) return;
    battleStarted = true;



    introOverlay.classList.add('hidden');
    introOverlay.classList.remove('active');
    liveText.style.opacity = '';
    liveText.classList.add('fade-in');
    pLayer.classList.remove('intro-scale');
    eLayer.classList.remove('intro-scale');

    void progressBar.offsetHeight; // reflow
    progressBar.style.transition = `width ${actualDuration}ms linear`;
    progressBar.style.width = '100%';

    playBattleSequence(result, totalDuration, timePerEvent);
  };

  // Fallback safety (1.2s) - guarantees battle starts even if animation fails
  const safetyTimeout = setTimeout(startCombat, 1200);

  // Trigger based on animation end
  introOverlay.classList.add('active');
  const introText = introOverlay.querySelector('.battle-intro-text');
  introText.addEventListener('animationend', (e) => {
    if (e.target === introText) {
      clearTimeout(safetyTimeout);
      startCombat();
    }
  }, { once: true });
}

function resolveBattle(result) {
  // Stop live text cycling
  if (gameState.battleTextIntervalId) {
    clearInterval(gameState.battleTextIntervalId);
    gameState.battleTextIntervalId = null;
  }

  // Stop fighter animations
  if (gameState.fighterAnimIntervalId) {
    clearInterval(gameState.fighterAnimIntervalId);
    gameState.fighterAnimIntervalId = null;
  }

  // Update Stats based on the processed simulation
  const statChanges = updateStats(result);
  result.mutationGained = statChanges.mutationGained; // pass it forward
  const eloDelta = statChanges.eloDelta;

  // We no longer use simple narratives, but since the UI function expects one,
  // we'll assemble a final summary sentence.
  const narrative = result.won
    ? `You survived the arena with ${result.finalPlayerHP} HP remaining.`
    : `${result.opponent.name} struck the final blow, leaving you defeated at 0 HP.`;

  // Snap HP bars to final state dictated by the real simulation (using percentage)
  const pPct = Math.max(0, Math.floor((result.finalPlayerHP / (gameState.player.maxHP || gameState.playerMaxHP || 100)) * 100));
  const ePct = Math.max(0, Math.floor((result.finalEnemyHP / (result.enemyMaxHP || 100)) * 100));


  hpAnimators.player?.snap(result.finalPlayerHP);
  hpAnimators.enemy?.snap(result.finalEnemyHP);
  setHpBar(true, pPct);
  setHpBar(false, ePct);

  // Brief delay to show final HP state, then show results
  setTimeout(() => {
    // Hide overlay
    document.getElementById('battleOverlay').classList.add('hidden');

    // Show result
    updateStatsUI(eloDelta);
    showResult(result, narrative, eloDelta);
    updateBattleLog(result, eloDelta);

    // Clean up battle state
    gameState.isBattling = false;
    gameState.pendingOpponent = null;

    const btn = document.getElementById('btnBattle');
    btn.classList.remove('fighting');

    // Start cooldown
    startCooldown();
  }, 800);
}