class BattleEngine {
  constructor(playerData, enemyData) {
    this.state = new BattleState(playerData, enemyData);
    this.state.engine = this; // REQUIRED for mutations like Echo Strike
    this.fireHook('onBattleStart');
  }

  _absorbWithES(defender, damageContext) {
    if (defender.currentES <= 0) return;
    if (ES_BYPASS_TYPES.includes(damageContext.type)) return;
    if (damageContext.isDodged || damageContext.prevented) return;

    const absorbed = Math.min(defender.currentES, damageContext.finalDamage);
    if (absorbed <= 0) return;

    defender.currentES -= absorbed;
    damageContext.finalDamage -= absorbed;
    defender.flags.esTurnsSinceLastHit = 0;

    this.state.pushEvent({
      type: 'ES_ABSORB',
      value: absorbed,
      source: (defender === this.state.player) ? this.state.enemy.name : this.state.player.name,
      target: defender.name,
      remainingES: defender.currentES,
      maxES: defender.maxES,
    });

    if (defender.currentES <= 0) {
      this.state.pushEvent({ type: 'ES_DEPLETED', target: defender.name });
    }
  }

  fireHook(hookName, context = {}) {
    const fighters = [this.state.player, this.state.enemy];

    for (const owner of fighters) {
      const opponent = (owner === this.state.player)
        ? this.state.enemy
        : this.state.player;

      for (const mutation of owner.mutations) {
        if (typeof mutation[hookName] === 'function') {
          mutation[hookName](this.state, owner, opponent, context);
        }
      }
    }
  }

  // ==========================================
  // 💉 MANUAL DAMAGE (Bypasses Dodge, etc.)
  // ==========================================
  dealDamage(attacker, defender, amount, extraContext = {}) {
    const damageContext = {
      attacker,
      defender,
      baseDamage: amount,
      finalDamage: amount,
      isCrit: false,
      isDodged: false,
      isBlocked: false,
      prevented: false,
      ...extraContext
    };

    // 1. BEFORE DAMAGE
    this.fireHook('onBeforeDamage', damageContext);

    // 2. APPLY DAMAGE
    if (!damageContext.prevented) {


      // ES Absorption
      this._absorbWithES(defender, damageContext);

      defender.currentHP -= damageContext.finalDamage;

      if (!extraContext.silent) {
        this.state.pushEvent({
          type: extraContext.eventType || 'DAMAGE',
          value: damageContext.finalDamage,
          source: attacker.name,
          target: defender.name,
          ...extraContext
        });
      }

      if (defender.currentHP <= 0) {
        const secondWind = defender.mutations.find(m => m instanceof SecondWind);
        if (secondWind && !defender.flags.reviveUsed) {
          secondWind.triggerRevive(this.state, defender);
        }
        if (defender.currentHP <= 0) {
          this.state.pushEvent({ type: 'DEATH', target: defender.name });
          return;
        }
      }
    }

    // 3. AFTER DAMAGE
    this.fireHook('onAfterDamage', damageContext);
  }

