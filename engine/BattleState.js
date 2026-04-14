class BattleState {
  constructor(playerData, enemyData) {
    this.player = {
      name: 'You',
      maxHP: playerData.hp || (150 + Math.floor(playerData.strength * 0.5)),
      currentHP: playerData.hp || (150 + Math.floor(playerData.strength * 0.5)),
      str: playerData.strength,
      agi: playerData.agility,
      int: playerData.intelligence || 50,
      // Instantiate saved mutations
      mutations: (playerData.mutations || []).map(mName => new MUTATION_TYPES[mName]()),
      statusEffects: [],
      flags: {}
    };

    // Assign Identity
    const pId = getFighterIdentity(this.player);
    this.player.attackType = pId.attackType;
    this.player.classTitle = pId.classTitle;
    this.player.vfxColor = pId.vfxColor;

    // ES initialization
    const pMaxES = Math.floor(this.player.maxHP * (0.10 + (this.player.int / 10) * 0.01));
    this.player.maxES = pMaxES;
    this.player.currentES = pMaxES;

    this.enemy = {
      name: enemyData.name || 'Enemy',
      maxHP: enemyData.hp || (150 + Math.floor(enemyData.strength * 0.5)),
      currentHP: enemyData.hp || (150 + Math.floor(enemyData.strength * 0.5)),
      str: enemyData.strength,
      agi: enemyData.agility,
      int: enemyData.intelligence || 50,
      mutations: (enemyData.mutations || []).map(mName => new MUTATION_TYPES[mName]()),
      statusEffects: [],
      flags: {}
    };

    // Assign Identity
    const eId = getFighterIdentity(this.enemy);
    this.enemy.attackType = eId.attackType;
    this.enemy.classTitle = eId.classTitle;
    this.enemy.vfxColor = eId.vfxColor;

    // ES initialization
    const eMaxES = Math.floor(this.enemy.maxHP * (this.enemy.int / 10) * 0.01);
    this.enemy.maxES = eMaxES;
    this.enemy.currentES = eMaxES;

    this.turnNumber = 0;
    this.eventQueue = [];
    this._currentGroup = [];
    this.flags = {}; // Global battle flags
  }
  pushEvent(event) {
    let hp = 0;
    if (event.type === 'DEATH') {
      hp = 0;
    } else if (event.type !== 'CHARGE_UPDATE' && event.type !== 'TIME_WARP_TRIGGER') {
      // Always snapshot the TARGET's HP
      const target = (event.target === this.player.name) ? this.player : this.enemy;
      hp = target ? target.currentHP : 0;
    }
    // Calculate HP as a percentage of maxHP (0-100) instead of raw value
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