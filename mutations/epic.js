// --- EPIC MUTATIONS ---
class EchoStrike extends Mutation {
  constructor() {
    super('Echo Strike', 'Epic', 'Chance to repeat your attack with reduced damage. Limited to 1 echo per turn.');
    this.scaling = { str: 1.0, agi: 0, hp: 0 };
    this.baseChance = 0.15; // put 1 and test animation todo fix
    this.maxChance = 0.40;
    this.maxEchoPerTurn = 1;
    this.echoDamageMultiplier = 0.6;
  }

  onTurnStart(state, owner, opponent) {
    if (state.flags) state.flags.echoCount = 0;
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (attackContext.isEcho) return;
    if (attackContext.isDodged) return;
    if (attackContext.isAssassinate) return; // ← add this
    if (attackContext.isPhantomStep) return; // ← add this
    if (owner.currentHP <= 0 || opponent.currentHP <= 0) return;

    // Cap check
    if (!state.flags) state.flags = {};
    if ((state.flags.echoCount || 0) >= this.maxEchoPerTurn) return;

    const procChance = this.baseChance +
      (this.maxChance - this.baseChance) * Math.min(owner.str / 545, 1);

    if (Math.random() < procChance) {
      state.flags.echoCount = (state.flags.echoCount || 0) + 1;

      state.flushGroup();

      state.pushEvent({
        type: 'ECHO_STRIKE',
        source: owner.name,
        target: opponent.name,
        mutation: this.name
      });

      state.flushGroup(); // ← echo gets its own group, natural playback gap

      state.engine._queuedAttacks = state.engine._queuedAttacks || [];
      state.engine._queuedAttacks.push([owner, opponent, {
        isEcho: true,
        damageMultiplier: this.echoDamageMultiplier,
      }]);
    }
  }
}

class CorrosiveTouch extends Mutation {
  constructor() {
    super('Corrosive Touch', 'Epic', 'On hit: applies a corrosive bleed (scales with enemy HP). All bleeds on target escalate by +1 each turn.');
    this.scaling = { str: 0, agi: 1.0, hp: 0 };
  }

  onAfterDamage(_state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isEcho) return;
    if (opponent.currentHP <= 0) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    if (damageContext.finalDamage <= 0) return;

    const alreadyApplied = opponent.statusEffects.some(
      ef => ef.name === 'Bleed' && ef.isCorrosive && ef.source === owner.name
    );
    if (alreadyApplied) return;

opponent.statusEffects.push({
    name: 'Bleed',
    value: owner._corrosiveValue || Math.max(1, Math.floor(Math.sqrt(opponent.maxHP) * 0.35)),
    duration: 3,
    source: owner.name,
    isCorrosive: true,
});
    _state.pushEvent({ type: 'CORROSIVE_APPLY', source: owner.name, target: opponent.name });
  }

  onTurnStart(_state, owner, opponent) {
    const { agi } = this.getScalingValue(owner);
    const escalation = Math.max(1, Math.floor(1 + agi * 2));
    for (const ef of opponent.statusEffects) {
      if (ef.name === 'Bleed' && ef.source === owner.name) {
        ef.value += escalation;
        ef.stacks = (ef.stacks || 1) + 1;  // ← increment
        owner._corrosiveStacks = ef.stacks;  // ← save it
      }
    }
  }
}

class Momentum extends Mutation {
  constructor() {
    super('Momentum', 'Epic',
      'Consecutive hits build stacks (max 10). Each stack increases damage based on STR. Resets on dodge.');
    this.scaling = { str: 1.0, agi: 0, hp: 0 };
    this.maxStacks = 10;
    this.baseBonusPerStack = 0.05;  // 3% at no investment
    this.maxBonusPerStack = 0.12;  // 8% at full STR investment
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;

    const stacks = owner.flags.momentumStacks || 0;
    if (stacks === 0) return;

    const normalizedStr = Math.min(owner.str / 545, 1);
    const bonusPerStack = this.baseBonusPerStack +
      (this.maxBonusPerStack - this.baseBonusPerStack) * normalizedStr;

    attackContext.damageMultiplier += stacks * bonusPerStack;
  }

  onAfterDamage(state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;

    if (damageContext.finalDamage > 0 && !damageContext.isDodged && !damageContext.prevented) {
      owner.flags.momentumStacks = Math.min(this.maxStacks, (owner.flags.momentumStacks || 0) + 1);
      state.pushEvent({
        type: 'MOMENTUM_STACK',
        source: owner.name,
        target: owner.name,
        stacks: owner.flags.momentumStacks
      });
    } else {
      owner.flags.momentumStacks = 0;
    }
  }
}

class Lifetap extends Mutation {
  constructor() {
    super('Lifetap', 'Epic',
      'Each attack drains HP to deal MASSIVE bonus damage. Power increases drastically as your HP drops.');
    this.scaling = { hp: 0.6, int: 0.4 };
    this.baseDrainPercent = 0.02;   // 2% at full
    this.maxDrainPercent = 0.06;    // 6% at low (more sustainable)
    this.baseBonusMulti = 0.25;     // +25% damage start
    this.maxBonusMulti = 1.25;      // +125% damage at near-death
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner || owner.currentHP <= 1) return;

