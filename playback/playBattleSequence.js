// ==========================================
// PLAYBACK LOOP SYSTEM
// ==========================================

function renderChargeIndicator(charges, maxCharges, containerEl) {
  containerEl.querySelector('.charge-pips')?.remove();
  if (!containerEl) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'charge-pips';
  for (let i = 0; i < maxCharges; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip' + (i < charges ? ' filled' : '');
    wrapper.appendChild(pip);
  }
  containerEl.appendChild(wrapper);
}

let isBattleActive = true;

const ATTACK_CONFIG = {
  STR:     { duration: 850, impactTime: 0.4, class: 'attack-smash' },
  VANGUARD: { duration: 850, impactTime: 0.4, class: 'attack-smash' },
  NOVICE:   { duration: 850, impactTime: 0.4, class: 'attack-smash' }, // we will remove novice
  AGI: { duration: 450, impactTime: 0.15, class: 'attack-dash' },
  NIGHTSHADE: { duration: 450, impactTime: 0.15, class: 'attack-dash' },
  DEX: { duration: 450, impactTime: 0.15, class: 'attack-dash' },
  DEFAULT: { duration: 750, impactTime: 0.5, class: 'attack-lunge' }
};

let currentAttackId = 0;

const animationMap = {
  LIFESTEAL: "lifesteal-glow",
  BLOCK: "shield-flash",
  STUN: "stun-effect",
  ATTACK_START: "attack-lunge", // Will be overridden dynamically
  THORN_REFLECT: "hit-flash",
  TIME_WARP_TRIGGER: "lifesteal-glow",
};

async function pauseableSleep(ms) {
  const start = performance.now();
  while (true) {
    await new Promise(r => setTimeout(r, 50));
    if (!window._pauseBattle) {
      const elapsed = performance.now() - start;
      const remaining = ms - elapsed;
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
      return;
    }
  }
}