  performAttack(attacker, defender, extraContext = {}) {
    // 🛑 Prevent re-entrant attacks (Echo Strike, Time Warp, etc.)
    if (this._isResolvingAttack) {
      this._queuedAttacks = this._queuedAttacks || [];
      this._queuedAttacks.push([attacker, defender, extraContext]);
      return;
    }

    this._isResolvingAttack = true;

    if (attacker.currentHP <= 0 || defender.currentHP <= 0) {
      this._isResolvingAttack = false;
      return;
    }

    const attackContext = {
      attacker,
      defender,
      damageMultiplier: 1.0,
      ...extraContext
    };

    // 1. BEFORE ATTACK
    this.fireHook('onBeforeAttack', attackContext);

    this.state.pushEvent({
      type: 'ATTACK_START',
      source: attacker.name,
      target: defender.name,
      attackType: attacker.attackType,
      vfxColor: attacker.vfxColor || '#ffffff'
    });

    // 2. DODGE
    const baseDodge = clamp(
      Math.pow(defender.agi / 175, 1.5) * 0.35,
      0.02,
      0.35
    );
    const dodgeChance = attackContext.targetChilled
      ? baseDodge * 0.40
      : baseDodge;

    const isDodged = attackContext.isAssassinate
      ? false
      : Math.random() < dodgeChance;

    attackContext.isDodged = isDodged;
    // This makes STR, AGI, and INT scale damage.
    // STR is most efficient (0.125), AGI (0.085), INT is slowest for raw dmg (0.05) as INT is utility-focused.
    const baseDamage = Math.max(1, Math.floor(9 + (attacker.str * 0.125) + (attacker.agi * 0.085) + (attacker.int * 0.05)));

    const damageContext = {
      attacker,
      defender,
      baseDamage,
      finalDamage: Math.floor(baseDamage * attackContext.damageMultiplier),
      isCrit: false,
      isDodged,
      isBlocked: false,
      prevented: false,
      ...extraContext
    };

    // 🛑 HARD STOP on dodge (prevents broken hooks & fake heals)
    // After dodge block — still fire onAfterDamage so fracture can clean up
    if (isDodged) {
      this.state.pushEvent({ type: 'DODGE', source: attacker.name, target: defender.name });
      this.fireHook('onBeforeDamage', damageContext); // lets mutations react to dodge
      this.fireHook('onAfterDamage', damageContext);  // fracture reads isDodged and handles it
      this.fireHook('onAfterAttack', attackContext);
      this._isResolvingAttack = false;
      this._processQueuedAttacks();
      return;
    }

    // And after the death check:
    if (defender.currentHP <= 0) {
      this.state.pushEvent({ type: 'DEATH', target: defender.name });
      this.fireHook('onAfterDamage', damageContext); // allow fracture to fire even on kill
      this._isResolvingAttack = false;
      return;
    }

    // 2.5 AGI CRIT MECHANIC — chance and damage scale with AGI
    const normalizedAgiCrit = Math.min(attacker.agi / 280, 1);
    const critChance = clamp(Math.pow(normalizedAgiCrit, 1.4) * 0.35, 0, 0.35);
    const isCrit = Math.random() < critChance;
    if (isCrit) {
      const critMulti = 1.4 + (normalizedAgiCrit * 0.50);
      damageContext.finalDamage = Math.floor(damageContext.finalDamage * critMulti);
      damageContext.isCrit = true;
    }

    // 3. BEFORE DAMAGE
    this.fireHook('onBeforeDamage', damageContext);

    // 4. APPLY DAMAGE
    if (!damageContext.prevented) {
      // ES Absorption
      this._absorbWithES(defender, damageContext);

      defender.currentHP -= damageContext.finalDamage;


      this.state.pushEvent({
        type: 'DAMAGE',
        value: damageContext.finalDamage,
        source: attacker.name,
        target: defender.name,
        isAssassinate: attackContext.isAssassinate || false,
        isCrit: damageContext.isCrit || false,
        isEcho: attackContext.isEcho || false,
      });

      if (defender.currentHP <= 0) {
        this.state.pushEvent({ type: 'DEATH', target: defender.name });
        this.fireHook('onAfterDamage', damageContext); // ← add this
        this._isResolvingAttack = false;
        return;
      }
    }

    // 5. AFTER DAMAGE
    this.fireHook('onAfterDamage', damageContext);

    // 6. AFTER ATTACK
    this.fireHook('onAfterAttack', attackContext);

    // 7. AGI DOUBLE STRIKE (NEW MECHANIC)
    // Up to 40% chance to attack again at 75% damage, scaling with AGI

    /*
if (!attackContext.isDoubleStrike && !attackContext.isAssassinate && !attackContext.isEcho) {
  const normalizedAgi = Math.min(attacker.agi / 250, 1);
  const doubleStrikeChance = normalizedAgi * 1;

  if (Math.random() < doubleStrikeChance) {
    this.state.pushEvent({
      type: 'DOUBLE_STRIKE',
      source: attacker.name,
      target: defender.name
    });

    // Queue the second strike
    this._queuedAttacks = this._queuedAttacks || [];
    this._queuedAttacks.push([attacker, defender, {
      isDoubleStrike: true,
      damageMultiplier: 0.75,
      queuedDelay: 5400
    }]);
  }
}
*/
    // ✅ Done resolving this attack
    this._isResolvingAttack = false;

    // 🔁 Process any queued attacks (Echo, Time Warp, etc.)
    this._processQueuedAttacks();
  }


  // ==========================================
  // 🔁 QUEUE PROCESSOR (NEW)
  // ==========================================
  _processQueuedAttacks() {
    if (!this._queuedAttacks || this._queuedAttacks.length === 0) return;
    if (this.state.player.currentHP <= 0 || this.state.enemy.currentHP <= 0) {
      this._queuedAttacks = [];
      return;
    }
    const next = this._queuedAttacks.shift();
    this.performAttack(...next);  // ← make sure this line is there
  }


