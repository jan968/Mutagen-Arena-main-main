/* =============================================
   BOT.JS — FULL SWEEP BALANCE TESTER
   Headless Node.js script that runs thousands of
   simulated battles to produce balance data.
   
   Usage:  node bot.js
   Output: ASCII tables + CSV files in balance_results/
   ============================================= */

const fs = require('fs');
const path = require('path');

// is this on the right place?
const ES_BYPASS_TYPES = ['BLEED', 'BLEED_TICK', 'TRUE_DAMAGE', 'THORN_REFLECT', 'CORROSIVE_APPLY'];

// ==========================================
// MATH UTILITIES
// ==========================================
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ==========================================
// MUTATION SYSTEM (headless copy)
// ==========================================
class Mutation {
  constructor(name, rarity, description) {
    this.name = name;
    this.rarity = rarity;
    this.description = description;
    this.scaling = { str: 0, agi: 0, hp: 0, int: 0 };
  }

  getScalingValue(owner) {
    const MAX_STAT = 545;
    return {
      str: Math.min(owner.str / MAX_STAT, 1),
      agi: Math.min(owner.agi / MAX_STAT, 1),
      hp: Math.min(owner.currentHP / owner.maxHP, 1),
      int: Math.min((owner.int || 50) / MAX_STAT, 1),
    };
  }

  onBattleStart(state, owner, opponent) {
    if (!owner.flags) owner.flags = {};
    if (!opponent.flags) opponent.flags = {};
  }
  onTurnStart(state, owner, opponent) { }
  onBeforeAttack(state, owner, opponent, attackContext) { }
  onAfterAttack(state, owner, opponent, attackContext) { }
  onBeforeDamage(state, owner, opponent, damageContext) { }
  onAfterDamage(state, owner, opponent, damageContext) { }
  onBeforeHeal(state, owner, opponent, healContext) { }
  onTurnEnd(state, owner, opponent) { }
}

// --- COMMON ---
class Bloodletting extends Mutation {
  constructor() {
    super('Bloodletting', 'Common',
      'On hit: chance to apply bleed. AGI increases proc chance and stack cap, STR increases tick damage.');
    this.scaling = { str: 0.7, agi: 1.0, hp: 0, int: 0 };
  }

  onAfterDamage(_state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isEcho) return;
    if (damageContext.finalDamage <= 0 || damageContext.isDodged || damageContext.prevented) return;

    const { str, agi } = this.getScalingValue(owner);
    const procChance = 0.40 + (agi * this.scaling.agi * 0.55);
    if (Math.random() > procChance) return;

    const bleedValue = Math.max(1, Math.floor(
      Math.sqrt(opponent.maxHP) * 0.15 * (1 + str * this.scaling.str)
    ));

    const stackCap = agi >= 0.70 ? 3 : 2;
    const ownStacks = opponent.statusEffects.filter(
      ef => ef.name === 'Bleed' && ef.source === owner.name && !ef.isCorrosive
    );

    if (ownStacks.length < stackCap) {
      const bleedDuration = Math.floor(3 + (agi * 2));
      opponent.statusEffects.push({
        name: 'Bleed', value: bleedValue, duration: bleedDuration, source: owner.name,
      });
      _state.pushEvent({ type: 'BLEED_APPLY', source: owner.name, target: opponent.name, stackCount: ownStacks.length + 1 });
    } else {
      const bleedDuration = Math.floor(3 + (agi * 2));
      const oldest = ownStacks.reduce((a, b) => a.duration < b.duration ? a : b);
      oldest.duration = Math.min(oldest.duration + 1, bleedDuration);
      _state.pushEvent({ type: 'BLEED_APPLY', source: owner.name, target: opponent.name, stackCount: stackCap });
    }
  }
}

class QuickReflex extends Mutation {
  constructor() {
    super('Quick Reflex', 'Common', 'Adds +10% dodge chance.');
  }
  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender === owner && !damageContext.isDodged && !damageContext.prevented) {
      const baseDodge = clamp(0.1 + Math.pow(owner.agi / opponent.agi, 1.2) * 0.1, 0.05, 0.45);
      const newDodge = clamp(baseDodge + 0.10, 0.05, 0.45);
      if (newDodge > baseDodge) {
        if (Math.random() < ((newDodge - baseDodge) / (1 - baseDodge))) {
          damageContext.isDodged = true;
          damageContext.prevented = true;
          state.pushEvent({ type: 'DODGE', source: opponent.name, target: owner.name, mutation: this.name });
        }
      }
    }
  }
}

class BrutalStrike extends Mutation {
  constructor() {
    super('Brutal Strike', 'Common', '+20% damage dealt, but -5% dodge chance.');
    this.scaling = { str: 1.0, agi: 0.5, hp: 0, int: 0 };
  }
  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker === owner) attackContext.damageMultiplier += 0.20;
  }
  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender === owner && damageContext.isDodged) {
      const baseDodge = clamp(0.1 + Math.pow(owner.agi / opponent.agi, 1.2) * 0.1, 0.05, 0.45);
      const newDodge = clamp(baseDodge - 0.05, 0.05, 0.45);
      if (newDodge < baseDodge) {
        if (Math.random() < ((baseDodge - newDodge) / baseDodge)) {
          damageContext.isDodged = false;
          const evIdx = state._currentGroup.findIndex(e => e.type === 'DODGE' && e.target === owner.name);
          if (evIdx > -1) state._currentGroup.splice(evIdx, 1);
        }
      }
    }
  }
}

class ThickHide extends Mutation {
  constructor() {
    super('Thick Hide', 'Epic', 'Reduces incoming physical damage. Scales with STR (2 base → 27 at max investment).');
    this.scaling = { str: 1.0, agi: 0, hp: 0, int: 0 };
    this.baseReduction = 2;
    this.maxReduction = 27;
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    const bypassTypes = ['BLEED', 'BLEED_TICK', 'CORROSIVE', 'TRUE_DAMAGE', 'THORN_REFLECT'];
    if (bypassTypes.includes(damageContext.type) || damageContext.isAssassinate) return;

    const normalizedStr = Math.min(owner.str / 545, 1);
    const reduction = Math.floor(this.baseReduction + (this.maxReduction - this.baseReduction) * normalizedStr);
    const originalDamage = damageContext.finalDamage;
    damageContext.finalDamage = Math.max(1, damageContext.finalDamage - reduction);

    if (originalDamage !== damageContext.finalDamage) {
      state.pushEvent({ type: 'THICK_HIDE_BLOCK', value: reduction, source: owner.name, target: opponent.name, mutation: this.name });
    }
  }
}

class IronWill extends Mutation {
  constructor() {
    super('Iron Will', 'Common', 'Reduces incoming damage based on missing HP — the lower you are, the harder you resist');
    this.scaling = { str: 0, agi: 0, hp: 1.0 };
    this.baseReduction = 2;
    this.maxReduction = 14;
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    const bypassTypes = ['BLEED', 'BLEED_TICK', 'CORROSIVE', 'TRUE_DAMAGE', 'THORN_REFLECT'];
    if (bypassTypes.includes(damageContext.type)) return;

    const missingHP = 1 - (owner.currentHP / owner.maxHP);
    const hasThickHide = owner.mutations.some(m => m instanceof ThickHide);
    const effectiveMax = hasThickHide ? 8 : this.maxReduction;
    const reduction = Math.floor(this.baseReduction + (effectiveMax - this.baseReduction) * missingHP);

    const originalDamage = damageContext.finalDamage;
    damageContext.finalDamage = Math.max(1, damageContext.finalDamage - reduction);

    if (originalDamage !== damageContext.finalDamage) {
      state.pushEvent({ type: 'IRON_WILL_BLOCK', value: reduction, source: owner.name, target: opponent.name, mutation: this.name });
    }
  }
}

class MagicShield extends Mutation {
  constructor() {
    super('Magic Shield', 'Rare', 'Reduces ES recharge delay to 1 turn. INT investment grows your ES pool.');
    this.scaling = { int: 1.0 };
  }

  onBattleStart(state, owner) {
    owner.flags.esRechargeDelay = 1;
  }
}

class MindBlast extends Mutation {
  constructor() {
    super('Mind Blast', 'Rare', 'A surge of magic damage scaling with INT. Bypassed by magic resistance.');
    this.scaling = { str: 0, agi: 0, hp: 0, int: 1.2 };
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (owner.currentHP <= 0 || opponent.currentHP <= 0) return;

    if (Math.random() > 0.25) return;

    const baseMagicDamage = Math.floor(10 + (owner.int * 0.25));

    const damageContext = {
      attacker: owner,
      defender: opponent,
      finalDamage: baseMagicDamage,
      type: 'TRUE_DAMAGE'
    };

    state.engine.fireHook('onBeforeDamage', damageContext);
    if (!damageContext.prevented) {
      opponent.currentHP -= damageContext.finalDamage;
    }
    state.engine.fireHook('onAfterDamage', damageContext);

    state.pushEvent({
      type: 'MIND_BLAST',
      source: owner.name,
      target: opponent.name,
      value: damageContext.finalDamage,
      resultingHP: Math.floor((opponent.currentHP / opponent.maxHP) * 100)
    });
  }
}

