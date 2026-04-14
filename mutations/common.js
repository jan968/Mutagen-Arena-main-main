// --- COMMON MUTATIONS ---
class Bloodletting extends Mutation {
  constructor() {
    super('Bloodletting', 'Common',
      'On hit: chance to apply bleed. AGI increases proc chance and stack cap, STR increases tick damage.');
    this.scaling = { str: 0.7, agi: 1.0, hp: 0 };
  }

  onAfterDamage(_state, owner, opponent, damageContext) {
    if (damageContext.attacker !== owner) return;
    if (damageContext.isEcho) return;
    if (opponent.currentHP <= 0) return;
    if (damageContext.finalDamage <= 0 || damageContext.isDodged || damageContext.prevented) return;

    const { str, agi } = this.getScalingValue(owner);

    // AGI: proc chance 40% base → 90% at full AGI investment
    const procChance = 0.40 + (agi * this.scaling.agi * 0.55);
    if (Math.random() > procChance) return;

    // STR: tick damage scales up to 60% stronger at full STR investment
    const bleedValue = Math.max(1, Math.floor(
      Math.sqrt(opponent.maxHP) * 0.15 * (1 + str * this.scaling.str)
    ));

    // AGI: stack cap 2 normally, 3 at 70%+ AGI investment
    const stackCap = agi >= 0.70 ? 3 : 2;

    const ownStacks = opponent.statusEffects.filter(
      ef => ef.name === 'Bleed' && ef.source === owner.name && !ef.isCorrosive
    );

    if (ownStacks.length < stackCap) {
      const bleedDuration = Math.floor(3 + (agi * 2));
      opponent.statusEffects.push({
        name: 'Bleed',
        value: bleedValue,
        duration: bleedDuration,
        source: owner.name,
      });
      _state.pushEvent({
        type: 'BLEED_APPLY',
        source: owner.name,
        target: opponent.name,
        stackCount: opponent.statusEffects.filter(e => e.name === 'Bleed').reduce((sum, e) => sum + (e.stacks || 1), 0)
      });
    } else {
      const bleedDuration = Math.floor(3 + (agi * 2));
      const oldest = ownStacks.reduce((a, b) => a.duration < b.duration ? a : b);
      oldest.duration = Math.min(oldest.duration + 1, bleedDuration);
      _state.pushEvent({
        type: 'BLEED_APPLY',
        source: owner.name,
        target: opponent.name,
        stackCount: opponent.statusEffects.filter(e => e.name === 'Bleed').reduce((sum, e) => sum + (e.stacks || 1), 0)
      });
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


class IronWill extends Mutation {
  constructor() {
    super('Iron Will', 'Common',
      'Reduces incoming damage based on missing HP — the lower you are, the harder you resist');
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
    const hasThickHide = owner.mutations.some(m => m.name === 'Thick Hide');
    const effectiveMax = hasThickHide ? 8 : this.maxReduction;
    const reduction = Math.floor(
      this.baseReduction + (effectiveMax - this.baseReduction) * missingHP
    );

    const originalDamage = damageContext.finalDamage;
    damageContext.finalDamage = Math.max(1, damageContext.finalDamage - reduction);

    if (originalDamage !== damageContext.finalDamage) {
      state.pushEvent({
        type: 'IRON_WILL_BLOCK',
        value: reduction,
        source: opponent.name,  // attacker
        target: owner.name,     // defender (who blocked)
        mutation: this.name
      });
    }
  }
}

class BrutalStrike extends Mutation {
  constructor() {
    super('Brutal Strike', 'Common', '+20% damage dealt, but -5% dodge chance.');
  }
  onBeforeAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker === owner) attackContext.damageMultiplier += 0.20;
  }

  onBeforeDamage(state, owner, opponent, damageContext) {
    if (damageContext.defender !== owner) return;
    if (damageContext.isDodged) {
      // Flat 30% chance to negate a successful dodge
      if (Math.random() < 0.30) {
        damageContext.isDodged = false;
        damageContext.prevented = false;
        const evIdx = state._currentGroup.findIndex(
          e => e.type === 'DODGE' && e.target === owner.name
        );
        if (evIdx > -1) state._currentGroup.splice(evIdx, 1);
      }
    }
  }
}