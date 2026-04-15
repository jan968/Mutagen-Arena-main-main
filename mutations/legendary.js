// --- LEGENDARY: AGI-SCALING ASSASSINATE ---
class TimeWarp extends Mutation {
  constructor() {
    super('Assassinate', 'Legendary',
      'Every 6 charges, strike with undodgeable burst. AGI scales damage multiplier.');
    this.scaling = { str: 0, agi: 1.0, hp: 0 };
  }

  onBattleStart(state, owner, opponent) {
    owner.flags = owner.flags || {};
    owner.flags.timeWarpCharges = 0;
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    // 1. Validation & Recursion Prevention
    if (attackContext.attacker !== owner || attackContext.isAssassinate) return;
    if (opponent.currentHP <= 0 || owner.currentHP <= 0) return;

    const MAX_CHARGES = 6;
    const normalizedAgi = Math.min(owner.agi / 545, 1);

    // 2. Charge Logic — AGI scales charge gain
    const group = state._currentGroup ?? [];
    const wasMitigated = group.some(e =>
      (e.type === 'DODGE' || e.type === 'BLOCK') && e.target === opponent.name
    );

    // Base: 1 charge/attack. AGI bonus: +1 at high AGI investment
    const baseGain = 1 + Math.floor(normalizedAgi * 0.5);
    const gain = baseGain;
    owner.flags.timeWarpCharges += gain;

    // 3. Update UI to show the gain
    state.pushEvent({
      type: 'CHARGE_UPDATE',
      source: owner.name,
      charges: Math.min(owner.flags.timeWarpCharges, MAX_CHARGES),
      maxCharges: MAX_CHARGES
    });

    // 4. Trigger Logic (Supports overflow/double triggers)
    while (owner.flags.timeWarpCharges >= MAX_CHARGES) {
      owner.flags.timeWarpCharges -= MAX_CHARGES;

      state.pushEvent({
        type: 'TIME_WARP_TRIGGER',
        source: owner.name,
        target: opponent.name,
        screenShake: true
      });

      state.engine.performAttack(owner, opponent, {
        isAssassinate: true,
        isEcho: true,
      });

      state.pushEvent({
        type: 'CHARGE_UPDATE',
        source: owner.name,
        charges: Math.min(owner.flags.timeWarpCharges, MAX_CHARGES),
        maxCharges: MAX_CHARGES
      });

      if (opponent.currentHP <= 0) break;
    }
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.isAssassinate) {
      const normalizedAgi = Math.min(owner.agi / 545, 1);

      // AGI-scaling multiplier: 1.3x at 0 AGI → 2.5x at max AGI
      const agiMultiplier = 1.3 + (normalizedAgi * 1.2);
      attackContext.damageMultiplier = (attackContext.damageMultiplier || 1) * agiMultiplier;

      // Undodgeable (precision strike identity)
      attackContext.canBeDodged = false;
      attackContext.canBeBlocked = false;
    }
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.isAssassinate && damageContext.attacker === owner) {
      // Undodgeable — force it to land
      damageContext.isDodged = false;
      damageContext.prevented = false;
      // NOTE: isTrueDamage removed — Thick Hide and armor now counter Assassinate
    }
  }
}

// --- LEGENDARY: STR-SCALING BERSERKER ---
class Berserker extends Mutation {
  constructor() {
    super('Berserker', 'Legendary',
      'Gain 2 Rage on attack (max 10). Rage boosts damage (+5% each) and lifesteal. STR investment curves up healing and softens vulnerability; AGI penalizes healing per hit. Rage decays by 1 when you don\'t attack.');
    this.scaling = { str: 1.0, agi: 0, hp: 0 };
    this.maxRage = 10;
    this.damagePerRage = 0.05;        // +5% per stack → max +50%
    this.vulnerabilityPerRage = 0.04; // +4%/stack at 0 STR → +2%/stack at max STR
    this.leechPerRage = 1;
  }

  onBattleStart(state, owner, opponent) {
    owner.flags = owner.flags || {};
    owner.flags.berserkerRage = 0;
    owner.flags.berserkAttackedThisTurn = false;
  }

  onTurnStart(state, owner, opponent) {
    owner.flags.berserkAttackedThisTurn = false;
  }

