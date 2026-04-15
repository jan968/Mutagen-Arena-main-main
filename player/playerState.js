const COOLDOWN_DURATION = 60; // seconds
const SKIP_COST = 0;          // 15 coins
const CIRCUMFERENCE = 2 * Math.PI * 42; // SVG circle circumference
const ES_BYPASS_TYPES = ['BLEED', 'BLEED_TICK', 'TRUE_DAMAGE', 'THORN_REFLECT', 'CORROSIVE_APPLY'];
const BASE_STAT = 50;
const MAX_LEVEL = 99;
const POINTS_PER_LEVEL = 5;
const MAX_INVESTABLE = MAX_LEVEL * POINTS_PER_LEVEL; // 495

window._pauseBattle = false;

const gameState = {
  player: {
    elo: 1000,
    wins: 0,
    losses: 0,
    totalBattles: 0,
    strength: 0,
    agility: 400,
    intelligence: 0,
    winStreak: 0,
    coins: 20,
    hp: 1800,
    mutations: ['Assassinate', 'Echo Strike', 'Bloodletting', 'Corrosive Touch', 'Reality Fracture', 'Staggering Blow']
  },

  battleLog: [],
  lastNarrativeIndex: -1,
  lastOpponentName: '',

  // Battle flow state
  isBattling: false,
  cooldownActive: false,
  cooldownTime: 0,
  cooldownIntervalId: null,
  battleTimeoutId: null,
  battleTextIntervalId: null,
  fighterAnimIntervalId: null,
  pendingOpponent: null,
  playerDisplayHp: 100,
  enemyDisplayHp: 100,
};