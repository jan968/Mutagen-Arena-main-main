// ==========================================
// LOG GENERATOR (NARRATIVE SYSTEM)
// ==========================================

const RECENT_MEMORY_SIZE = 3;

const BATTLE_STRINGS = {
  ATTACK_STR: [
    "{source} unleashes a **CRUSHING BLOW** on {target}!",
    "{source} smashes into {target} with brute force!",
    "{source} OBLITERATES {target} with a heavy strike!",
  ],
  ATTACK_AGI: [
    "{source} lands a **PRECISION STRIKE** on {target}!",
    "{source} pierces {target} with a swift blur of motion!",
    "{source} strikes {target} with blistering speed!",
  ],
  ATTACK_INT: [
    "{source} unleashes an **ARCANE PULSE** at {target}!",
    "{source} overruns {target} with a surge of magical power!",
    "{source} strikes {target} with an ethereal blast!",
  ],
  ATTACK_VANGUARD: [
    "{source} executes a coordinated Vanguard strike on {target}!",
    "{source} balances power and speed to overwhelm {target}!",
  ],
  ATTACK_SPELLBLADE: [
    "{source} weaves steel and sorcery against {target}!",
    "{source} strikes {target} with an infused Arcane Slice!",
  ],
  ATTACK_NIGHTSHADE: [
    "{source} strikes from the shadows with magical grace!",
    "{source} overwhelms {target} with Nightshade precision!",
  ],
  ATTACK_MUTANT_PRIME: [
    "{source} unleashes the perfect form of combat on {target}!",
    "{source} strikes {target} with the power of an evolved Prime Mutant!",
  ],
  ATTACK_START: [
    "{source} attacks {target}!",
  ],
  DAMAGE: [
    "{source} strikes {target} with tremendous force for {value} damage!",
    "{target} takes a heavy hit from {source}, losing {value} HP.",
    "A solid blow! {source} hits {target} for {value} damage.",
    "{source} finds an opening and deals {value} damage to {target}."
  ],
  DODGE: [
    "{target} swiftly dodges the attack from {source}!",
    "Miraculously, {target} side-steps {source}'s swing.",
    "{source} swings at empty air as {target} weaves away.",
    "Fast reflexes! {target} evades {source}'s strike."
  ],
  LIFESTEAL: [
    "{source}'s {mutation} triggers! They siphon {value} HP while dealing damage.",
    "Blood flows as {source} uses {mutation}, healing for {value} HP!",
    "Sinister energy drains life from the target! {source} heals {value} HP via {mutation}."
  ],
  STUN: [
    "{target} is stunned and cannot move!",
    "Reeling from the impact, {target} misses their turn.",
    "{target} tries to attack, but the stun paralyzes them!"
  ],

  BLEED: [
    "{target} suffers {value} damage from bleeding.",
    "Blood loss drains {value} life from {target}."
  ], MOMENTUM_STACK: [
    "{source} is gaining momentum! ({stacks} stacks)",
    "Speed building! {source} lands another consecutive hit.",
    "{source} finds their rhythm — {stacks} stacks of Momentum!",
  ],
  BLEED_TICK: [
    "{target} writhes as the wound festers for {value} damage.",
    "{target} bleeds for {value} damage.",
    "The wound tears deeper, dealing {value} damage to {target}.",
  ],

  LIFETAP_DRAIN: [
    "{source} burns their own life force, draining {value} HP!",
    "{source} sacrifices {value} HP to fuel the attack!",
    "Blood for power — {source} loses {value} HP!",
  ],

  PHANTOM_STEP: [
    "{source} vanishes and reappears behind {target} — counter-attack!",
    "A phantom blur! {source} strikes back from the shadows.",
    "The dodge becomes an attack — {source} counters instantly!",
  ],
  DAZE_APPLY: [
    "{source} dazes {target} — STR and AGI reduced!",
    "{target} is dazed by {source}'s critical strike!",
  ],
  DAZE_TICK: [
    "{target} is dazed — weakened this turn.",
  ],
  DAZE_EXPIRE: [
    "{target} shakes off the daze!",
  ],
  MAGIC_SHIELD_REFRESH: [
    "{source} weaves a shimmering barrier of pure intent!",
    "A magical shield envelops {source}.",
  ],
  MIND_BLAST: [
    "{source} unleashes a blast of pure mental energy!",
    "Mind Blast! {target} is struck by a surge of psychic power.",
  ],
  BERSERKER_STACK: [
    "{source} is enraged! ({stacks} stacks)",
    "Pain fuels {source}'s fury — {stacks} Berserker stacks!",
    "{source} grows stronger with each blow — {stacks} stacks!",
    "The rage builds in {source}! {stacks}/{maxStacks} stacks.",
  ],

  THICK_HIDE_BLOCK: [
    "{source}'s thick hide absorbs {value} damage!",
    "The blow glances off {source}'s hardened skin, reducing damage by {value}.",
  ],
  CORROSIVE_APPLY: [
    "{source} coats {target} in corrosive poison!",
    "A toxic substance seeps into {target}'s wounds!",
    "{target} is infected with {source}'s corrosive touch!",
  ],
  BLOCK: [
    "{source}'s {mutation} deflects the incoming blow!",
    "An invisible barrier! {mutation} protects {source} from damage.",
    "{source} effortlessly parries using {mutation}."
  ],
  IRON_WILL_BLOCK: [
    "{target} grits through the pain, resisting {value} damage!",
    "Sheer willpower! {target} absorbs {value} damage.",
    "The lower they fall, the harder {target} holds — blocks {value}.",
  ],
  THORN_REFLECT: [
    "{source}'s {mutation} reflects {value} damage back to {target}!",
    "Spikes erupt! {target} takes {value} damage from {source}'s {mutation}.",
    "{source} deflects the blow, dealing {value} damage to {target} via {mutation}."
  ],
  TIME_WARP_TRIGGER: [
    "Temporal shift! {source} is taking another action!",
    "{source} warps time to strike again!",
    "A ripple in time! {source} gains an extra attack!"
  ],
  ECHO_STRIKE: [
    "{source}'s strike echoes! A second blow follows.",
    "The attack is repeated! {source} hits again.",
    "An afterimage appears! {source} echoes the attack."
  ],
  CRIT: [
    "⚡ CRITICAL HIT! {source} strikes a vital point for {value} damage!",
    "⚡ {source} finds the perfect opening — CRIT for {value} damage!",
    "⚡ A devastating blow! {source} crits {target} for {value}!",
    "⚡ Lightning precision! {source} deals {value} critical damage!"
  ],
  DOUBLE_STRIKE: [
    "{source} strikes again in a blur of motion!",
    "Too fast to follow — {source} lands a second hit!",
  ],
  BLEED_APPLY: [
    "{target} is cut! Bleeding {stackCount} stack(s).",
    "{source} opens a wound on {target}!",
  ],
  DEATH: [
    "{target} has been defeated!",
    "{target} falls in the arena.",
    "A final blow! {target} is eliminated."
  ],
  ES_ABSORB: [
    "{target}'s barrier absorbs {value} damage!",
    "The arcane shell around {target} drinks {value} damage.",
    "Blue light flares — {target}'s energy shield blocks {value}!",
  ],
  ES_DEPLETED: [
    "{target}'s shield shatters! They're exposed!",
    "The energy barrier collapses around {target}!",
  ],
  ES_RECHARGE: [
    "{target}'s energy shield hums back to life.",
    "Arcane energy rebuilds around {target}.",
  ],
  CHILL_APPLY: [
    "{target} is encased in frost — slowed and brittle!",
    "Ice spreads across {target}'s body!",
    "{source}'s blizzard chills {target} to the bone!",
  ],
  CHILL_SHATTER: [
    "{target} SHATTERS under {source}'s strike for {value} damage!",
    "The ice explodes! {source} smashes through for {value}!",
    "SHATTER! {target}'s brittle form crumbles for {value} damage!",
  ],
  CHILL_EXPIRE: [
    "The frost fades from {target}.",
    "{target} shakes off the chill.",
  ],
  REALITY_FRACTURE: [
    "{source} tears a hole in reality — {value} true damage phases through {target}!",
    "Spacetime splinters! {source} fractures {target}'s defenses for {value} damage.",
    "{target} has no defense against fractured space — {value} damage lands unimpeded!",
    "A {fraction}% fracture rips through {target} for {value} unstoppable damage!",
  ],
};