async function playBattleSequence(result, duration, timePerEvent) {
  const eventGroups = result.eventQueue;

  const playerAvatar = document.getElementById('playerAvatar');
  const enemyAvatar = document.getElementById('enemyAvatar');
  const arena = document.getElementById('fighterArena');
  const playerHpBar = document.getElementById('playerHpBar');
  const enemyHpBar = document.getElementById('enemyHpBar');
  const textEl = document.getElementById('battleLiveText');
  const progressBar = document.getElementById('battleProgressFill');

  for (const group of eventGroups) {
    if (!isBattleActive) break;

    VFX.cacheCombatAnchors(arena, playerAvatar, enemyAvatar);

    const groupAttackStart = group.find(e => e.type === 'ATTACK_START');
    let groupHasAttack = false;
    let groupConfig = ATTACK_CONFIG.DEFAULT;
    let attackId = 0;
    
    if (groupAttackStart) {
        groupHasAttack = true;
        groupConfig = ATTACK_CONFIG[groupAttackStart.attackType] || ATTACK_CONFIG.DEFAULT;
        attackId = ++currentAttackId;
        animationMap.ATTACK_START = groupConfig.class;

        // Skip CSS lunge for: Assassinate (uses vfx teleport) and INT/Mage (uses cast animation)
        const isAssassinateGroup = group.some(e => e.type === 'TIME_WARP_TRIGGER');
        const isMageAttack = ['INT', 'SPELLBLADE', 'NIGHTSHADE'].includes(groupAttackStart.attackType);

        if (!isMageAttack) {
            const isPlayer = groupAttackStart.source === 'You';
            const animTarget = isPlayer ? playerAvatar : enemyAvatar;
            
            animTarget.classList.remove('attack-smash', 'attack-dash', 'attack-lunge', 'attack-cast', 'cast-player', 'cast-enemy', 'hit-flash', 'echo-hit-flash', 'recoil-player', 'recoil-enemy');
            void animTarget.offsetHeight;

            const pRect = playerAvatar.getBoundingClientRect();
            const eRect = enemyAvatar.getBoundingClientRect();
            const distance = Math.max(0, eRect.left - pRect.right) + 50; // Deep overlap for visual impact
            animTarget.style.setProperty('--attack-distance', `${distance}px`);
            animTarget.classList.add(groupConfig.class); // Apply the smash/dash/lunge class
        }

        const isMageGroup = ['INT', 'SPELLBLADE', 'NIGHTSHADE'].includes(groupAttackStart.attackType);
        if (isMageGroup) {
            await pauseableSleep(620);
        } else {
            await pauseableSleep(100);
        }
    }

    const scheduleImpact = (fn) => {
        if (groupHasAttack && !['INT', 'SPELLBLADE'].includes(groupAttackStart.attackType)) {
            const delay = groupConfig.duration * groupConfig.impactTime;
            const scopedId = attackId;
            setTimeout(() => {
                if (currentAttackId !== scopedId) return;
                fn();
                if (groupConfig.class === 'attack-smash') {
                    const attackerEl = groupAttackStart.source === 'You' ? playerAvatar : enemyAvatar;
                    const defenderEl = groupAttackStart.source === 'You' ? enemyAvatar : playerAvatar;
                    if(attackerEl) attackerEl.style.animationPlayState = 'paused';
                    if(defenderEl) defenderEl.style.animationPlayState = 'paused';
                    setTimeout(() => {
                        window.requestAnimationFrame(() => {
                            if (attackerEl) attackerEl.style.animationPlayState = '';
                            if (defenderEl) defenderEl.style.animationPlayState = '';
                        });
                    }, 40);
                }
            }, delay);
        } else {
            fn(); 
        }
    };

    const hasBlizzardEvent = group.some(e =>
      e.type === 'CHILL_APPLY' || e.type === 'CHILL_SHATTER'
    );



    // ── Pre-scan: detect combined armor blocks in this group ──
    const thickEvent = group.find(e => e.type === 'THICK_HIDE_BLOCK');
    const ironEvent = group.find(e => e.type === 'IRON_WILL_BLOCK');
    const hasCombinedBlock = thickEvent && ironEvent && thickEvent.target === ironEvent.target;
    const hasFractureEvent = group.some(e => e.type === 'REALITY_FRACTURE');

    if (hasCombinedBlock) {
      const defenderIsPlayer = thickEvent.target === 'You';
      const attackerIsPlayer = thickEvent.source === 'You';
      const defenderEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
      const attackerEl = attackerIsPlayer ? playerAvatar : enemyAvatar;
      const hpBar = defenderIsPlayer
        ? document.getElementById('playerHpBar')
        : document.getElementById('enemyHpBar');
      const currentWidthPct = parseFloat(hpBar.style.width) || 100;
      const missingHP = 1 - (currentWidthPct / 100);

      const damageEvent = group.find(e => e.type === 'DAMAGE' && e.source === thickEvent.source);
      // Suppress the white damage number from the block animation if it's already being 
      // handled by a special hit animation (Crit, Assassinate, etc).
      const finalDamage = (damageEvent && !damageEvent.isCrit && !damageEvent.isAssassinate) ? damageEvent.value : null;

      scheduleImpact(() => {
        VFX.playArmorBlock(defenderEl, attackerEl, thickEvent.value, ironEvent.value, missingHP, finalDamage);
      });
    }

    for (const event of group) {
      if (!isBattleActive) break;

      while (window._pauseBattle) {
        await new Promise(r => setTimeout(r, 50));
      }


      if (event.type === 'DEATH') {
        isBattleActive = false;
      }


      const silentEvents = [
        'MOMENTUM_STACK', 'BERSERKER_STACK', 'CHARGE_UPDATE',
        'DOUBLE_STRIKE', 'ECHO_STRIKE', 'THICK_HIDE_BLOCK',
        'IRON_WILL_BLOCK', 'MAGIC_SHIELD_REFRESH', 'ES_RECHARGE',
        'DAMAGE', 'CRIT', 'ATTACK_START', 'REALITY_FRACTURE' , 'ES_ABSORB',
      ];

      const importantEvents = [
        'DEATH', 'BLEED_TICK', 'HEAL', 'DODGE', 'ES_DEPLETED',
        'CHILL_SHATTER', 'CHILL_APPLY', 'TIME_WARP_TRIGGER',
        'CORROSIVE_APPLY', 'BLEED_APPLY',
        'PHANTOM_STEP', 'SECOND_WIND', 'LIFETAP_DRAIN',
        'THORN_REFLECT', 'MIND_BLAST',
      ];


      if (event.type === 'ATTACK_START') {
        const typeKey = `ATTACK_${event.attackType}`;
        const strings = BATTLE_STRINGS[typeKey] || BATTLE_STRINGS.ATTACK_START;
        const rand = Math.floor(Math.random() * strings.length);
        const template = strings[rand] || "attacks!";
        textEl.textContent = template
          .replace("{source}", event.source)
          .replace("{target}", event.target);
      } else if (!silentEvents.includes(event.type)) {
        const logText = generateBattleLog(event);
        if (logText && !logText.startsWith('[') && event.value !== 0) {
          scheduleImpact(() => textEl.textContent = logText);
        }
      }

      if (importantEvents.includes(event.type)) {
        await pauseableSleep(75);
      } else if (group.length > 2) {
        await pauseableSleep(18);
      }

      if (event.resultingHP !== undefined && event.resultingHP !== -1 &&
        !(event.type === 'DAMAGE' && hasFractureEvent) &&
        !['DODGE', 'ATTACK_START', 'DEATH', 'ECHO_STRIKE', 'CHARGE_UPDATE', 'MOMENTUM_STACK', 'BLEED_APPLY', 'CORROSIVE_APPLY', 'TIME_WARP_TRIGGER', 'THICK_HIDE_BLOCK', 'IRON_WILL_BLOCK', 'PHANTOM_STEP', 'MAGIC_SHIELD_REFRESH', 'MAGIC_SHIELD_ABSORB', 'HEAL', 'BLOCK', 'DOUBLE_STRIKE', 'CRIT', 'BERSERKER_STACK', 'REALITY_FRACTURE'].includes(event.type)) {
        let belongsToPlayer = (event.target === 'You' || event.target === gameState.player.name);
        scheduleImpact(() => {
          if (belongsToPlayer) {
            setHpBar(true, event.resultingHP);
            const rawHP = Math.round((event.resultingHP / 100) * gameState.playerMaxHP);
            hpAnimators.player?.set(rawHP);
          } else {
            setHpBar(false, event.resultingHP);
            hpAnimators.enemy?.set(Math.round((event.resultingHP / 100) * result.enemyMaxHP));
          }
        });
      }

      if (event.type === 'ES_ABSORB' || event.type === 'ES_RECHARGE' || event.type === 'MAGIC_SHIELD_REFRESH') {
        const isPlayer = (event.target === 'You' || event.target === gameState.player.name);
        const maxHP = isPlayer ? gameState.playerMaxHP : result.enemyMaxHP;
        const maxES = event.maxES || (isPlayer ? gameState.playerMaxES : gameState.enemyMaxES);

        setEsBar(isPlayer, event.remainingES, maxES, maxHP);

        if (event.type === 'ES_ABSORB') {
          // Coalesce multiple ES absorbs from the same group (e.g. from Reality Fracture split damage)
          const allAbsorbs = group.filter(e => e.type === 'ES_ABSORB' && e.target === event.target);
          if (allAbsorbs[0] === event) {
            const totalAbsorb = allAbsorbs.reduce((sum, e) => sum + (e.value || 0), 0);
            scheduleImpact(() => {
              VFX.playEsAbsorb(
                isPlayer ? playerAvatar : enemyAvatar,
                totalAbsorb
              );
            });
          }
        }
      }

      if (event.type === 'CHILL_APPLY') {
        const defenderIsPlayer = event.target === 'You';
        const chilledEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
        chilledEl.classList.add('chilled');
        VFX.playBlizzard(chilledEl);
        await new Promise(r => setTimeout(r, 500)); // ← let chill settle before next event
      }

      if (event.type === 'CHILL_SHATTER') {
        const defenderIsPlayer = event.target === 'You';
        const shatteredEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
        shatteredEl.classList.remove('chilled');
        VFX.playShatter(shatteredEl);
        await new Promise(r => setTimeout(r, 600)); // ← let shatter animate before next event
      }

      if (event.type === 'CHILL_EXPIRE') {
        const defenderIsPlayer = event.target === 'You';
        const thawedEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
        thawedEl.classList.remove('chilled');
      }

      if (event.type === 'ES_DEPLETED') {
        const isPlayer = (event.target === 'You' || event.target === gameState.player.name);
        // Don't pass 0 as maxES — let the animator handle it
        const animator = isPlayer ? esAnimators.player : esAnimators.enemy;
        if (animator) animator.set(0);
      }

      const animClass = animationMap[event.type];

      if (animClass) {
        let animTarget = null;

        if (
          event.type === 'ATTACK_START' ||
          event.type === 'ECHO_STRIKE' ||
          event.type === 'LIFESTEAL'
        ) {
          animTarget = (event.source === 'You') ? playerAvatar : enemyAvatar;

        } else {
          animTarget = (event.target === 'You') ? playerAvatar : enemyAvatar;
        }

        // --- RANGED ATTACK LOGIC ---
        let finalAnim = animClass;

        if (event.type === 'ATTACK_START') {
          // console.log('[LUNGE] source:', event.source, '| animTarget:', animTarget?.id);
          const groupIndex = eventGroups.indexOf(group);
          const prevGroup = groupIndex > 0 ? eventGroups[groupIndex - 1] : [];
          const isEchoAttack = prevGroup.some(e => e.type === 'ECHO_STRIKE');
          if (isEchoAttack) {
            animTarget = null; // skip animation entirely for echo's ATTACK_START
          } else if (
            event.attackType === 'INT' ||
            event.attackType === 'SPELLBLADE' ||
            event.attackType === 'NIGHTSHADE'
          ) {
            const isPlayer = event.source === 'You';
            const sourceAv = isPlayer ? playerAvatar : enemyAvatar;
            const targetAv = isPlayer ? enemyAvatar : playerAvatar;
            const boltColor = event.vfxColor || '#8000ff';

            finalAnim = isPlayer ? 'cast-player' : 'cast-enemy';

            setTimeout(() => {
              if (!sourceAv || !targetAv) return;
              VFX.playMagicBolt(sourceAv, targetAv, boltColor);
            }, 80);
          } else {
            // STR / AGI / DEX — already handled by the new groupAttackStart system at top of group.
            // Class + distance are already applied. Skip re-applying here to avoid class flush.
            animTarget = null;
          }
        }

        if (animTarget) {
          animTarget.classList.remove('attack-smash', 'attack-dash', 'attack-lunge', 'attack-cast', 'cast-player', 'cast-enemy', 'hit-flash');
          void animTarget.offsetHeight;
          animTarget.classList.add(finalAnim);
        }

        // Arena shake only on real damage events
        if (event.type === 'DAMAGE' || event.type === 'REALITY_FRACTURE') {

          arena.classList.remove('shake');
          void arena.offsetHeight;
          arena.classList.add('shake');
        }
      }

      if (event.type === 'CHARGE_UPDATE') {
        const isPlayer = event.source === 'You';
        const containerEl = isPlayer
          ? document.getElementById('fighterPlayer')
          : document.getElementById('fighterEnemy');

        renderChargeIndicator(event.charges, event.maxCharges, containerEl);

        if (event.charges === 6) {
          containerEl.querySelector('.fighter-avatar').classList.add('assassinate-ready-container');
          await new Promise(r => setTimeout(r, 600));
        } else {
          containerEl.querySelector('.fighter-avatar').classList.remove('assassinate-ready-container');
        }
      }
      if (event.type === 'DAMAGE') {

        const attackerIsPlayer = event.source === 'You';
        const groupAttackStart = group.find(e => e.type === 'ATTACK_START');
        const attackType = groupAttackStart?.attackType || 'STR';
        const isMagicAttack = ['INT', 'SPELLBLADE', 'NIGHTSHADE'].includes(attackType);
        const groupHasCrit = group.some(e => e.type === 'DAMAGE' && e.isCrit === true && e.source === event.source);

    
        if (event.isAssassinate) {
          console.log('[DAMAGE-BRANCH] → ASSASSINATE');
          const defenderIsPlayer = (event.target === 'You' || event.target === gameState.player.name);
          const targetEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
          scheduleImpact(() => {
            VFX.playAssassinateDamage(targetEl, event.value);
          });
        } else if (event.isCrit) {
          scheduleImpact(() => {
            VFX.playCrit(
              attackerIsPlayer ? playerAvatar : enemyAvatar,
              attackerIsPlayer ? enemyAvatar : playerAvatar,
              event.value
            );
          });
        } else if (!hasCombinedBlock) {
          scheduleImpact(() => {
            VFX.playHit(
              attackerIsPlayer ? playerAvatar : enemyAvatar,
              attackerIsPlayer ? enemyAvatar : playerAvatar,
              event.value,
              isMagicAttack
            );
          });
        } else {
        }
      }

      if (event.type === 'DODGE') {
        const defenderIsPlayer = event.target === 'You';
        VFX.playDodge(
          defenderIsPlayer ? playerAvatar : enemyAvatar,
          defenderIsPlayer ? enemyAvatar : playerAvatar
        );
      }

      if (event.type === 'ECHO_STRIKE') {
        const attackerIsPlayer = event.source === 'You';
        /* VFX.playEchoStrike(
             attackerIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar'),
             attackerIsPlayer ? document.getElementById('enemyAvatar') : document.getElementById('playerAvatar')
         );*/
      }

      if (event.type === 'BLEED_APPLY') {
        const defenderIsPlayer = event.target === 'You';
        VFX.playBleedApplied(
          defenderIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar'),
          event.stackCount
        );
      }

      if (event.type === 'CORROSIVE_APPLY') {
        const defenderIsPlayer = event.target === 'You';
        VFX.playCorrosiveTouch(
          defenderIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar')
        );
      }

if (event.type === 'BLEED_TICK') {
    const defenderIsPlayer = event.target === 'You';
    const defenderEl = defenderIsPlayer 
        ? document.getElementById('playerAvatar') 
        : document.getElementById('enemyAvatar');

    defenderEl._pendingBleedDmg = (defenderEl._pendingBleedDmg || 0) + event.value;
    defenderEl._pendingBleedMaxStacks = Math.max(defenderEl._pendingBleedMaxStacks || 0, event.stacks || 1);
    
    clearTimeout(defenderEl._bleedFlushTimer);
    defenderEl._bleedFlushTimer = setTimeout(() => {
        const stacks = defenderEl._pendingBleedMaxStacks;
        console.log(`BLEED FLUSH — stacks: ${stacks}, totalDmg: ${defenderEl._pendingBleedDmg}`);
        VFX.playBleedTick(defenderEl, defenderEl._pendingBleedDmg, stacks);
        defenderEl._pendingBleedDmg = 0;
        defenderEl._pendingBleedMaxStacks = 0;
    }, 420);
}

      if (event.type === 'DOUBLE_STRIKE') {
        const attackerIsPlayer = event.source === 'You';
        VFX.playDoubleStrike(
          attackerIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar'),
          attackerIsPlayer ? document.getElementById('enemyAvatar') : document.getElementById('playerAvatar')
        );
      }

    if (event.type === 'TIME_WARP_TRIGGER') {
    const attackerIsPlayer = event.source === 'You';

    // Wait for the triggering attack's lunge to finish before assassinate fires
    const lungeWait = Math.max(0, groupConfig.duration - 100); // subtract the 100ms already slept
    await pauseableSleep(lungeWait);

    VFX.playTimeWarp(
        attackerIsPlayer ? playerAvatar : enemyAvatar
    );
    VFX.playAssassinate(
        attackerIsPlayer ? playerAvatar : enemyAvatar,
        attackerIsPlayer ? enemyAvatar : playerAvatar
    );
}

      if (event.type === 'LIFETAP_DRAIN') {
        const isPlayer = event.source === 'You';
        if (isPlayer) {
          setHpBar(true, event.resultingHP);
          const rawHP = Math.round((event.resultingHP / 100) * gameState.playerMaxHP);
          hpAnimators.player?.set(rawHP);
        } else {
          setHpBar(false, event.resultingHP);
          hpAnimators.enemy?.set(Math.round((event.resultingHP / 100) * result.enemyMaxHP));
        }
        VFX.playLifetap(
          isPlayer ? playerAvatar : enemyAvatar,
          isPlayer ? enemyAvatar : playerAvatar,
          event.value
        );
      }

      if (event.type === 'HEAL' && event.mutation !== 'Second Wind') {
        const isPlayer = event.target === 'You';
        if (isPlayer) {
          setHpBar(true, event.resultingHP);
          const rawHP = Math.round((event.resultingHP / 100) * gameState.playerMaxHP);
          hpAnimators.player?.set(rawHP);
        } else {
          setHpBar(false, event.resultingHP);
          hpAnimators.enemy?.set(Math.round((event.resultingHP / 100) * result.enemyMaxHP));
        }
        VFX.playLifestealHeal(
          isPlayer ? playerAvatar : enemyAvatar,
          event.value
        );
      }

      if (event.type === 'PHANTOM_STEP') {
        const attackerIsPlayer = event.source === 'You';
        VFX.playPhantomStep(
          attackerIsPlayer ? playerAvatar : enemyAvatar,
          attackerIsPlayer ? enemyAvatar : playerAvatar
        );
      }

      if (event.type === 'BERSERKER_STACK') {
        const isPlayer = event.source === 'You';
        VFX.playBerserkerStack(
          isPlayer ? playerAvatar : enemyAvatar,
          event.stacks,
          event.maxStacks
        );
      }

      // Solo Thick Hide only — skip if combined already fired
      if (event.type === 'THICK_HIDE_BLOCK' && !hasCombinedBlock) {
        const defenderIsPlayer = event.target === 'You';
        const attackerIsPlayer = event.source === 'You';
        scheduleImpact(() => {
          VFX.playThickHide(
            defenderIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar'),
            attackerIsPlayer ? document.getElementById('playerAvatar') : document.getElementById('enemyAvatar'),
            event.value
          );
        });
      }

      // Solo Iron Will only — skip if combined already fired
      if (event.type === 'IRON_WILL_BLOCK' && !hasCombinedBlock) {
        const defenderIsPlayer = event.target === 'You';
        const attackerIsPlayer = event.source === 'You';
        const defenderEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
        const attackerEl = attackerIsPlayer ? playerAvatar : enemyAvatar;
        const hpBar = defenderIsPlayer
          ? document.getElementById('playerHpBar')
          : document.getElementById('enemyHpBar');
        const currentWidthPct = parseFloat(hpBar.style.width) || 100;
        const missingHP = 1 - (currentWidthPct / 100);
        scheduleImpact(() => {
          VFX.playIronWill(defenderEl, attackerEl, event.value, missingHP);
        });
      }


      if (event.type === 'BLOCK' && event.mutation === 'Second Wind') {
        const isPlayer = event.target === 'You';
        const avatarEl = isPlayer
          ? document.getElementById('playerAvatar')
          : document.getElementById('enemyAvatar');

        const healEvent = group.find(e => e.type === 'HEAL' && e.target === event.target);

        await new Promise(r => setTimeout(r, 400));
        VFX.playSecondWind(avatarEl, healEvent ? healEvent.value : 0);
        await new Promise(r => setTimeout(r, 300));

        if (healEvent) {
          if (isPlayer) {
            setHpBar(true, healEvent.resultingHP);
          } else {
            setHpBar(false, healEvent.resultingHP);
          }
        }
      }

      if (event.type === 'REALITY_FRACTURE') {
        const defenderIsPlayer = event.target === 'You';
        const attackerIsPlayer = event.source === 'You';

        // Update ES bar silently
        if (event.remainingES !== undefined) {
          const maxHP = defenderIsPlayer ? gameState.playerMaxHP : result.enemyMaxHP;
          setEsBar(defenderIsPlayer, event.remainingES, event.maxES, maxHP);
        }

        // Update HP bar here instead of the general block
        if (event.resultingHP !== undefined) {
          if (defenderIsPlayer) {
            setHpBar(true, event.resultingHP);
            hpAnimators.player?.set(event.resultingHPRaw ?? Math.round((event.resultingHP / 100) * gameState.playerMaxHP));
          } else {
            setHpBar(false, event.resultingHP);
            hpAnimators.enemy?.set(event.resultingHPRaw ?? Math.round((event.resultingHP / 100) * result.enemyMaxHP));
          }
        }

        const targetEl = defenderIsPlayer ? playerAvatar : enemyAvatar;
        const attackerEl = attackerIsPlayer ? playerAvatar : enemyAvatar;
        const normalizedInt = Math.min((attackerIsPlayer
          ? gameState.player.intelligence
          : gameState.pendingOpponent?.intelligence ?? 50) / 545, 1);
        const intensity = 0.6 + normalizedInt * 0.8;

        VFX.playRealityFracture(targetEl, attackerEl, intensity, event.value);
      }


    } // ← end inner loop

    if (!isBattleActive) {
      await new Promise(r => setTimeout(r, 300));
      arena.classList.remove('shake');
      void arena.offsetHeight;
      arena.classList.add('shake');
      break;
    }

    /* await new Promise(r => setTimeout(r, timePerEvent));*/
    // 1. Density scaling — bigger groups get more breathing room
    const densityFactor = Math.min(group.length / 3, 2);
    const groupDelay = timePerEvent * densityFactor;

    // 2. Slight escalation — late fight feels faster but still readable
    const progress = eventGroups.indexOf(group) / eventGroups.length;
    const escalation = 1 - progress * 0.15;

    await pauseableSleep(groupDelay * escalation);
  }  // ← end outer loop // ← end outer loop

  progressBar.style.transition = 'none';
  progressBar.style.width = '100%';

  resolveBattle(result);
}
