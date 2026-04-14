// ==========================================
// MUTATION SYSTEM & CLASSES
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

  // Lifecycle Hooks (override only necessary ones)
  onBattleStart(state, owner, opponent) { }
  onTurnStart(state, owner, opponent) { }
  onBeforeAttack(state, owner, opponent, attackContext) { }
  onAfterAttack(state, owner, opponent, attackContext) { }
  onBeforeDamage(state, owner, opponent, damageContext) { }
  onAfterDamage(state, owner, opponent, damageContext) { }
  onTurnEnd(state, owner, opponent) { }
}