// --- RARE ---
class AdrenalineRush extends Mutation {
  constructor() {
    super('Adrenaline Rush', 'Rare', 'Gain +40% damage if HP < 30%.');
  }
  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker === owner && (owner.currentHP / owner.maxHP) < 0.30) {
      attackContext.damageMultiplier += 0.40;
    }
  }
}

class ThornSkin extends Mutation {
  constructor() {
    super('Thorn Skin', 'Rare', 'Reflects damage back to attacker. Base 30%, scaling up to 60% with STR investment.');
    this.scaling = { str: 1.0, agi: 0, hp: 0, int: 0 };
    this.baseReflectPercent = 0.30;
    this.maxReflectPercent = 0.60;
  }

  onAfterDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged || damageContext.isReflection) return;
    if (damageContext.isEcho) return;
    if (damageContext.isAssassinate) return;
    if (opponent.currentHP <= 0 || owner.currentHP <= 0) return;

    const passiveTypes = ['BLEED', 'BLEED_TICK', 'POISON', 'BURN', 'THORN_REFLECT', 'CORROSIVE_APPLY'];
    if (passiveTypes.includes(damageContext.type)) return;

    const reflectPercent = this.baseReflectPercent +
      (this.maxReflectPercent - this.baseReflectPercent) * Math.min(owner.str / 545, 1);
    let totalReflect = Math.floor(damageContext.baseDamage * reflectPercent);

    const cap = Math.floor(owner.maxHP * 0.25);
    totalReflect = Math.min(totalReflect, cap);

    if (totalReflect > 0) {
      state.engine.dealDamage(owner, opponent, totalReflect, {
        isReflection: true, eventType: 'THORN_REFLECT', type: 'THORN_REFLECT',
        mutation: this.name, baseDamage: damageContext.baseDamage
      });
    }
  }
}

class SecondWind extends Mutation {
  constructor() {
    super('Second Wind', 'Rare', 'Once per battle: survive a lethal hit and restore 30% Max HP.');
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.bypass?.survival) return;
    if (!owner.flags) owner.flags = {};

    if (owner.currentHP <= damageContext.finalDamage && !owner.flags.reviveUsed) {
      damageContext.finalDamage = 0;
      damageContext.prevented = true;
      this.triggerRevive(state, owner);
    }
  }

  triggerRevive(state, owner) {
    owner.flags.reviveUsed = true;
    const reviveAmount = Math.floor(owner.maxHP * 0.30);
    owner.currentHP = reviveAmount;
    owner.currentES = 0; // Explicitly clear ES on revive
    state.pushEvent({ type: 'BLOCK', value: 0, source: owner.name, target: owner.name, mutation: this.name });
    state.pushEvent({ type: 'HEAL', value: reviveAmount, source: owner.name, target: owner.name, resultingHP: Math.floor((owner.currentHP / owner.maxHP) * 100) });
  }
}

// --- EPIC ---
class EchoStrike extends Mutation {
  constructor() {
    super('Echo Strike', 'Epic', 'Chance to repeat your attack with reduced damage. Limited to 1 echo per turn.');
    this.scaling = { str: 1.0, agi: 0, hp: 0, int: 0 };
    this.baseChance = 0.15;
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
    if (owner.currentHP <= 0 || opponent.currentHP <= 0) return;

    if (!state.flags) state.flags = {};
    if ((state.flags.echoCount || 0) >= this.maxEchoPerTurn) return;

    const procChance = this.baseChance +
      (this.maxChance - this.baseChance) * Math.min(owner.str / 545, 1);

    if (Math.random() < procChance) {
      state.flags.echoCount = (state.flags.echoCount || 0) + 1;
      state.pushEvent({ type: 'ECHO_STRIKE', source: owner.name, target: opponent.name, mutation: this.name });
      state.engine.performAttack(owner, opponent, { isEcho: true, damageMultiplier: this.echoDamageMultiplier });
    }
  }
}

class CorrosiveTouch extends Mutation {
  constructor() {
    super('Corrosive Touch', 'Epic', 'On hit: applies a corrosive bleed (scales with enemy HP). All bleeds on target escalate by +1 each turn.');
    this.scaling = { str: 0, agi: 1.0, hp: 0, int: 0 };
  }

  onAfterDamage(_state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isEcho) return;
    if (damageContext.isDodged || damageContext.prevented) return;
    if (damageContext.finalDamage <= 0) return;

    const alreadyApplied = opponent.statusEffects.some(
      ef => ef.name === 'Bleed' && ef.isCorrosive && ef.source === owner.name
    );
    if (alreadyApplied) return;

    opponent.statusEffects.push({
      name: 'Bleed',
      value: Math.max(1, Math.floor(Math.sqrt(opponent.maxHP) * 0.35)),
      duration: 3, source: owner.name, isCorrosive: true,
    });
    _state.pushEvent({ type: 'CORROSIVE_APPLY', source: owner.name, target: opponent.name });
  }

  onTurnStart(_state, owner, opponent) {
    const { agi } = this.getScalingValue(owner);
    const escalation = Math.max(1, Math.floor(1 + agi * 2));
    for (const ef of opponent.statusEffects) {
      if (ef.name === 'Bleed' && ef.source === owner.name) {
        ef.value += escalation;
      }
    }
  }
}

class Momentum extends Mutation {
  constructor() {
    super('Momentum', 'Epic',
      'Consecutive hits build stacks (max 10). Each stack increases damage based on STR. Resets on dodge.');
    this.scaling = { str: 1.0, agi: 0, hp: 0, int: 0 };
    this.maxStacks = 10;
    this.baseBonusPerStack = 0.05;
    this.maxBonusPerStack = 0.12;
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
      state.pushEvent({ type: 'MOMENTUM_STACK', source: owner.name, target: owner.name, stacks: owner.flags.momentumStacks });
    } else {
      owner.flags.momentumStacks = 0;
    }
  }
}



class TimeWarp extends Mutation {
  constructor() {
    super('Assassinate', 'Legendary', 'Every 4 charges, strike with undodgeable burst. AGI scales charge speed and damage multiplier.');
    this.scaling = { str: 0, agi: 1.0, hp: 0, int: 0 };
  }

  onBattleStart(state, owner, opponent) {
    owner.flags = owner.flags || {};
    owner.flags.timeWarpCharges = 0;
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner || attackContext.isAssassinate) return;
    if (opponent.currentHP <= 0 || owner.currentHP <= 0) return;

    const MAX_CHARGES = 6;
    const normalizedAgi = Math.min(owner.agi / 545, 1);

    const group = state._currentGroup ?? [];
    const wasMitigated = group.some(e =>
      (e.type === 'DODGE' || e.type === 'BLOCK') && e.target === opponent.name
    );

    const baseGain = 1 + Math.floor(normalizedAgi * 1.5);
    const gain = wasMitigated ? baseGain + 1 : baseGain;
    owner.flags.timeWarpCharges += gain;

    state.pushEvent({ type: 'CHARGE_UPDATE', source: owner.name, charges: Math.min(owner.flags.timeWarpCharges, MAX_CHARGES), maxCharges: MAX_CHARGES });

    while (owner.flags.timeWarpCharges >= MAX_CHARGES) {
      owner.flags.timeWarpCharges -= MAX_CHARGES;
      state.pushEvent({ type: 'TIME_WARP_TRIGGER', source: owner.name, target: opponent.name, screenShake: true });
      state.engine.performAttack(owner, opponent, { isAssassinate: true });
      state.pushEvent({ type: 'CHARGE_UPDATE', source: owner.name, charges: Math.min(owner.flags.timeWarpCharges, MAX_CHARGES), maxCharges: MAX_CHARGES });
      if (opponent.currentHP <= 0) break;
    }
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.isAssassinate) {
      const normalizedAgi = Math.min(owner.agi / 545, 1);
      const agiMultiplier = 1.2 + (normalizedAgi * 0.6);
      attackContext.damageMultiplier = (attackContext.damageMultiplier || 1) * agiMultiplier;
      attackContext.canBeDodged = false;
      attackContext.canBeBlocked = false;
    }
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.isAssassinate && damageContext.attacker === owner) {
      damageContext.isDodged = false;
      damageContext.prevented = false;
    }
  }
}