  onTurnEnd(state, owner, opponent) {
    if (!owner.flags.berserkAttackedThisTurn) {
      const prev = owner.flags.berserkerRage || 0;
      if (prev > 0) {
        owner.flags.berserkerRage = prev - 1;
        state.pushEvent({
          type: 'BERSERKER_STACK',
          source: owner.name,
          target: owner.name,
          stacks: owner.flags.berserkerRage,
          maxStacks: this.maxRage,
        });
      }
    }
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (attackContext.isEcho || attackContext.isDoubleStrike ||
      attackContext.isAssassinate || attackContext.isPhantomStep) return;

    owner.flags.berserkAttackedThisTurn = true;

    const prev = owner.flags.berserkerRage || 0;
    owner.flags.berserkerRage = Math.min(this.maxRage, prev + 2);

    state.pushEvent({
      type: 'BERSERKER_STACK',
      source: owner.name,
      target: owner.name,
      stacks: owner.flags.berserkerRage,
      maxStacks: this.maxRage,
    });
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    const rage = owner.flags.berserkerRage || 0;
    if (rage === 0) return;
    attackContext.damageMultiplier += rage * this.damagePerRage;
  }

  onAfterDamage(state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    if (damageContext.finalDamage <= 0) return;
    if (damageContext.isReflection) return;

    const rage = owner.flags.berserkerRage || 0;
    const normalizedStr = Math.min(owner.str / 250, 1);
    const normalizedAgi = Math.min(owner.agi / 545, 1);

    // Option A: quadratic STR curve — rewards commitment, punishes the middle
    // 0 STR = +0%,  half STR ≈ +1.5%,  full STR = +18%
    const strBonus = Math.pow(normalizedStr, 2) * 0.18;

    // Option C (softened): AGI penalty capped at -8% so pure AGI isn't destroyed
    // 0 AGI = -0%,  half AGI ≈ -4%,  full AGI = -8%
    const agiPenalty = Math.min(normalizedAgi * 0.1, 0.08);

    const rageBonus = rage * this.leechPerRage;

    // 1. STR-Based Ceiling (Capped at 15% absolute max)
    // Base is 6%, adds up to 9% more based on Strength squared.
    const leechCeiling = 0.06 + Math.pow(normalizedStr, 2) * 0.09;

    // 2. Leech Rate Calculation
    // Lowered base to 3% to prevent "unkillable" early game.
    const leechRate = clamp(
      0.03 + strBonus - agiPenalty + rageBonus,
      0.01,           // Minimum 1% floor
      leechCeiling    // Maximum 15% (at 1000 STR)
    );

    const rawHeal = Math.floor(damageContext.finalDamage * leechRate);
    const maxHealPerHit = Math.floor(owner.maxHP * 0.12);

    const healAmount = Math.min(rawHeal, maxHealPerHit);

    if (healAmount > 0) {
      state.engine.performHeal(owner, healAmount, {
        source: owner.name,
        mutation: 'Berserker',
        hardCap: Math.floor(owner.maxHP * 0.20) // 20% max per hit, even after doubling
      });
    }
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    const rage = owner.flags.berserkerRage || 0;
    if (rage === 0) return;

    // Quadratic STR curve mirrors the lifesteal scaling:
    // 0 STR = full +4%/stack (max +40%)
    // half STR ≈ +3.3%/stack
    // full STR = +2%/stack (max +20%)
    const normalizedStr = Math.min(owner.str / 250, 1);
    const vulnerabilityPerStack = this.vulnerabilityPerRage * (1 - Math.pow(normalizedStr, 2) * 0.5);

    damageContext.finalDamage = Math.floor(
      damageContext.finalDamage * (1 + rage * vulnerabilityPerStack)
    );
  }
}

class RealityFracture extends Mutation {
  constructor() {
    super(
      'Reality Fracture',
      'Legendary',
      'A portion of your damage fractures reality, ignoring Dodge and damage reduction. Half of the fractured damage pierces Energy Shield.'
    );
    this.scaling = { int: 1.0, str: 1.0, agi: 1.0 };
    this.baseFraction = 0.40;
    this.maxFraction = 0.60;
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isEcho) return;
    if (damageContext.type === 'TRUE_DAMAGE') return;
    if (damageContext.finalDamage <= 0) return;