  performHeal(target, amount, opts = {}) {
    const healContext = { target, amount, ...opts };
    this.fireHook('onBeforeHeal', healContext);

    if (opts.hardCap !== undefined) {
      healContext.amount = Math.min(healContext.amount, opts.hardCap);
    }

    if (healContext.amount > 0 && target.currentHP >= 0 && target.currentHP < target.maxHP) {
      target.currentHP = Math.min(target.maxHP, target.currentHP + healContext.amount);
      this.state.pushEvent({
        type: 'HEAL',
        value: healContext.amount,
        source: opts.source || target.name,
        target: target.name,
        mutation: opts.mutation || '',
        resultingHP: Math.floor((target.currentHP / target.maxHP) * 100),
      });
    }
  }

  // ==========================================
  // 🔁 TURN EXECUTION
  // ==========================================
  executeTurn(attacker, defender) {
    this.state.turnNumber++;

    // ES Recharge — only the active fighter recharges at their turn start
    const fighter = attacker;
    if (fighter.maxES > 0 && fighter.currentES < fighter.maxES) {
      if (fighter.flags.esTurnsSinceLastHit === undefined) {
        fighter.flags.esTurnsSinceLastHit = 0;
      }
      fighter.flags.esTurnsSinceLastHit++;

      const delay = fighter.flags.esRechargeDelay ?? 3; // Magic Shield can lower this
      if (fighter.flags.esTurnsSinceLastHit >= delay) {
        const recharged = Math.min(
          Math.floor(fighter.maxES * 0.50),
          fighter.maxES - fighter.currentES
        );
        if (recharged > 0) {
          fighter.currentES += recharged;
          this.state.pushEvent({
            type: 'ES_RECHARGE',
            value: recharged,
            target: fighter.name,
            remainingES: fighter.currentES,
            maxES: fighter.maxES,
          });
        }
      }
    }
    // 1. TURN START (Only for the active fighter)
    attacker.mutations.forEach(m => {
      if (typeof m.onTurnStart === 'function') m.onTurnStart(this.state, attacker, defender);
    });

    // STATUS EFFECTS
    let isStunned = false;

    attacker.statusEffects = attacker.statusEffects.filter(effect => {

      if (effect.name === 'Chill') {
        effect.justApplied = false;
      }

      if (effect.name === 'Stun') {
        isStunned = true;
      }


      if (effect.name === 'Daze') {
        if (!effect.applied) {
          const strPenalty = Math.floor(attacker.str * 0.20);
          const agiPenalty = Math.floor(attacker.agi * 0.20);
          attacker.str = Math.max(1, attacker.str - strPenalty);
          attacker.agi = Math.max(1, attacker.agi - agiPenalty);
          effect.strReduced = strPenalty;
          effect.agiReduced = agiPenalty;
          effect.applied = true;

          state.pushEvent({
            type: 'DAZE_TICK',
            source: effect.source,
            target: attacker.name,
            strPenalty,
            agiPenalty,
          });
        }
      }
if (effect.name === 'Bleed') {
    if (attacker.currentHP <= 0) return false;

    if (effect.isCorrosive) {
        const sourceOwner = this.state.player.name === effect.source
            ? this.state.player
            : this.state.enemy;
        sourceOwner._corrosiveValue = effect.value;
        if (effect.duration <= 1) {
            sourceOwner._corrosiveValue = null;
        }
    }

    const context = {
        attacker: null,
        defender: attacker,
        finalDamage: effect.value,
        isDodged: false,
        prevented: false,
        type: 'BLEED'
    };

    this.fireHook('onBeforeDamage', context);

    if (!context.prevented) {
        attacker.currentHP -= context.finalDamage;
    }

    this.fireHook('onAfterDamage', context);

    console.log('BLEED STATE:', {
    source: effect.source,
    isCorrosive: effect.isCorrosive,
    value: effect.value,
    duration: effect.duration,
    totalBleeds: attacker.statusEffects.filter(e => e.name === 'Bleed').length,
    allBleeds: attacker.statusEffects.filter(e => e.name === 'Bleed').map(e => ({
        source: e.source,
        value: e.value,
        duration: e.duration,
        isCorrosive: e.isCorrosive
    }))
});

    this.state.pushEvent({
        type: 'BLEED_TICK',
        value: context.finalDamage,
        source: effect.source,
        target: attacker.name,
        isCorrosive: effect.isCorrosive || false,
        resultingHP: Math.max(0, attacker.currentHP),
        stacks: attacker.statusEffects.filter(e => e.name === 'Bleed').reduce((sum, e) => sum + (e.stacks || 1), 0)
    });
}
      // Restore stats when Daze expires
      if (effect.duration <= 1 && effect.name === 'Daze') {
        attacker.str += (effect.strReduced || 0);
        attacker.agi += (effect.agiReduced || 0);

        state.pushEvent({
          type: 'DAZE_EXPIRE',
          target: attacker.name,
        });
      }



      if (effect.duration <= 1 && effect.name === 'Chill') {
        this.state.pushEvent({
          type: 'CHILL_EXPIRE',
          target: attacker.name,
        });
      }

      effect.duration--;
      return effect.duration > 0;
    });

    // Tick freeze cooldown ← HERE
    if (attacker.flags.freezeCooldown > 0) {
      attacker.flags.freezeCooldown--;
    }


    // 🔒 DEATH FROM BLEED — check Second Wind first
    const deadAttacker = attacker.currentHP <= 0;
    const deadDefender = defender.currentHP <= 0;

    // Trigger Second Wind if attacker died from bleed
    if (deadAttacker) {
      const secondWind = attacker.mutations.find(m => m instanceof SecondWind);
      if (secondWind && !attacker.flags.reviveUsed) {
        secondWind.triggerRevive(this.state, attacker);
      }
    }

    // Trigger Second Wind if defender died from bleed  ← ADD THIS BLOCK
    if (deadDefender) {
      const secondWind = defender.mutations.find(m => m instanceof SecondWind);
      if (secondWind && !defender.flags.reviveUsed) {
        secondWind.triggerRevive(this.state, defender);
      }
    }


    // Determine who actually dies after potential revives
    if (attacker.currentHP <= 0 && defender.currentHP <= 0) {
      this.state.pushEvent({ type: 'DEATH', target: attacker.name });
      this.state.flushGroup();
      return;
    }

    if (attacker.currentHP <= 0 || defender.currentHP <= 0) {
      const deadTarget = attacker.currentHP <= 0 ? attacker.name : defender.name;
      this.state.pushEvent({ type: 'DEATH', target: deadTarget });
      this.state.flushGroup();
      return;
    }

    // 2. STUN CHECK
    if (isStunned) {
      this.state.pushEvent({ type: 'STUN', target: attacker.name });

      attacker.mutations.forEach(m => {
        if (typeof m.onTurnEnd === 'function') m.onTurnEnd(this.state, attacker, defender);
      });
      this.state.flushGroup();
      return;
    }

    // 3. 🔥 MAIN ATTACK (NOW CLEAN)
    this.performAttack(attacker, defender);

    // 4. TURN END (Only for the active fighter)
    attacker.mutations.forEach(m => {
      if (typeof m.onTurnEnd === 'function') m.onTurnEnd(this.state, attacker, defender);
    });

    this.state.flushGroup();
  }