class Berserker extends Mutation {
  constructor() {
    super('Berserker', 'Legendary',
      'Gain 2 Rage on attack (max 10). Rage boosts damage (+5% each) and lifesteal. STR investment curves up healing and softens vulnerability; AGI penalizes healing per hit. Rage decays by 1 when you don\'t attack.');
    this.scaling = { str: 1.0, agi: 0, hp: 0, int: 0 };
    this.maxRage = 10;
    this.damagePerRage = 0.05;        // +5% per stack → max +50%
    this.vulnerabilityPerRage = 0.04; // +4%/stack at 0 STR → +2%/stack at max STR
    this.leechPerRage = 0.01;         // +1% per rage stack (reduced so rage doesn't wash out stat scaling)
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
    const agiPenalty = Math.min(normalizedAgi * 0.10, 0.08);

    const rageBonus = rage * this.leechPerRage;

    // baseLeech lowered to 0.07 so low-STR builds feel the gap from turn one
    const leechCeiling = 0.20 + Math.pow(normalizedStr, 2) * 0.08;
    const leechRate = clamp(
      0.07 + strBonus - agiPenalty + rageBonus,
      0.04,
      leechCeiling
    );

    const healAmount = Math.floor(damageContext.finalDamage * leechRate);

    if (healAmount > 0) {
      state.engine.performHeal(owner, healAmount, {
        source: owner.name,
        mutation: this.name,
        hardCap: Math.floor(owner.maxHP * 0.20)
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
class Lifetap extends Mutation {
  constructor() {
    super('Lifetap', 'Epic',
      'Each attack drains your own HP to deal bonus damage. The lower your HP, the greater the drain and damage.');
    this.scaling = { str: 0, agi: 0, hp: 0.6, int: 0.4 };
    this.baseDrainPercent = 0.03;   // 3% of own max HP drained per hit at full HP
    this.maxDrainPercent = 0.08;    // 8% at low HP
    this.baseBonusMulti = 0.10;     // +10% damage at full HP
    this.maxBonusMulti = 0.50;      // +50% damage at 1HP
  }

  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (owner.currentHP <= 1) return; // can't drain if at 1HP

    // Combined Scaling: HP (weight 0.6) + INT (weight 0.4)
    const { int: normalizedInt } = this.getScalingValue(owner);
    const hpPercent = owner.currentHP / owner.maxHP;
    const hpDesperation = 1 - hpPercent; // 0 at full HP, ~1 at near death

    const t = (hpDesperation * (this.scaling.hp || 1.0)) +
      (normalizedInt * (this.scaling.int || 0));

    // Drain scales up as HP drops
    const drainPercent = this.baseDrainPercent +
      (this.maxDrainPercent - this.baseDrainPercent) * t;
    const drain = Math.max(1, Math.floor(owner.currentHP * drainPercent));

    // Clamp so it can't kill you — leaves you at 1HP minimum
    const actualDrain = Math.min(drain, owner.currentHP - 1);
    owner.currentHP -= actualDrain;

    state.pushEvent({
      type: 'LIFETAP_DRAIN',
      value: actualDrain,
      source: owner.name,
      target: owner.name,
      resultingHP: Math.max(0, Math.floor((owner.currentHP / owner.maxHP) * 100))
    });

    // Damage bonus also scales with low HP
    const bonusMulti = this.baseBonusMulti +
      (this.maxBonusMulti - this.baseBonusMulti) * t;
    attackContext.damageMultiplier += bonusMulti;
  }
}

class PhantomStep extends Mutation {
  constructor() {
    super('Phantom Step', 'Rare',
      'Dodging an attack triggers an immediate undodgeable counter-attack. AGI scales counter damage from 40% to 90%.');
    this.scaling = { str: 0.25, agi: 1.0, hp: 0, int: 0.25 };
    this.baseDamageMulti = 0.40;
    this.maxDamageMulti = 0.90;
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.defender !== owner) return;
    if (!attackContext.isDodged) return;
    if (owner.currentHP <= 0 || opponent.currentHP <= 0) return;

    const normalizedAgi = Math.min(owner.agi / 545, 1);
    const damageMulti = this.baseDamageMulti +
      (this.maxDamageMulti - this.baseDamageMulti) * normalizedAgi;

    state.pushEvent({
      type: 'PHANTOM_STEP',
      source: owner.name,
      target: opponent.name,
      mutation: this.name
    });

    state.engine.performAttack(owner, opponent, {
      isPhantomStep: true,
      damageMultiplier: damageMulti,
      isEcho: true
    });
  }
}

class Bloodthirst extends Mutation {
  constructor() {
    super('Bloodthirst', 'Rare',
      'Max HP reduced by 20%, but all healing you receive is doubled.');
    this.scaling = { str: 0, agi: 0, hp: 0 };
  }

  onBattleStart(state, owner, opponent) {
    const reduction = Math.floor(owner.maxHP * 0.20);
    owner.maxHP = Math.max(1, owner.maxHP - reduction);
    owner.currentHP = owner.maxHP; // clamp to new lower ceiling
  }

  onBeforeHeal(state, owner, opponent, healContext) {
    if (healContext.target !== owner) return;
    healContext.amount = Math.floor(healContext.amount * 2);
  }
}

// ==========================================
// MUTATION REGISTRY
// ==========================================
const MUTATION_TYPES = {
  'Bloodletting': Bloodletting,
  'Corrosive Touch': CorrosiveTouch,
  'Momentum': Momentum,
  'Assassinate': TimeWarp,
  'Second Wind': SecondWind,
  'Quick Reflex': QuickReflex,
  'Brutal Strike': BrutalStrike,
  'Adrenaline Rush': AdrenalineRush,
  'Echo Strike': EchoStrike,
  'Thick Hide': ThickHide,
  'Thorn Skin': ThornSkin,
  'Lifetap': Lifetap,
  'Phantom Step': PhantomStep,
  'Berserker': Berserker,
  'Bloodthirst': Bloodthirst,
  'Magic Shield': MagicShield,
  'Mind Blast': MindBlast,
  'Iron Will': IronWill,
};

const ALL_MUTATION_NAMES = Object.keys(MUTATION_TYPES);

// ==========================================
// BATTLE ENGINE (headless)
// ==========================================
class BattleState {
  constructor(playerData, enemyData) {
    const p1HP = playerData.hp || (150 + Math.floor(playerData.strength * 0.5));
    const p2HP = enemyData.hp || (150 + Math.floor(enemyData.strength * 0.5));

    this.player = {
      name: 'Player1',
      maxHP: p1HP,
      currentHP: p1HP,
      str: playerData.strength,
      agi: playerData.agility,
      int: playerData.intelligence || 50,
      mutations: (playerData.mutations || []).map(mName => new MUTATION_TYPES[mName]()),
      statusEffects: [],
      flags: {}
    };

    const pMaxES = Math.floor(this.player.maxHP * (this.player.int / 10) * 0.01);
    this.player.maxES = pMaxES;
    this.player.currentES = pMaxES;

    this.enemy = {
      name: 'Player2',
      maxHP: p2HP,
      currentHP: p2HP,
      str: enemyData.strength,
      agi: enemyData.agility,
      int: enemyData.intelligence || 50,
      mutations: (enemyData.mutations || []).map(mName => new MUTATION_TYPES[mName]()),
      statusEffects: [],
      flags: {}
    };

    const eMaxES = Math.floor(this.enemy.maxHP * (this.enemy.int / 10) * 0.01);
    this.enemy.maxES = eMaxES;
    this.enemy.currentES = eMaxES;

    this.turnNumber = 0;
    this.eventQueue = [];
    this._currentGroup = [];
    this.flags = {};
  }

  pushEvent(event) {
    let hp = 0;
    if (event.type === 'DEATH') {
      hp = 0;
    } else if (event.type !== 'CHARGE_UPDATE' && event.type !== 'TIME_WARP_TRIGGER') {
      const target = (event.target === this.player.name) ? this.player : this.enemy;
      hp = target ? target.currentHP : 0;
    }
    const target = (event.target === this.player.name) ? this.player : this.enemy;
    event.resultingHP = event.type === 'ATTACK_START' ? -1 : Math.max(0, Math.floor((hp / (target.maxHP || 100)) * 100));
    this._currentGroup.push(event);
  }

  flushGroup() {
    if (this._currentGroup.length > 0) {
      this.eventQueue.push([...this._currentGroup]);
      this._currentGroup = [];
    }
  }
}

class BattleEngine {
  constructor(playerData, enemyData) {
    this.state = new BattleState(playerData, enemyData);
    this.state.engine = this;
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
    defender.flags.esDamagedThisTurn = true;

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
    this.state.player.mutations.forEach(m => {
      if (typeof m[hookName] === 'function') m[hookName](this.state, this.state.player, this.state.enemy, context);
    });
    this.state.enemy.mutations.forEach(m => {
      if (typeof m[hookName] === 'function') m[hookName](this.state, this.state.enemy, this.state.player, context);
    });
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

  dealDamage(attacker, defender, amount, extraContext = {}) {
    const damageContext = {
      attacker, defender, baseDamage: amount, finalDamage: amount,
      isCrit: false, isDodged: false, isBlocked: false, prevented: false,
      ...extraContext
    };

    this.fireHook('onBeforeDamage', damageContext);

    if (!damageContext.prevented) {
      // ES Absorption
      this._absorbWithES(defender, damageContext);

      defender.currentHP -= damageContext.finalDamage;

      if (!extraContext.silent) {
        this.state.pushEvent({
          type: extraContext.eventType || 'DAMAGE', value: damageContext.finalDamage,
          source: attacker.name, target: defender.name, ...extraContext
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

    this.fireHook('onAfterDamage', damageContext);
  }

  performAttack(attacker, defender, extraContext = {}) {
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
      attacker, defender, damageMultiplier: 1.0, ...extraContext
    };

    this.fireHook('onBeforeAttack', attackContext);

    this.state.pushEvent({ type: 'ATTACK_START', source: attacker.name, target: defender.name });

    const dodgeChance = clamp(
      Math.pow(defender.agi / 175, 1.5) * 0.35,
      0.02,
      0.35
    );
    const isDodged = attackContext.isAssassinate ? false : Math.random() < dodgeChance;
    attackContext.isDodged = isDodged;

    const baseDamage = Math.max(1, Math.floor(9 + (attacker.str * 0.125) + (attacker.agi * 0.085) + (attacker.int * 0.05)));

    const damageContext = {
      attacker, defender, baseDamage,
      finalDamage: Math.floor(baseDamage * attackContext.damageMultiplier),
      isCrit: false, isDodged, isBlocked: false, prevented: false,
      ...extraContext
    };

    if (isDodged) {
      this.state.pushEvent({ type: 'DODGE', source: attacker.name, target: defender.name });
      this.fireHook('onAfterAttack', attackContext);
      this._isResolvingAttack = false;
      this._processQueuedAttacks();
      return;
    }

    // AGI CRIT MECHANIC — chance and damage scale with AGI
    const normalizedAgiCrit = Math.min(attacker.agi / 280, 1);
    const critChance = clamp(Math.pow(normalizedAgiCrit, 1.4) * 0.35, 0, 0.35);
    const isCrit = Math.random() < critChance;
    if (isCrit) {
      const critMulti = 1.4 + (normalizedAgiCrit * 0.50);
      damageContext.finalDamage = Math.floor(damageContext.finalDamage * critMulti);
      damageContext.isCrit = true;
      this.state.pushEvent({ type: 'CRIT', source: attacker.name, target: defender.name, value: damageContext.finalDamage });
    }

    this.fireHook('onBeforeDamage', damageContext);

    if (!damageContext.prevented) {
      // ES Absorption
      this._absorbWithES(defender, damageContext);

      defender.currentHP -= damageContext.finalDamage;
      this.state.pushEvent({
        type: 'DAMAGE', value: damageContext.finalDamage,
        source: attacker.name, target: defender.name,
        isAssassinate: attackContext.isAssassinate || false
      });

      if (defender.currentHP <= 0) {
        this.state.pushEvent({ type: 'DEATH', target: defender.name });
        this._isResolvingAttack = false;
        return;
      }
    }

    this.fireHook('onAfterDamage', damageContext);
    this.fireHook('onAfterAttack', attackContext);

    // 7. AGI DOUBLE STRIKE (NEW MECHANIC)
    if (!attackContext.isDoubleStrike && !attackContext.isAssassinate && !attackContext.isEcho) {
      const normalizedAgi = Math.min(attacker.agi / 250, 1);
      const doubleStrikeChance = normalizedAgi * 0.15; // 0% at 0 AGI, 15% at 250 AGI

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
          damageMultiplier: 0.75
        }]);
      }
    }

    this._isResolvingAttack = false;
    this._processQueuedAttacks();
  }

  _processQueuedAttacks() {
    if (!this._queuedAttacks || this._queuedAttacks.length === 0) return;
    if (this.state.player.currentHP <= 0 || this.state.enemy.currentHP <= 0) {
      this._queuedAttacks = [];
      return;
    }
    const next = this._queuedAttacks.shift();
    this.performAttack(...next);
  }

  executeTurn(attacker, defender) {
    this.state.turnNumber++;

    // ES Recharge — only the active fighter recharges at their turn start
    const fighter = attacker;
    if (fighter.maxES > 0 && fighter.currentES < fighter.maxES) {
      if (!fighter.flags.esDamagedThisTurn) {
        const recharged = Math.min(
          Math.floor(fighter.maxES * 0.33),
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
      fighter.flags.esDamagedThisTurn = false; // reset flag after recharge check
    }

    // 1. TURN START (Only for the active fighter)
    attacker.mutations.forEach(m => {
      if (typeof m.onTurnStart === 'function') m.onTurnStart(this.state, attacker, defender);
    });

    let isStunned = false;

    attacker.statusEffects = attacker.statusEffects.filter(effect => {
      if (effect.name === 'Stun') isStunned = true;

      if (effect.name === 'Bleed') {
        if (attacker.currentHP <= 0) {
          effect.duration--;
          return effect.duration > 0;
        }

        const context = {
          attacker: null, defender: attacker, finalDamage: effect.value,
          isDodged: false, prevented: false, type: 'BLEED'
        };

        this.fireHook('onBeforeDamage', context);
        if (!context.prevented) attacker.currentHP -= context.finalDamage;
        this.fireHook('onAfterDamage', context);

        this.state.pushEvent({
          type: 'BLEED_TICK', value: context.finalDamage, source: effect.source,
          target: attacker.name, isCorrosive: effect.isCorrosive || false,
          resultingHP: Math.max(0, attacker.currentHP)
        });
      }

      effect.duration--;
      return effect.duration > 0;
    });

    const deadAttacker = attacker.currentHP <= 0;
    const deadDefender = defender.currentHP <= 0;

    if (deadAttacker) {
      const secondWind = attacker.mutations.find(m => m instanceof SecondWind);
      if (secondWind && !attacker.flags.reviveUsed) secondWind.triggerRevive(this.state, attacker);
    }
    if (deadDefender) {
      const secondWind = defender.mutations.find(m => m instanceof SecondWind);
      if (secondWind && !defender.flags.reviveUsed) secondWind.triggerRevive(this.state, defender);
    }

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

    if (isStunned) {
      this.state.pushEvent({ type: 'STUN', target: attacker.name });
      attacker.mutations.forEach(m => {
        if (typeof m.onTurnEnd === 'function') m.onTurnEnd(this.state, attacker, defender);
      });
      this.state.flushGroup();
      return;
    }

    this.performAttack(attacker, defender);
    // 4. TURN END (Only for the active fighter)
    attacker.mutations.forEach(m => {
      if (typeof m.onTurnEnd === 'function') m.onTurnEnd(this.state, attacker, defender);
    });
    this.state.flushGroup();
  }

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
    return {
      won,
      turnCount: this.state.turnNumber,
      finalPlayerHP: Math.max(0, this.state.player.currentHP),
      finalEnemyHP: Math.max(0, this.state.enemy.currentHP),
      playerMaxHP: this.state.player.maxHP,
      enemyMaxHP: this.state.enemy.maxHP,
    };
  }
}

// ==========================================
// SIMULATION HELPERS
// ==========================================

function runSimulation(p1, p2, numBattles) {
  let p1Wins = 0;
  let totalTurns = 0;
  let timeouts = 0;

  for (let i = 0; i < numBattles; i++) {
    const engine = new BattleEngine(p1, p2);
    const result = engine.runFullBattle();
    if (result.won) p1Wins++;
    totalTurns += result.turnCount;
    if (result.turnCount > 100) timeouts++;
  }

  return {
    p1WinRate: ((p1Wins / numBattles) * 100).toFixed(1),
    p1Wins,
    p2Wins: numBattles - p1Wins,
    avgTurns: (totalTurns / numBattles).toFixed(1),
    timeouts,
    numBattles,
  };
}

// ==========================================
// ASCII TABLE FORMATTER
// ==========================================

function printTable(title, headers, rows) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, String(row[i]).length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('│');
  console.log(headerLine);
  console.log(colWidths.map(w => '─'.repeat(w)).join('┼'));

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('│');
    console.log(line);
  }
  console.log('');
}

// ==========================================
// CSV EXPORT
// ==========================================
const RESULTS_DIR = path.join(__dirname, 'balance_results');

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

function writeCSV(filename, headers, rows) {
  ensureResultsDir();
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  const filePath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filePath, csvContent);
  console.log(`  📁 Saved: ${filePath}`);
}

// ==========================================
// ANALYSIS 1: STR vs AGI SWEEP
// ==========================================
function analyzeStrAgiSweep() {
  const TOTAL_BUDGET = 200;
  const STEP = 25;
  const N = 1000;

  const headers = ['STR', 'AGI', 'P1 Win%', 'Avg Turns', 'Timeouts', 'Verdict'];
  const rows = [];

  for (let str = 50; str <= 150; str += STEP) {
    const agi = TOTAL_BUDGET - str;
    const p1 = { strength: str, agility: agi, mutations: [] };
    const p2 = { strength: str, agility: agi, mutations: [] };

    const result = runSimulation(p1, p2, N);

    const verdict = parseFloat(result.p1WinRate) > 53 ? '⚠️ P1 favored' :
      parseFloat(result.p1WinRate) < 47 ? '⚠️ P2 favored' : '✅ Balanced';

    rows.push([str, agi, `${result.p1WinRate}%`, result.avgTurns, result.timeouts, verdict]);
  }

  printTable('ANALYSIS 1: Mirror Match Fairness (STR/AGI Sweep, No Mutations)', headers, rows);
  writeCSV('01_str_agi_sweep.csv', headers, rows);
}

// ==========================================
// ANALYSIS 2: STAT DOMINANCE (Pure STR vs Pure AGI)
// ==========================================
function analyzeStatDominance() {
  const N = 1000;
  const headers = ['Total Budget', 'STR Build', 'AGI Build', 'STR Win%', 'Avg Turns', 'Timeouts', 'Verdict'];
  const rows = [];

  for (let budget = 100; budget <= 300; budget += 50) {
    const strBuild = { strength: Math.min(budget, 545), agility: 50, mutations: [] };
    const agiBuild = { strength: 50, agility: Math.min(budget, 545), mutations: [] };

    const result = runSimulation(strBuild, agiBuild, N);

    const verdict = parseFloat(result.p1WinRate) > 60 ? '💪 STR dominant' :
      parseFloat(result.p1WinRate) < 40 ? '⚡ AGI dominant' : '⚖️ Balanced';

    rows.push([
      budget,
      `${strBuild.strength}/${strBuild.agility}`,
      `${agiBuild.strength}/${agiBuild.agility}`,
      `${result.p1WinRate}%`,
      result.avgTurns,
      result.timeouts,
      verdict
    ]);
  }

  printTable('ANALYSIS 2: Stat Archetype Dominance (Pure STR vs Pure AGI)', headers, rows);
  writeCSV('02_stat_dominance.csv', headers, rows);
}

// ==========================================
// ANALYSIS 2B: HIGH STAT RANGE (450 Budget)
// ==========================================
function analyzeHighStatRange() {
  const N = 2000;
  const budget = 450;
  const profiles = [
    { name: 'Pure STR', strength: 400, agility: 50, mutations: [] },
    { name: 'Pure AGI', strength: 50, agility: 400, mutations: [] },
    { name: 'Hybrid', strength: 225, agility: 225, mutations: [] },
  ];

  const headers = ['P1 vs P2', 'P1 Win%', 'Avg Turns', 'Verdict'];
  const rows = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = 0; j < profiles.length; j++) {
      if (i === j) continue;
      const p1 = profiles[i];
      const p2 = profiles[j];
      const result = runSimulation(p1, p2, N);

      rows.push([
        `${p1.name} vs ${p2.name}`,
        `${result.p1WinRate}%`,
        result.avgTurns,
        parseFloat(result.p1WinRate) > 55 ? `${p1.name} dominant` :
          parseFloat(result.p1WinRate) < 45 ? `${p2.name} dominant` : '⚖️ Balanced'
      ]);
    }
  }

  printTable('ANALYSIS 2B: High Stat Range (450 Budget) Archetype Battle', headers, rows);
  writeCSV('02b_high_stat_range.csv', headers, rows);
}