    const { int: normalizedInt } = this.getScalingValue(owner);
    const hpDesperation = 1 - (owner.currentHP / owner.maxHP);

    let t = (hpDesperation * 0.6) + (normalizedInt * 0.4);
    t = Math.max(0, Math.min(1, t));

    // DRAIN LOGIC
    const drainPercent = this.baseDrainPercent + (this.maxDrainPercent - this.baseDrainPercent) * t;
    const drainAmount = Math.floor(owner.maxHP * drainPercent);

    // SAFETY FIX: If we have 1 HP, drain 0. Otherwise, don't let it go below 1.
    const actualDrain = owner.currentHP > 1
      ? Math.min(drainAmount, owner.currentHP - 1)
      : 0;

    owner.currentHP -= actualDrain;

    // DAMAGE LOGIC (BUFFED)
    const bonusMulti = this.baseBonusMulti + (this.maxBonusMulti - this.baseBonusMulti) * t;
    attackContext.damageMultiplier += bonusMulti;

    state.pushEvent({
      type: 'LIFETAP_DRAIN',
      value: actualDrain,
      source: owner.name,
      target: owner.name,
      resultingHP: Math.floor((owner.currentHP / owner.maxHP) * 100)
    });
  }
}

class ThickHide extends Mutation {
  constructor() {
    super('Thick Hide', 'Epic', 'Reduces incoming physical damage. Scales with STR (2 base → 27 at max investment).');
    this.scaling = { str: 1, agi: 0, hp: 0 };
    this.baseReduction = 2;
    this.maxReduction = 27; // at STR 545
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;

    const bypassTypes = ['BLEED', 'BLEED_TICK', 'CORROSIVE', 'TRUE_DAMAGE', 'THORN_REFLECT'];
    if (bypassTypes.includes(damageContext.type)) return;

    const normalizedStr = Math.min(owner.str / 545, 1);
    const reduction = Math.floor(
      this.baseReduction + (this.maxReduction - this.baseReduction) * normalizedStr
    );

    const originalDamage = damageContext.finalDamage;
    damageContext.finalDamage = Math.max(1, damageContext.finalDamage - reduction);

    if (originalDamage !== damageContext.finalDamage) {
      state.pushEvent({
        type: 'THICK_HIDE_BLOCK',
        value: reduction,
        source: opponent.name,  // attacker
        target: owner.name,     // defender (who blocked)
        mutation: this.name
      });
    }
  }
}

class Blizzard extends Mutation {
  constructor() {
    super(
      'Blizzard',
      'Epic',
      'On hit: chance to Chill the enemy, reducing dodge. Attacking a Chilled target converts the hit into a Shatter for bonus magic damage. INT increases proc chance and shatter power.'
    );
    this.scaling = { int: 1.0 };
  }

  onTurnStart(state, owner, opponent) {
    // Proper cooldown decay (fixes permanent lockout bug)
    if (opponent.flags?.freezeCooldown > 0) {
      opponent.flags.freezeCooldown--;
    }
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;

    const chillIndex = opponent.statusEffects.findIndex(ef => ef.name === 'Chill');
    if (chillIndex === -1) return;

    const chill = opponent.statusEffects[chillIndex];

    // 🔥 CONVERT HIT INTO SHATTER (no cancel, no double hit)
    damageContext.type = 'MAGIC';
    damageContext.finalDamage = Math.floor(
      damageContext.finalDamage * (1 + chill.shatterBonus)
    );

    // remove chill
    opponent.statusEffects.splice(chillIndex, 1);

    state.pushEvent({
      type: 'CHILL_SHATTER',
      source: owner.name,
      target: opponent.name,
      value: damageContext.finalDamage,
    });
  }

  onAfterDamage(state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (opponent.currentHP <= 0) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    if (damageContext.finalDamage <= 0) return;

    // Don’t apply chill if we just shattered
    if (damageContext.type === 'MAGIC' && damageContext.eventType === 'CHILL_SHATTER') return;

    const { int } = this.getScalingValue(owner);

    // prevent stacking
    if (opponent.statusEffects.some(ef => ef.name === 'Chill')) return;
    if ((opponent.flags.freezeCooldown || 0) > 0) return;

    // smoother scaling (less early spike)
    const procChance = Math.min(0.35, 0.08 + (int * 0.20));
    if (Math.random() > procChance) return;

    const duration = Math.min(4, 2 + Math.floor(int * 2)); // 2 → 4 turns
    const shatterBonus = 0.35 + (int * 0.40);              // 0.35 → 0.75

    opponent.statusEffects.push({
      name: 'Chill',
      duration,
      source: owner.name,
      shatterBonus,
    });

    opponent.flags.freezeCooldown = 3;

    state.pushEvent({
      type: 'CHILL_APPLY',
      source: owner.name,
      target: opponent.name,
      duration,
    });
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;

    if (opponent.statusEffects.some(ef => ef.name === 'Chill')) {
      attackContext.targetChilled = true;
    }
  }
}