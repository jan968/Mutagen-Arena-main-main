// --- RARE MUTATIONS ---
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
    super('Thorn Skin', 'Rare', 'Reflects damage back to attacker. Base 15%, scaling up to 45% with STR investment.');
    this.scaling = { str: 1.0, agi: 0, hp: 0 };
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

    /*
    console.log('THORN DEBUG', {
      baseDamage: damageContext.baseDamage,
      finalDamage: damageContext.finalDamage,
      reflectPercent,
      totalReflect
    });
    
    */


    // Safety cap: never reflect more than 25% of owner's max HP per hit
    const cap = Math.floor(owner.maxHP * 0.25);
    totalReflect = Math.min(totalReflect, cap);

    /*
    console.log('THORN AFTER CAP', totalReflect);
    */

    if (totalReflect > 0) {
      state.engine.dealDamage(owner, opponent, totalReflect, {
        isReflection: true,
        eventType: 'THORN_REFLECT',
        type: 'THORN_REFLECT',
        mutation: this.name,
        baseDamage: damageContext.baseDamage
      });
    }
  }
}

class SecondWind extends Mutation {
  constructor() {
    super('Second Wind', 'Rare', 'Once per battle: survive a lethal hit and restore 30% Max HP.');
  }

  // Use onBeforeDamage to "catch" the lethal blow BEFORE the character dies
  onBeforeDamage(state, owner, opponent, damageContext) {
    // 1. Ownership check (Are we the one getting hit?)
    if (damageContext.defender !== owner) return;

    // 2. THE BYPASS CHECK (The most important part)
    // If the attacker has 'survival bypass' (Assassinate), Second Wind is disabled.
    if (damageContext.bypass?.survival) return;

    // 3. Trigger Logic
    if (!owner.flags) owner.flags = {};

    // Check if damage is lethal and we haven't used the revive yet
    if (owner.currentHP <= damageContext.finalDamage && !owner.flags.reviveUsed) {

      // Stop the damage from actually happening
      damageContext.finalDamage = 0;
      damageContext.prevented = true;

      // Execute the revive
      this.triggerRevive(state, owner);
    }
  }

  triggerRevive(state, owner) {
    owner.flags.reviveUsed = true;
    const reviveAmount = Math.floor(owner.maxHP * 0.30);
    owner.currentHP = reviveAmount;
    owner.currentES = 0; // Explicitly clear ES on revive


    state.pushEvent({
      type: 'BLOCK',
      value: 0,
      source: owner.name,
      target: owner.name,
      mutation: this.name
    });

    state.pushEvent({
      type: 'HEAL',
      value: reviveAmount,
      source: owner.name,
      target: owner.name,
      mutation: 'Second Wind',
      resultingHP: Math.floor((owner.currentHP / owner.maxHP) * 100),
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
    healContext.amount = Math.floor(healContext.amount * 3);
  }
}

class MagicShield extends Mutation {
  constructor() {
    super('Magic Shield', 'Rare', 'Each turn, restore INT×10% of your max Energy Shield. Your INT investment directly grows both ES pool and sustain.');
    this.scaling = { int: 1.0 };
  }

  onTurnStart(state, owner) {
    if (owner.maxES <= 0) return;

    // Magic Shield grants faster recharge — 2 turns instead of 3
    owner.flags.esRechargeDelay = 3;
    const restore = Math.floor(owner.int * 0.10);
    const actual = Math.min(restore, owner.maxES - owner.currentES);
    if (actual <= 0) return;
    owner.currentES = Math.min(owner.maxES, owner.currentES + actual);
    state.pushEvent({
      type: 'MAGIC_SHIELD_REFRESH',
      source: owner.name,
      target: owner.name,
      value: actual,
      remainingES: owner.currentES,
      maxES: owner.maxES,
    });
  }
}

class MindBlast extends Mutation {
  constructor() {
    super('Mind Blast', 'Rare', 'A surge of magic damage scaling with INT. Bypassed by magic resistance.');
    this.scaling = { str: 0, agi: 0, hp: 0, int: 1.0 };
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (owner.currentHP <= 0 || opponent.currentHP <= 0) return;

    // 25% chance to proc
    if (Math.random() > 0.25) return;

    const baseMagicDamage = Math.floor(10 + (owner.int * 0.10));

    // Create a damage context so defensive mutations (like Thick Hide) can still react to it
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

class StaggeringBlow extends Mutation {
  constructor() {
    super('Staggering Blow', 'Rare',
      'On Critical Hit: apply Daze to the opponent, reducing their STR and AGI by 20% for 2 turns.');
    this.scaling = { str: 0, agi: 0, hp: 0, int: 0 };
  }

  onAfterAttack(state, owner, opponent, attackContext) {
    if (attackContext.attacker !== owner) return;
    if (!attackContext.isCrit) return;
    if (opponent.currentHP <= 0) return;

    // Don't stack — refresh instead
    const existing = opponent.statusEffects.find(
      ef => ef.name === 'Daze' && ef.source === owner.name
    );

    if (existing) {
      existing.duration = 2;
    } else {
      opponent.statusEffects.push({
        name: 'Daze',
        duration: 2,
        source: owner.name,
      });
    }

    state.pushEvent({
      type: 'DAZE_APPLY',
      source: owner.name,
      target: opponent.name,
    });
  }
}

class PhantomStep extends Mutation {
  constructor() {
    super('Phantom Step', 'Rare',
      'Dodging an attack triggers an immediate counter-attack. Most deadly on those who balance speed with raw power.');
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