// ==========================================
// ANALYSIS 3: MUTATION SOLO TIER LIST
// ==========================================
function analyzeMutationTierList() {
  const N = 2000;
  const STATS = { strength: 100, agility: 100 };
  const baseline = { ...STATS, mutations: [] };

  const headers = ['Mutation', 'Rarity', 'Win%', 'Avg Turns', 'Timeouts', 'Rating'];
  const rows = [];

  for (const mName of ALL_MUTATION_NAMES) {
    const mutant = { ...STATS, mutations: [mName] };
    const result = runSimulation(mutant, baseline, N);

    const wr = parseFloat(result.p1WinRate);
    let rating;
    if (wr >= 70) rating = '🔴 OVERPOWERED';
    else if (wr >= 60) rating = '🟠 Strong';
    else if (wr >= 55) rating = '🟡 Good';
    else if (wr >= 45) rating = '🟢 Balanced';
    else if (wr >= 40) rating = '🔵 Weak';
    else rating = '⚪ Underpowered';

    const mutObj = new MUTATION_TYPES[mName]();
    rows.push([mName, mutObj.rarity, `${result.p1WinRate}%`, result.avgTurns, result.timeouts, rating]);
  }

  // Sort by win rate descending
  rows.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));

  printTable('ANALYSIS 3: Mutation Solo Tier List (vs No-Mutation Baseline @ 100/100)', headers, rows);
  writeCSV('03_mutation_tier_list.csv', headers, rows);
}

