// ==========================================
// OPPONENT GENERATION
// ==========================================
const OPPONENT_NAMES = [
  'Shadow Fang', 'Iron Valkyrie', 'Blood Raven', 'Storm Serpent',
  'Void Walker', 'Crystal Mage', 'Ember Knight', 'Frost Wraith',
  'Thunder Hawk', 'Bone Crusher', 'Night Stalker', 'Silver Wolf',
  'Dark Phoenix', 'Stone Golem', 'Wind Dancer', 'Plague Doctor',
  'Hex Blade', 'Soul Reaper', 'Arc Mage', 'Hell Hound',
];

function generateOpponent(playerElo) {
  const eloVariance = Math.floor(gaussianRandom() * 200);
  const opponentElo = Math.max(400, playerElo + eloVariance);

  let name;
  do {
    name = OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
  } while (name === gameState.lastOpponentName && OPPONENT_NAMES.length > 1);
  gameState.lastOpponentName = name;

  const statBase = Math.floor(Math.min(90, Math.max(20, (opponentElo / 20))));
  const strength = clamp(statBase + Math.floor(gaussianRandom() * 15), 10, 100);
  const agility = clamp(statBase + Math.floor(gaussianRandom() * 15), 10, 100);

  return {
    name: 'Test Dummy',
    elo: playerElo,
    winRate: 0.5,
    strength: 400,
    agility: 0,
    intelligence: 0,
    hp: 1800,
    mutations: ['Thick Hide', 'Iron Will', 'Second Wind']
  };

  return {
    name,
    elo: opponentElo,
    winRate: clamp(0.3 + Math.random() * 0.5, 0.05, 0.95),
    strength,
    agility,
    intelligence: statBase,
  };
}