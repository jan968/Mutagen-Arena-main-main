// ==========================================
// SMOOTH NUMBER ANIMATOR
// ==========================================

class SmoothValue {
  constructor(initial = 0, opts = {}) {
    this.current = initial;      // displayed (animated) value
    this.target = initial;       // target we're moving toward
    this.speed = opts.speed ?? 8; // higher = faster catch-up
    this.threshold = opts.threshold ?? 0.5; // snap when this close
    this._rafId = null;
    this._onUpdate = opts.onUpdate || null;
  }

  set(value) {
    this.target = value;
    this._startLoop();
  }

  snap(value) {
    this.current = value;
    this.target = value;
    this._cancelLoop();
    if (this._onUpdate) this._onUpdate(value);
  }

  _startLoop() {
    if (this._rafId) return; // already running
    const tick = () => {
      const delta = this.target - this.current;
      if (Math.abs(delta) < this.threshold) {
        this.current = this.target;
        this._rafId = null;
        if (this._onUpdate) this._onUpdate(this.current);
        return;
      }
      // Exponential ease-out: moves fast at first, slows near target
      this.current += delta * (1 - Math.pow(0.01, this._dt()));
      if (this._onUpdate) this._onUpdate(this.current);
      this._rafId = requestAnimationFrame(tick);
    };
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(tick);
  }

  _cancelLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _dt() {
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.1); // seconds, capped
    this._lastTime = now;
    return this.speed * dt;
  }
}

// ── ES Animator instances — one per fighter ──
const esAnimators = {
  player: null,
  enemy: null,
};

const hpAnimators = {
  player: null,
  enemy: null,
};

function initEsAnimators(playerMaxES, playerCurrentES, enemyMaxES, enemyCurrentES) {
  esAnimators.player = new SmoothValue(playerCurrentES, {
    speed: 6,
    threshold: 0.3,
    onUpdate: (val) => {
      _renderEsText(true, val, playerMaxES);
      // also drive the bar width
      const bar = document.getElementById('playerEsBar');
      if (bar) bar.style.width = Math.min((val / gameState.playerMaxHP) * 100, 100) + '%';
    },
  });

  esAnimators.enemy = new SmoothValue(enemyCurrentES, {
    speed: 6,
    threshold: 0.3,
    onUpdate: (val) => {
      _renderEsText(false, val, enemyMaxES);
      const bar = document.getElementById('enemyEsBar');
      if (bar) {
        const maxHP = gameState.enemyMaxHP || 1;
        bar.style.width = Math.min((val / maxHP) * 100, 100) + '%';
      }
    },
  });
}


function initHpAnimators(playerMaxHP, enemyMaxHP) {
  hpAnimators.player = new SmoothValue(playerMaxHP, {
    speed: 6,
    threshold: 0.3,
    onUpdate: (val) => {
      const el = document.getElementById('playerHpText');
      if (el) el.textContent = `${Math.max(0, Math.round(val))} HP`;
      const bar = document.getElementById('playerHpBar');
      if (bar) bar.style.width = Math.min((val / playerMaxHP) * 100, 100) + '%';
    },
  });
  hpAnimators.enemy = new SmoothValue(enemyMaxHP, {
    speed: 6,
    threshold: 0.3,
    onUpdate: (val) => {
      const el = document.getElementById('enemyHpText');
      if (el) el.textContent = `${Math.max(0, Math.round(val))} HP`;
      const bar = document.getElementById('enemyHpBar');
      if (bar) bar.style.width = Math.min((val / enemyMaxHP) * 100, 100) + '%';
    },
  });
}

function _renderEsText(isPlayer, currentES, maxES) {
  const textId = isPlayer ? 'playerEsText' : 'enemyEsText';
  const text = document.getElementById(textId);
  if (!text) return;
  if (!maxES || maxES <= 0) {
    text.textContent = '';
    return;
  }
  const rounded = Math.max(0, Math.round(currentES));
  text.textContent = rounded > 0 ? `⬡ ${rounded}` : '';
}


function setEsBar(isPlayer, currentES, maxES, maxHP) {
  const barId = isPlayer ? 'playerEsBar' : 'enemyEsBar';
  const bar = document.getElementById(barId);
  if (!bar) return;

  const animator = isPlayer ? esAnimators.player : esAnimators.enemy;
  if (animator && maxES > 0) {
    animator._maxES = maxES;
    animator._maxHP = maxHP;
    animator._onUpdate = (val) => {
      _renderEsText(isPlayer, val, animator._maxES);
      const b = document.getElementById(barId);
      if (b) b.style.width = Math.min((val / animator._maxHP) * 100, 100) + '%';
    };
    animator.set(currentES);
  } else {
    bar.style.width = '0%';
    const textId = isPlayer ? 'playerEsText' : 'enemyEsText';
    const text = document.getElementById(textId);
    if (text) text.textContent = '';
  }
}

function setHpBar(isPlayer, newPct) {
  const barId = isPlayer ? 'playerHpBar' : 'enemyHpBar';
  const chipId = isPlayer ? 'playerHpChip' : 'enemyHpChip';
  const bar = document.getElementById(barId);
  const chip = document.getElementById(chipId);

  chip.style.width = bar.style.width || '100%';

  // color only — animator owns the width now
  bar.classList.remove('hp-high', 'hp-mid', 'hp-low');
  if (newPct > 60) bar.classList.add('hp-high');
  else if (newPct > 30) bar.classList.add('hp-mid');
  else bar.classList.add('hp-low');
}