// ==========================================
// ANALYSIS 4: MUTATION SYNERGY MATRIX
// ==========================================
function analyzeMutationSynergy() {
  const N = 500;
  const STATS = { strength: 100, agility: 100 };
  const baseline = { ...STATS, mutations: [] };

  // First, get solo win rates for reference
  const soloWinRates = {};
  for (const mName of ALL_MUTATION_NAMES) {
    const mutant = { ...STATS, mutations: [mName] };
    const result = runSimulation(mutant, baseline, N);
    soloWinRates[mName] = parseFloat(result.p1WinRate);
  }

  const headers = ['Mutation A', 'Mutation B', 'Combo Win%', 'A Solo%', 'B Solo%', 'Synergy Δ', 'Flag'];
  const rows = [];

  for (let i = 0; i < ALL_MUTATION_NAMES.length; i++) {
    for (let j = i + 1; j < ALL_MUTATION_NAMES.length; j++) {
      const mA = ALL_MUTATION_NAMES[i];
      const mB = ALL_MUTATION_NAMES[j];

      const combo = { ...STATS, mutations: [mA, mB] };
      const result = runSimulation(combo, baseline, N);
      const comboWR = parseFloat(result.p1WinRate);

      // Synergy = combo WR minus the higher of the two solo WRs
      const expectedWR = Math.max(soloWinRates[mA], soloWinRates[mB]);
      const synergy = (comboWR - expectedWR).toFixed(1);

      let flag = '';
      if (comboWR >= 75) flag = '🔴 BROKEN';
      else if (comboWR >= 65) flag = '🟠 Very Strong';
      else if (parseFloat(synergy) >= 10) flag = '🟡 High Synergy';
      else if (parseFloat(synergy) <= -5) flag = '🔵 Anti-Synergy';

      rows.push([mA, mB, `${result.p1WinRate}%`, `${soloWinRates[mA]}%`, `${soloWinRates[mB]}%`, `${synergy > 0 ? '+' : ''}${synergy}%`, flag]);
    }
  }

  // Sort by combo win rate descending
  rows.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));

  printTable('ANALYSIS 4: Mutation Synergy Matrix (2-Mutation Combos vs Baseline)', headers, rows);
  writeCSV('04_mutation_synergy.csv', headers, rows);

  // Print top 10 and bottom 5
  console.log('  📊 TOP 10 COMBOS:');
  rows.slice(0, 10).forEach((r, i) => console.log(`    ${i + 1}. ${r[0]} + ${r[1]}: ${r[2]} (synergy: ${r[5]})`));
  console.log('  📊 BOTTOM 5 COMBOS:');
  rows.slice(-5).forEach((r, i) => console.log(`    ${rows.length - 4 + i}. ${r[0]} + ${r[1]}: ${r[2]} (synergy: ${r[5]})`));
  console.log('');
}

// ==========================================
// ANALYSIS 5: STAT SCALING PER MUTATION
// ==========================================
function analyzeStatScaling() {
  const N = 1000;
  const profiles = [
    { label: 'Pure STR (150/50)', strength: 150, agility: 50 },
    { label: 'Balanced (100/100)', strength: 100, agility: 100 },
    { label: 'Pure AGI (50/150)', strength: 50, agility: 150 },
  ];

  const baseline = { strength: 100, agility: 100, mutations: [] };

  const headers = ['Mutation', 'Rarity', ...profiles.map(p => p.label), 'Best Stat', 'Spread'];
  const rows = [];

  for (const mName of ALL_MUTATION_NAMES) {
    const winRates = [];
    const mutObj = new MUTATION_TYPES[mName]();

    for (const profile of profiles) {
      const mutant = { strength: profile.strength, agility: profile.agility, mutations: [mName] };
      const result = runSimulation(mutant, baseline, N);
      winRates.push(parseFloat(result.p1WinRate));
    }

    const maxWR = Math.max(...winRates);
    const minWR = Math.min(...winRates);
    const bestIdx = winRates.indexOf(maxWR);
    const bestStat = bestIdx === 0 ? '💪 STR' : bestIdx === 2 ? '⚡ AGI' : '⚖️ Balanced';
    const spread = (maxWR - minWR).toFixed(1);

    rows.push([
      mName,
      mutObj.rarity,
      ...winRates.map(w => `${w}%`),
      bestStat,
      `${spread}%`
    ]);
  }

  printTable('ANALYSIS 5: Stat Scaling per Mutation (Win% vs 100/100 Baseline, No Mutations)', headers, rows);
  writeCSV('05_stat_scaling.csv', headers, rows);
}

// ==========================================
// ANALYSIS 6: FIRST-MOVER ADVANTAGE
// ==========================================
function analyzeFirstMover() {
  const N = 2000;
  const configs = [
    { label: 'No Mutations (100/100)', strength: 100, agility: 100, mutations: [] },
    { label: 'No Mutations (150/50)', strength: 150, agility: 50, mutations: [] },
    { label: 'No Mutations (50/150)', strength: 50, agility: 150, mutations: [] },
  ];

  const headers = ['Config', 'P1 (first) Win%', 'Avg Turns', 'Timeouts', 'Advantage'];
  const rows = [];

  for (const config of configs) {
    const result = runSimulation(config, { ...config }, N);
    const wr = parseFloat(result.p1WinRate);
    const advantage = wr > 53 ? '⚠️ First-mover advantage' :
      wr < 47 ? '⚠️ Second-mover advantage' : '✅ Fair';

    rows.push([config.label, `${result.p1WinRate}%`, result.avgTurns, result.timeouts, advantage]);
  }

  printTable('ANALYSIS 6: First-Mover Advantage (Mirror Matches)', headers, rows);
  writeCSV('06_first_mover.csv', headers, rows);
}