    // Clear any stale fracture from a previous interrupted hit
    if (state.flags?._pendingFracture?.attacker === owner) {
      delete state.flags._pendingFracture;
    }

    if (damageContext.prevented) return;

    const { int } = this.getScalingValue(owner);
    const fraction = Math.min(
      this.maxFraction,
      this.baseFraction + (this.maxFraction - this.baseFraction) * int
    );

    const truePortion = Math.floor(damageContext.finalDamage * fraction);
    if (truePortion <= 0) return;

    const normalPortion = damageContext.finalDamage - truePortion;

    damageContext.finalDamage = normalPortion;

    if (!state.flags) state.flags = {};
    state.flags._pendingFracture = {
      attacker: owner,
      defender: opponent,
      truePortion,
      fraction: Math.round(fraction * 100),
    };
  }

onAfterDamage(state, owner, opponent, damageContext) {

    console.log('[RealityFracture] onAfterDamage fired', {
      attacker: damageContext.attacker?.name,
      owner: owner?.name,
      isFracture: damageContext.isFracture,
      pendingFracture: state.flags?._pendingFracture,
    });

    if (damageContext.attacker !== owner) return;
    if (damageContext.isFracture) return;


    if (damageContext.attacker !== owner) return;
    if (damageContext.isFracture) return;

    const pending = state.flags?._pendingFracture;
    if (!pending || pending.attacker !== owner) return;

    delete state.flags._pendingFracture;

    if (opponent.currentHP <= 0 || owner.currentHP <= 0) return;

    const { truePortion, fraction } = pending;

    const directHPDamage   = Math.floor(truePortion * 0.5);
    const shieldableDamage = truePortion - directHPDamage;

    console.log('[RealityFracture] ── Fracture Packet ──────────────────');
    console.log('[RealityFracture] truePortion      :', truePortion);
    console.log('[RealityFracture] directHPDamage   :', directHPDamage);
    console.log('[RealityFracture] shieldableDamage :', shieldableDamage);
    console.log('[RealityFracture] opponent ES before:', opponent.currentES ?? 'none');
    console.log('[RealityFracture] opponent HP before:', opponent.currentHP);

    // ── 1. Direct portion ────────────────────────────────────────────────────
    opponent.currentHP = Math.max(0, opponent.currentHP - directHPDamage);
    console.log('[RealityFracture] HP after direct hit:', opponent.currentHP);

    if (opponent.currentHP <= 0) {
      state.pushEvent({ type: 'REALITY_FRACTURE', source: owner.name, target: opponent.name, value: truePortion, fraction, resultingHP: 0 });
      state.pushEvent({ type: 'DEATH', target: opponent.name });
      return;
    }

    // ── 2. Shieldable portion ─────────────────────────────────────────────────
    const shieldableContext = {
      attacker: owner,
      defender: opponent,
      baseDamage: shieldableDamage,
      finalDamage: shieldableDamage,
      type: 'MAGIC',
      isDodged: false,
      prevented: false,
      isReflection: false,
      isEcho: false,
      isFracture: true,
    };

    state.engine._absorbWithES(opponent, shieldableContext);

    console.log('[RealityFracture] shieldableContext.finalDamage after ES:', shieldableContext.finalDamage);
    console.log('[RealityFracture] opponent ES after :', opponent.currentES ?? 'none');

    if (shieldableContext.finalDamage > 0) {
      opponent.currentHP = Math.max(0, opponent.currentHP - shieldableContext.finalDamage);
    }

    console.log('[RealityFracture] HP after shieldable hit:', opponent.currentHP);
    console.log('[RealityFracture] ─────────────────────────────────────────');

    state.pushEvent({
      type: 'REALITY_FRACTURE',
      source: owner.name,
      target: opponent.name,
      value: directHPDamage,
      fraction,
      remainingES: opponent.currentES, 
      maxES: opponent.maxES,   
      resultingHPRaw: Math.max(0, Math.floor(opponent.currentHP)),
      resultingHP: Math.max(0, Math.floor((opponent.currentHP / opponent.maxHP) * 100)),
    });

    if (opponent.currentHP <= 0) {
      state.pushEvent({ type: 'DEATH', target: opponent.name });
      return;
    }

    state.engine.fireHook('onAfterDamage', shieldableContext);
  }
}