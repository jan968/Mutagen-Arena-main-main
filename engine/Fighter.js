// ==========================================
// VISUAL IDENTITY & HYBRID SYSTEM
// ==========================================

const VFX_COLORS = {
  STR: "#FF0000",
  DEX: "#00FFFF",
  INT: "#8000FF",
  VANGUARD: "#FFA500",
  SPELLBLADE: "#8A2BE2",
  NIGHTSHADE: "#4B0082",
  MUTANT_PRIME: "#FFFFFF",
  NOVICE: "#BDBDBD"
};

const HYBRID_MAP = {
  "STR+AGI": "VANGUARD",
  "STR+INT": "SPELLBLADE",
  "AGI+INT": "NIGHTSHADE"
};

function withinPercent(a, b, percent) {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / Math.max(a, b) <= percent / 100;
}

function getFighterIdentity(fighter) {
  const stats = [
    { name: 'STR', val: fighter.str || fighter.strength || 0 },
    { name: 'AGI', val: fighter.agi || fighter.agility || 0 },
    { name: 'INT', val: fighter.int || fighter.intelligence || 0 }
  ].sort((a, b) => b.val - a.val);

  const [max, mid, min] = stats;
  const totalStats = max.val + mid.val + min.val;

  // 0. Novice Check (Starting state)
  if (totalStats <= 155) {
    return {
      attackType: 'STR',
      classTitle: 'Novice',
      vfxColor: VFX_COLORS.NOVICE
    };
  }

  // 1. Mutant Prime (All three close)
  if (withinPercent(max.val, min.val, 22)) {
    return {
      attackType: 'MUTANT_PRIME',
      classTitle: 'Mutant Prime',
      vfxColor: VFX_COLORS.MUTANT_PRIME
    };
  }

  // 2. Hybrid Check (Top two close)
  if (withinPercent(max.val, mid.val, 20)) {
    const key = `${max.name}+${mid.name}`;
    const reverseKey = `${mid.name}+${max.name}`;
    const id = HYBRID_MAP[key] || HYBRID_MAP[reverseKey];

    if (id) {
      return {
        attackType: id,
        classTitle: id.charAt(0) + id.slice(1).toLowerCase(),
        vfxColor: VFX_COLORS[id]
      };
    }
  }

  // 3. Fallback to Primary
  return {
    attackType: max.name, // STR, AGI, or INT
    classTitle: max.name === 'STR' ? 'Warrior' : (max.name === 'AGI' ? 'Rogue' : 'Mage'),
    vfxColor: VFX_COLORS[max.name]
  };
}