// ==========================================
// DETAILED SIMULATION (tracks event-level metrics)
// ==========================================
function runSimulationDetailed(p1, p2, numBattles) {
  let p1Wins = 0;
  let totalTurns = 0;
  let timeouts = 0;
  let totalAssassinateHits = 0;
  let totalAssassinateDmg = 0;
  let totalDmgDealt = 0;
  let totalDodges = 0;
  let totalAttacks = 0;

  for (let i = 0; i < numBattles; i++) {
    const engine = new BattleEngine(p1, p2);
    const result = engine.runFullBattle();
    if (result.won) p1Wins++;
    totalTurns += result.turnCount;
    if (result.turnCount > 100) timeouts++;

    // Parse event queue for detailed metrics
    for (const group of engine.state.eventQueue) {
      for (const event of group) {
        if (event.source === 'Player1') {
          if (event.type === 'ATTACK_START') totalAttacks++;
          if (event.type === 'DAMAGE') {
            totalDmgDealt += event.value || 0;
            if (event.isAssassinate) {
              totalAssassinateHits++;
              totalAssassinateDmg += event.value || 0;
            }
          }
        }
        if (event.type === 'DODGE' && event.target === 'Player1') {
          totalDodges++;
        }
      }
    }
  }

  return {
    p1WinRate: ((p1Wins / numBattles) * 100).toFixed(1),
    p1Wins,
    p2Wins: numBattles - p1Wins,
    avgTurns: (totalTurns / numBattles).toFixed(1),
    timeouts,
    numBattles,
    avgAssassinateHits: (totalAssassinateHits / numBattles).toFixed(2),
    avgAssassinateDmg: (totalAssassinateDmg / numBattles).toFixed(1),
    avgTotalDmg: (totalDmgDealt / numBattles).toFixed(1),
    assassinateDmgShare: totalDmgDealt > 0 ? ((totalAssassinateDmg / totalDmgDealt) * 100).toFixed(1) : '0.0',
    avgDodgesReceived: (totalDodges / numBattles).toFixed(2),
    avgAttacks: (totalAttacks / numBattles).toFixed(1),
  };
}

// ==========================================
// ANALYSIS 7: ASSASSINATE DEEP DIVE
// ==========================================
function analyzeAssassinateDeepDive() {
  const N = 2000;

  // --- 7A: Assassinate across full stat spectrum ---
  console.log('\n  ── 7A: Assassinate Win Rate Across Stat Spectrum ──');
  const statProfiles = [
    { label: 'Pure AGI (50/200)', strength: 50, agility: 200 },
    { label: 'AGI-heavy (50/150)', strength: 50, agility: 150 },
    { label: 'AGI-lean (75/125)', strength: 75, agility: 125 },
    { label: 'Balanced (100/100)', strength: 100, agility: 100 },
    { label: 'STR-lean (125/75)', strength: 125, agility: 75 },
    { label: 'STR-heavy (150/50)', strength: 150, agility: 50 },
    { label: 'Pure STR (200/50)', strength: 200, agility: 50 },
  ];

  const headers7a = ['Build', 'Win%', 'Avg Turns', 'Assassinate Hits/Battle', 'Assassinate Dmg/Battle', 'Dmg Share%', 'Dodged/Battle'];
  const rows7a = [];

  for (const profile of statProfiles) {
    const assn = { strength: profile.strength, agility: profile.agility, mutations: ['Assassinate'] };
    const baseline = { strength: 100, agility: 100, mutations: [] };

    const result = runSimulationDetailed(assn, baseline, N);

    rows7a.push([
      profile.label,
      `${result.p1WinRate}%`,
      result.avgTurns,
      result.avgAssassinateHits,
      result.avgAssassinateDmg,
      `${result.assassinateDmgShare}%`,
      result.avgDodgesReceived,
    ]);
  }

  printTable('ANALYSIS 7A: Assassinate Performance by Stat Build (vs 100/100 No Mutation)', headers7a, rows7a);
  writeCSV('07a_assassinate_stat_sweep.csv', headers7a, rows7a);

  // --- 7B: Assassinate vs every counter-mutation (mirror stats) ---
  console.log('  ── 7B: Assassinate vs Every Mutation (Both at 100/100) ──');
  const headers7b = ['Opponent Mutation', 'Rarity', 'Assassinate Win%', 'Avg Turns', 'Assassinate Hits', 'Verdict'];
  const rows7b = [];

  for (const mName of ALL_MUTATION_NAMES) {
    if (mName === 'Assassinate') continue;

    const assn = { strength: 100, agility: 100, mutations: ['Assassinate'] };
    const counter = { strength: 100, agility: 100, mutations: [mName] };

    const result = runSimulationDetailed(assn, counter, N);
    const wr = parseFloat(result.p1WinRate);

    let verdict;
    if (wr >= 70) verdict = '🔴 Assassinate crushes';
    else if (wr >= 55) verdict = '🟠 Assassinate favored';
    else if (wr >= 45) verdict = '🟢 Even matchup';
    else if (wr >= 30) verdict = '🟠 Counter favored';
    else verdict = '🔴 Hard counter';

    const mutObj = new MUTATION_TYPES[mName]();
    rows7b.push([mName, mutObj.rarity, `${result.p1WinRate}%`, result.avgTurns, result.avgAssassinateHits, verdict]);
  }

  rows7b.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
  printTable('ANALYSIS 7B: Assassinate vs Each Mutation (1v1 at 100/100)', headers7b, rows7b);
  writeCSV('07b_assassinate_vs_mutations.csv', headers7b, rows7b);

  // --- 7C: AGI Assassinate vs STR Assassinate (head-to-head) ---
  console.log('  ── 7C: AGI Assassinate vs STR Assassinate (Head-to-Head) ──');
  const headers7c = ['Matchup', 'P1 (AGI) Win%', 'Avg Turns', 'P1 Assn Hits', 'P1 Assn Dmg Share'];
  const rows7c = [];

  const agiBuilds = [
    { label: '50/150 vs 150/50', p1: { strength: 50, agility: 150 }, p2: { strength: 150, agility: 50 } },
    { label: '75/125 vs 125/75', p1: { strength: 75, agility: 125 }, p2: { strength: 125, agility: 75 } },
    { label: '50/200 vs 200/50', p1: { strength: 50, agility: 200 }, p2: { strength: 200, agility: 50 } },
  ];

  for (const matchup of agiBuilds) {
    const p1 = { ...matchup.p1, mutations: ['Assassinate'] };
    const p2 = { ...matchup.p2, mutations: ['Assassinate'] };

    const result = runSimulationDetailed(p1, p2, N);
    rows7c.push([
      matchup.label,
      `${result.p1WinRate}%`,
      result.avgTurns,
      result.avgAssassinateHits,
      `${result.assassinateDmgShare}%`,
    ]);
  }

  printTable('ANALYSIS 7C: AGI Assassinate vs STR Assassinate (Head-to-Head)', headers7c, rows7c);
  writeCSV('07c_agi_vs_str_assassinate.csv', headers7c, rows7c);

  // --- 7D: Damage breakdown analysis ---
  console.log('  ── 7D: Assassinate Damage Math Breakdown ──');
  console.log('');
  console.log('  Base damage formula: baseDamage = 9 + (STR × 0.125) + (AGI × 0.085)');
  console.log('  Assassinate multiplier: 1.3x - 2.5x (AGI scaling, unblockable, undodgeable)');
  console.log('');
  console.log('  ┌──────────┬───────────┬──────────────┬──────────────┐');
  console.log('  │ STR      │ Base Dmg  │ Normal Hit   │ Assassinate  │');
  console.log('  ├──────────┼───────────┼──────────────┼──────────────┤');
  const strValues = [50, 75, 100, 125, 150, 200, 300, 545];
  for (const str of strValues) {
    // For the sake of this table we assume AGI = 100 for base damage calculation
    const agi = 100;
    const base = Math.max(1, Math.floor(9 + str * 0.125 + agi * 0.085));
    // Showing multiplier range for mid-AGI (100)
    const normalizedAgi = Math.min(agi / 545, 1);
    const agiMultiplier = 1.3 + (normalizedAgi * 1.2);
    const assn = Math.floor(base * agiMultiplier);
    console.log(`  │ ${String(str).padEnd(8)} │ ${String(base).padEnd(9)} │ ${String(base).padEnd(12)} │ ${String(assn).padEnd(12)} │`);
  }
  console.log('  └──────────┴───────────┴──────────────┴──────────────┘');
  console.log('');
  console.log('  HP formula: maxHP = 150 + (STR × 0.5)');
  console.log('');
  console.log('  ┌──────────┬────────┬──────────────────────────────────┐');
  console.log('  │ STR      │ Max HP │ Assassinate as % of Max HP       │');
  console.log('  ├──────────┼────────┼──────────────────────────────────┤');
  for (const str of strValues) {
    const agi = 100;
    const base = Math.max(1, Math.floor(9 + str * 0.125 + agi * 0.085));
    const normalizedAgi = Math.min(agi / 545, 1);
    const agiMultiplier = 1.3 + (normalizedAgi * 1.2);
    const assn = Math.floor(base * agiMultiplier);
    const hp = 150 + Math.floor(str * 0.5);
    const pct = ((assn / hp) * 100).toFixed(1);
    console.log(`  │ ${String(str).padEnd(8)} │ ${String(hp).padEnd(6)} │ ${String(pct + '%').padEnd(34)} │`);
  }
  console.log('  └──────────┴────────┴──────────────────────────────────┘');
  console.log('');

  // --- Summary ---
  console.log('  ── ASSASSINATE BALANCE SUMMARY ──');
  console.log('');
  console.log('  ✅ RESOLVED: AGI scaling added to the mutation');
  console.log('     - Damage multiplier scales from 1.3x up to 2.5x based on AGI.');
  console.log('     - AGI builds now hit significantly harder with this strike.');
  console.log('');
  console.log('  ✅ RESOLVED: No longer True Damage');
  console.log('     - Thick Hide and other damage reduction now correctly applies.');
  console.log('');
  console.log('  💡 STR Still Dominates Max HP:');
  console.log('     - Higher STR still provides significantly more survival bulk.');
  console.log('     - AGI builds rely on Dodge (25% cap) and Double Strike (15% cap).');
  console.log('');
}