  // ==========================================
  // 🧠 FULL BATTLE LOOP
  // ==========================================
  runFullBattle() {
    let turnIsPlayer = (this.state.player.agi >= this.state.enemy.agi);

    while (this.state.player.currentHP > 0 && this.state.enemy.currentHP > 0) {
      if (this.state.turnNumber > 100) {
        const pPct = this.state.player.currentHP / this.state.player.maxHP;
        const ePct = this.state.enemy.currentHP / this.state.enemy.maxHP;

        if (pPct > ePct) this.state.enemy.currentHP = 0;
        else this.state.player.currentHP = 0;

        break;
      }

      const attacker = turnIsPlayer ? this.state.player : this.state.enemy;
      const defender = turnIsPlayer ? this.state.enemy : this.state.player;

      this.executeTurn(attacker, defender);

      turnIsPlayer = !turnIsPlayer;
    }

    const won = this.state.player.currentHP > 0;

    const margin = won
      ? this.state.player.currentHP / this.state.player.maxHP
      : this.state.enemy.currentHP / this.state.enemy.maxHP;


    return {
      won,
      opponent: gameState.pendingOpponent,
      margin: (1 - margin),
      advantage: (this.state.player.str > this.state.player.agi)
        ? 'strength'
        : 'agility',
      eventQueue: this.state.eventQueue,
      finalPlayerHP: Math.max(0, this.state.player.currentHP),
      finalEnemyHP: Math.max(0, this.state.enemy.currentHP),
      playerMaxHP: this.state.player.maxHP,
      enemyMaxHP: this.state.enemy.maxHP
    };
  }
}