const lastTemplateIndices = {
  DAMAGE: [], DODGE: [], LIFESTEAL: [], STUN: [], BLEED: [], BLOCK: [],
  THORN_REFLECT: [], TIME_WARP_TRIGGER: [], ECHO_STRIKE: [], DEATH: [],
  BLEED_TICK: [], CORROSIVE_APPLY: [], MOMENTUM_STACK: [], THICK_HIDE_BLOCK: [],
  CRIT: [], DOUBLE_STRIKE: [], BLEED_APPLY: [], LIFETAP_DRAIN: [], PHANTOM_STEP: [], BERSERKER_STACK: [], IRON_WILL_BLOCK: [], DAZE_APPLY: [], DAZE_TICK: [], DAZE_EXPIRE: [],
  MAGIC_SHIELD_REFRESH: [], MIND_BLAST: [],
  ES_ABSORB: [], ES_DEPLETED: [], ES_RECHARGE: [], CHILL_APPLY: [], CHILL_SHATTER: [], CHILL_EXPIRE: [], REALITY_FRACTURE: [],
};

function generateBattleLog(event) {
  const strings = BATTLE_STRINGS[event.type];
  if (!strings) return `[${event.type}]`;

  // Anti-repetition logic: avoid the last up-to-3 indices used for this type
  let idx;
  const memory = lastTemplateIndices[event.type];

  do {
    idx = Math.floor(Math.random() * strings.length);
  } while (memory.includes(idx) && strings.length > RECENT_MEMORY_SIZE);

  memory.push(idx);
  if (memory.length > RECENT_MEMORY_SIZE) memory.shift();

  let text = strings[idx];

  // Replace tokens with event data
  text = text.replace('{source}', event.source || '');
  text = text.replace('{target}', event.target || '');
  text = text.replace('{value}', event.value || 0);
  text = text.replace('{mutation}', event.mutation || '');
  text = text.replace('{stacks}', event.stacks || 0);
  text = text.replace('{maxStacks}', event.maxStacks || 0);
  return text;
}