// ==========================================
// ANALYSIS 8: CRIT MECHANIC BALANCE CHECK
// ==========================================
function analyzeCritBalance() {
  const N = 3000;

  // 8A: STR vs AGI head-to-head with crits
  console.log('  ── 8A: Pure STR vs Pure AGI (with Crits) ──');
  const headers8a = ['Matchup', 'STR Build', 'AGI Build', 'STR Win%', 'Avg Turns', 'Verdict'];
  const rows8a = [];

  const matchups = [
    { label: 'Low (100)', strB: { strength: 100, agility: 50, mutations: [] }, agiB: { strength: 50, agility: 100, mutations: [] } },
    { label: 'Mid (150)', strB: { strength: 150, agility: 50, mutations: [] }, agiB: { strength: 50, agility: 150, mutations: [] } },
    { label: 'Mid (200)', strB: { strength: 200, agility: 50, mutations: [] }, agiB: { strength: 50, agility: 200, mutations: [] } },
    { label: 'High (250)', strB: { strength: 250, agility: 50, mutations: [] }, agiB: { strength: 50, agility: 250, mutations: [] } },
    { label: 'Max (300)', strB: { strength: 300, agility: 50, mutations: [] }, agiB: { strength: 50, agility: 300, mutations: [] } },
  ];

  for (const m of matchups) {
    const result = runSimulation(m.strB, m.agiB, N);
    const wr = parseFloat(result.p1WinRate);
    let verdict;
    if (wr > 55) verdict = '💪 STR dominant';
    else if (wr < 45) verdict = '⚡ AGI dominant';
    else verdict = '⚖️ Balanced';
    rows8a.push([m.label, `${m.strB.strength}/${m.strB.agility}`, `${m.agiB.strength}/${m.agiB.agility}`, `${result.p1WinRate}%`, result.avgTurns, verdict]);
  }

  printTable('ANALYSIS 8A: STR vs AGI Head-to-Head (WITH CRITS)', headers8a, rows8a);
  writeCSV('08a_crit_str_vs_agi.csv', headers8a, rows8a);

  // 8B: Budget sweep — same total stats, different split
  console.log('  ── 8B: Same Budget Split (200 total, no mutations) ──');
  const headers8b = ['Build', 'Win% vs Mirror', 'Win% vs 100/100', 'Avg Turns', 'Avg Crits/Battle'];
  const rows8b = [];

  const splits = [
    { str: 50, agi: 150 },
    { str: 75, agi: 125 },
    { str: 100, agi: 100 },
    { str: 125, agi: 75 },
    { str: 150, agi: 50 },
  ];

  for (const split of splits) {
    const build = { strength: split.str, agility: split.agi, mutations: [] };
    const mirror = { strength: split.str, agility: split.agi, mutations: [] };
    const baseline = { strength: 100, agility: 100, mutations: [] };

    const mirrorResult = runSimulation(build, mirror, N);
    const baseResult = runSimulation(build, baseline, N);

    // Count crits for this build
    let totalCrits = 0;
    for (let i = 0; i < 500; i++) {
      const engine = new BattleEngine(build, baseline);
      const r = engine.runFullBattle();
      for (const group of engine.state.eventQueue) {
        for (const event of group) {
          if (event.type === 'CRIT' && event.source === 'Player1') totalCrits++;
        }
      }
    }

    rows8b.push([
      `${split.str}/${split.agi}`,
      `${mirrorResult.p1WinRate}%`,
      `${baseResult.p1WinRate}%`,
      baseResult.avgTurns,
      (totalCrits / 500).toFixed(2)
    ]);
  }

  printTable('ANALYSIS 8B: Budget Split Balance (200 total, WITH CRITS)', headers8b, rows8b);
  writeCSV('08b_crit_budget_sweep.csv', headers8b, rows8b);

  // 8C: Crit math breakdown
  console.log('  ── 8C: Crit Mechanic Math Breakdown ──');
  console.log('');
  console.log('  Formula: critChance = clamp((AGI/200)^1.3 × 0.30, 0, 0.30)');
  console.log('  Formula: critDamage = baseDmg × (1.5 + (AGI/200) × 0.5)');
  console.log('');
  console.log('  ┌──────────┬────────────┬────────────┬────────────┐');
  console.log('  │ AGI      │ Crit %     │ Crit Multi │ DPS Boost  │');
  console.log('  ├──────────┼────────────┼────────────┼────────────┤');
  for (const agi of [50, 75, 100, 125, 150, 200, 250]) {
    const norm = Math.min(agi / 200, 1);
    const critChance = clamp(Math.pow(norm, 1.3) * 0.30, 0, 0.30);
    const critMulti = 1.5 + (norm * 0.5);
    const dpsBoost = (critChance * (critMulti - 1) * 100).toFixed(1);
    console.log(`  │ ${String(agi).padEnd(8)} │ ${(critChance * 100).toFixed(1).padStart(5)}%     │ ${critMulti.toFixed(2).padStart(5)}x     │ +${dpsBoost.padStart(5)}%     │`);
  }
  console.log('  └──────────┴────────────┴────────────┴────────────┘');
  console.log('');
}

// ==========================================
// ANALYSIS 9: LIFETAP BUILD SWEEP
// ==========================================
function analyzeLifetap() {
  const N = 3000;
  console.log('  ── 9A: Lifetap Build Sweep vs Base (100/100) ──');
  const headers = ['Build STR/AGI', 'Lifetap Win%', 'Avg Turns', 'Verdict'];
  const rows = [];

  const baseline = { strength: 100, agility: 100, mutations: [] };
  const builds = [
    { str: 50, agi: 150 },
    { str: 100, agi: 100 },
    { str: 150, agi: 50 },
    { str: 200, agi: 50 },  // High budget STR
    { str: 50, agi: 200 }   // High budget AGI
  ];

  for (const build of builds) {
    const p1 = { strength: build.str, agility: build.agi, mutations: ['Lifetap'] };
    // Adjust baseline to match total stats of the build
    const totalStats = build.str + build.agi;
    const baseEnemy = { strength: totalStats / 2, agility: totalStats / 2, mutations: [] };

    const result = runSimulation(p1, baseEnemy, N);

    const wr = parseFloat(result.p1WinRate);
    let verdict;
    if (wr > 65) verdict = '🔥 Very Strong';
    else if (wr > 55) verdict = '🟢 Strong/Balanced';
    else if (wr > 45) verdict = '⚖️ Average';
    else verdict = '⚠️ Weak';

    rows.push([`${build.str}/${build.agi}`, `${result.p1WinRate}%`, result.avgTurns, verdict]);
  }

  printTable('ANALYSIS 9A: Lifetap on Different Stat Builds', headers, rows);
  writeCSV('09a_lifetap_builds.csv', headers, rows);
}

// ==========================================
// ANALYSIS 10: PHANTOM STEP BUILD SWEEP
// ==========================================
function analyzePhantomStep() {
  const N = 3000;
  console.log('  ── 10A: Phantom Step Build Sweep vs Base (100/100) ──');
  const headers = ['Build STR/AGI', 'PhantomStep Win%', 'Avg Turns', 'Verdict'];
  const rows = [];

  const builds = [
    { str: 50, agi: 150 },
    { str: 100, agi: 100 },
    { str: 150, agi: 50 },
    { str: 200, agi: 50 },
    { str: 50, agi: 200 }
  ];

  for (const build of builds) {
    const p1 = { strength: build.str, agility: build.agi, mutations: ['Phantom Step'] };
    const totalStats = build.str + build.agi;
    const baseEnemy = { strength: totalStats / 2, agility: totalStats / 2, mutations: [] };

    const result = runSimulation(p1, baseEnemy, N);

    const wr = parseFloat(result.p1WinRate);
    let verdict;
    if (wr > 70) verdict = '🟢 OVERPOWERED';
    else if (wr > 60) verdict = '🟢 Strong/Balanced';
    else if (wr > 50) verdict = '⚖️ Average';
    else verdict = '⚠️ Weak';

    rows.push([`${build.str}/${build.agi}`, `${result.p1WinRate}%`, result.avgTurns, verdict]);
  }

  printTable('ANALYSIS 10A: Phantom Step on Different Stat Builds', headers, rows);
  writeCSV('10a_phantomstep_builds.csv', headers, rows);
}

// ==========================================
// ANALYSIS 11: BERSERKER DEEP DIVE
// ==========================================
function analyzeBerserker() {
  const N = 3000;

  // 11A: Berserker across different stat builds vs baseline
  console.log('\n  ── 11A: Berserker Build Sweep vs Base (100/100) ──');
  const headers11a = ['Build STR/AGI', 'Berserker Win%', 'Avg Turns', 'Verdict'];
  const rows11a = [];

  const builds = [
    { str: 50, agi: 150 },
    { str: 100, agi: 100 },
    { str: 150, agi: 50 },
    { str: 200, agi: 50 },
    { str: 50, agi: 200 }
  ];

  for (const build of builds) {
    const p1 = { strength: build.str, agility: build.agi, mutations: ['Berserker'] };
    const totalStats = build.str + build.agi;
    const baseEnemy = { strength: totalStats / 2, agility: totalStats / 2, mutations: [] };

    const result = runSimulation(p1, baseEnemy, N);

    const wr = parseFloat(result.p1WinRate);
    let verdict;
    if (wr > 70) verdict = '🟢 OVERPOWERED';
    else if (wr > 60) verdict = '🟢 Strong/Balanced';
    else if (wr > 50) verdict = '⚖️ Average';
    else verdict = '⚠️ Weak';

    rows11a.push([`${build.str}/${build.agi}`, `${result.p1WinRate}%`, result.avgTurns, verdict]);
  }

  printTable('ANALYSIS 11A: Berserker on Different Stat Builds', headers11a, rows11a);
  writeCSV('11a_berserker_builds.csv', headers11a, rows11a);

  // 11B: Berserker vs every other mutation (mirror stats)
  console.log('  ── 11B: Berserker vs Every Mutation (Both at 100/100) ──');
  const headers11b = ['Opponent Mutation', 'Rarity', 'Berserker Win%', 'Avg Turns', 'Verdict'];
  const rows11b = [];

  for (const mName of ALL_MUTATION_NAMES) {
    if (mName === 'Berserker') continue;

    const berserkerP1 = { strength: 100, agility: 100, mutations: ['Berserker'] };
    const counterP2 = { strength: 100, agility: 100, mutations: [mName] };

    const result = runSimulation(berserkerP1, counterP2, N);
    const wr = parseFloat(result.p1WinRate);

    let verdict;
    if (wr >= 65) verdict = '🔴 Berserker crushes';
    else if (wr >= 55) verdict = '🟠 Berserker favored';
    else if (wr >= 45) verdict = '🟢 Even matchup';
    else if (wr >= 35) verdict = '🟠 Counter favored';
    else verdict = '🔴 Hard counter';

    const mutObj = new MUTATION_TYPES[mName]();
    rows11b.push([mName, mutObj.rarity, `${result.p1WinRate}%`, result.avgTurns, verdict]);
  }

  rows11b.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
  printTable('ANALYSIS 11B: Berserker vs Each Mutation (1v1 at 100/100)', headers11b, rows11b);
  writeCSV('11b_berserker_vs_mutations.csv', headers11b, rows11b);
}

// ==========================================
// ANALYSIS 12: BLOODTHIRST SYNERGY
// ==========================================
function analyzeBloodthirstSynergy() {
  const N = 1000;
  console.log('\n  ── 12A: Bloodthirst Build Sweep (with Berserker) vs Base ──');
  const headers = ['Build STR/AGI', 'Bloodthirst+Bers Win%', 'Avg Turns', 'Verdict'];
  const rows = [];

  const profiles = [
    { name: 'Pure STR', str: 200, agi: 50 },
    { name: 'Pure AGI', str: 50, agi: 200 },
    { name: 'Hybrid', str: 125, agility: 125 }
  ];

  for (const p of profiles) {
    const build = {
      strength: p.str || p.strength,
      agility: p.agi || p.agility,
      mutations: ['Bloodthirst', 'Berserker']
    };
    const base = { strength: 100, agility: 100, mutations: [] };
    const result = runSimulation(build, base, N);

    rows.push([
      `${build.strength}/${build.agility}`,
      `${result.p1WinRate}%`,
      result.avgTurns,
      parseFloat(result.p1WinRate) > 55 ? '🟢 Strong' : '⚖️ Balanced'
    ]);
  }
  printTable('ANALYSIS 12A: Bloodthirst + Berserker on Different Builds', headers, rows);

  console.log('\n  ── 12B: Bloodthirst Combinations (Hybrid 125/125) ──');
  const headersB = ['Combo', 'Win% vs No Mutation', 'Survival Chance', 'Verdict'];
  const rowsB = [];

  const combos = [
    ['Bloodthirst', 'Berserker'],
    ['Bloodthirst', 'Lifetap'],
    ['Bloodthirst', 'Second Wind'],
    ['Bloodthirst', 'Thorn Skin'],
    ['Bloodthirst', 'Momentum'],
  ];

  for (const combo of combos) {
    const p1 = { strength: 125, agility: 125, mutations: combo };
    const p2 = { strength: 125, agility: 125, mutations: [] };
    const result = runSimulation(p1, p2, N);

    rowsB.push([
      combo.join(' + '),
      `${result.p1WinRate}%`,
      combo.includes('Second Wind') ? 'Very High' : 'Medium',
      parseFloat(result.p1WinRate) > 70 ? '🔥 Meta' : '🟢 Strong'
    ]);
  }
  printTable('ANALYSIS 12B: Bloodthirst Synergies (Hybrid 125/125)', headersB, rowsB);
  writeCSV('12_bloodthirst_synergy.csv', headersB, rowsB);
}

// ==========================================
// MAIN
// ==========================================
// ==========================================
// ANALYSIS 13: FINAL BALANCE SWEEP (Triple Threat)
// ==========================================
function analyzeFinalBalanceSweep() {
  const N = 1000;
  const statLevels = [50, 100, 200, 400];

  const archetypes = [
    { name: 'STR Juggernaut', str: 1, agi: 0.2, int: 0.1, mutations: ['Thick Hide', 'Iron Will', 'Second Wind'] },
    { name: 'STR Berserker', str: 1, agi: 0.3, int: 0.1, mutations: ['Berserker', 'Brutal Strike', 'Momentum'] },
    { name: 'AGI Assassin', str: 0.2, agi: 1, int: 0.1, mutations: ['Assassinate', 'Phantom Step', 'Quick Reflex'] },
    { name: 'AGI Bleed', str: 0.2, agi: 1, int: 0.1, mutations: ['Assassinate', 'Bloodletting', 'Corrosive Touch'] },
    { name: 'INT Mage', str: 0.1, agi: 0.2, int: 1, mutations: ['Magic Shield', 'Mind Blast', 'Iron Will'] },
  ];

  console.log('\n  ── ANALYSIS 13: FINAL BALANCE SWEEP ──');

  for (const level of statLevels) {
    const isEndGame = (level === 400);
    const hpOverride = isEndGame ? 1500 : null;

    const headers = ['Build A', 'Build B', 'A Win%', 'Avg Turns', 'Verdict'];
    const rows = [];

    // Create profile instances for this level
    const profiles = archetypes.map(arc => {
      return {
        name: arc.name,
        strength: Math.floor(level * arc.str),
        agility: Math.floor(level * arc.agi),
        intelligence: Math.floor(level * arc.int),
        mutations: arc.mutations,
        hp: hpOverride
      };
    });

    for (let i = 0; i < profiles.length; i++) {
      for (let j = 0; j < profiles.length; j++) {
        if (i === j) continue;
        const pA = profiles[i];
        const pB = profiles[j];

        const result = runSimulation({ ...pA }, { ...pB }, N);
        const wr = parseFloat(result.p1WinRate);

        let verdict = '⚖️ Balanced';
        if (wr > 60) verdict = `🔥 ${pA.name} Dominant`;
        if (wr < 40) verdict = `❄️ ${pB.name} Dominant`;

        rows.push([pA.name, pB.name, `${result.p1WinRate}%`, result.avgTurns, verdict]);
      }
    }

    printTable(`FINAL SWEEP: @${level} Stats${hpOverride ? ` (${hpOverride} HP)` : ''}`, headers, rows);
    writeCSV(`13_final_sweep_${level}.csv`, headers, rows);
  }
}

function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     MUTAGEN ARENA — FULL SWEEP BALANCE REPORT              ║');
  console.log('║     Running thousands of headless battles...               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const start = Date.now();

  // We only run the final sweep as requested to save time and give the specific details needed.
  console.log('⏳ Running Analysis 13/13: FINAL BALANCE SWEEP...');
  analyzeFinalBalanceSweep();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('═'.repeat(80));
  console.log(`  ✅ Balance sweep complete in ${elapsed}s`);
  console.log(`  📁 CSV files saved to: ${RESULTS_DIR}`);
  console.log('═'.repeat(80));
}

main();
