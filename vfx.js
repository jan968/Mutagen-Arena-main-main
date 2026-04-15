/* =============================================
   TEXT BATTLE ARENA — VFX ENGINE
   Canvas-based particle & effect system.
   Drop this file in alongside app.js and add
   <script src="vfx.js"></script> BEFORE app.js.
   ============================================= */

const VFX = (() => {

    const esIcon = new Image();
    esIcon.src = "assets/images/energy_shield.webp";

    let canvas, ctx, arena;
    let particles = [];
    let effects = [];
    let rafId = null;
    let lastFrameTime = 0;

    function init() {
        arena = document.getElementById('fighterArena');
        if (!arena) return;

        const old = document.getElementById('vfxCanvas');
        if (old) old.remove();

        canvas = document.createElement('canvas');
        canvas.id = 'vfxCanvas';
        canvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        border-radius: inherit;
    `;
        arena.appendChild(canvas);
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        loop();
    }

    function resizeCanvas() {
        if (!canvas || !arena) return;
        const rect = arena.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas._w = rect.width;
        canvas._h = rect.height;
    }

    // ─── Render Loop ────────────────────────────────────────────────

    function loop(timestamp) {
        rafId = requestAnimationFrame(loop);

        const dt = lastFrameTime ? Math.min(timestamp - lastFrameTime, 50) : 16.67;
        lastFrameTime = timestamp;
        const dtScale = dt / 16.67;

        const W = canvas._w || canvas.width;
        const H = canvas._h || canvas.height;
        ctx.clearRect(0, 0, W, H);

        effects = effects.filter(e => {
            e.tick(dt);
            e.draw(ctx, W, H);
            return e.alive;
        });

        particles = particles.filter(p => {
            p.x += p.vx * dtScale;
            p.y += p.vy * dtScale;
            p.vy += p.gravity * dtScale;
            const scaledDrag = Math.pow(p.drag, dtScale);
            p.vx *= scaledDrag;
            p.vy *= scaledDrag;
            p.life -= p.decay * dtScale;
            if (p.life <= 0) return false;

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.glow || p.color;
            ctx.shadowBlur = p.glowRadius || 0;

            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const s = p.size * p.life;
                ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            }
            ctx.restore();
            return true;
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────

    function rand(min, max) { return Math.random() * (max - min) + min; }
    function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
    function randChoice(arr) { return arr[randInt(0, arr.length - 1)]; }
    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

    // ── Combat Anchor Cache ──────────────────────────────────────

    const _combatAnchors = new Map();

    function cacheCombatAnchors(arenaEl, playerEl, enemyEl) {
        const ar = (arenaEl || arena).getBoundingClientRect();

        if (playerEl && !playerEl.style.transform) playerEl.style.transform = '';
        if (enemyEl && !enemyEl.style.transform) enemyEl.style.transform = 'scaleX(-1)';

        [playerEl, enemyEl].forEach(el => {
            if (!el) return;
            const slotEl = el.closest('[id^="fighter"]') ?? el;
            const r = slotEl.getBoundingClientRect();
            const pos = {
                x: r.left - ar.left + r.width / 2,
                y: r.top - ar.top + r.height / 2,
            };
            _combatAnchors.set(el, pos);
        });
    }

    // FIX: _bleedIndicators.clear() added
    function clearCombatAnchors() {
        _combatAnchors.clear();
        _textStaggerData.clear();
        _bleedIndicators.clear();
    }

    // ── Combat Text Stagger/Lane Routing ───────────────

    const TEXT_LANES = {
        main:      { xOff: 0,   yOff: 30, staggerMs: 140, travelY: 20, baseDelay: 0   },
        secondary: { xOff: -26, yOff: 48, staggerMs: 90,  travelY: 12, baseDelay: 60  },
        counter:   { xOff: -42, yOff: 15, staggerMs: 100, travelY: 12, baseDelay: 120 },
        heal:      { xOff: -38, yOff: 4,  staggerMs: 110, travelY: 16, baseDelay: 100 },
      dot: { xOff: 55, yOff: 20, staggerMs: 280, travelY: 20, baseDelay: 140 }
    };

    const _textStaggerData = new Map();

    function getCombatTextLayout(el, anchor, laneKey = 'main') {
        if (!_textStaggerData.has(el)) {
            _textStaggerData.set(el, { main: 0, secondary: 0, heal: 0, dot: 0 });
        }
        const data = _textStaggerData.get(el);
        const laneInfo = TEXT_LANES[laneKey] || TEXT_LANES.main;

        const now = performance.now();
        let staggerDelay = laneInfo.baseDelay || 0;

        if (data[laneKey] && now < data[laneKey]) {
            staggerDelay = data[laneKey] - now;
            data[laneKey] += laneInfo.staggerMs;
        } else {
            data[laneKey] = now + laneInfo.staggerMs;
        }

        return {
            x: anchor.x + (laneInfo.xOff || 0),
            y: anchor.y + (laneInfo.yOff || 0),
            delay: staggerDelay,
            travelY: laneInfo.travelY !== undefined ? laneInfo.travelY : 30
        };
    }

    function getCombatAnchorCenter(el) {
        const cached = _combatAnchors.get(el);
        if (cached) return { x: cached.x, y: cached.y };
        return getLiveArenaRelativeCenter(el);
    }

    function getLiveArenaRelativeCenter(el) {
        const arenaRect = arena.getBoundingClientRect();
        const avatarRect = el.getBoundingClientRect();
        return {
            x: avatarRect.left - arenaRect.left + avatarRect.width / 2,
            y: avatarRect.top - arenaRect.top + avatarRect.height / 2,
        };
    }

    const avatarCenter = getLiveArenaRelativeCenter;

    function applyAvatarTransform(el, transformStr, resetDelay = 0) {
        if (!el) return;
        const isEnemy = el.id === 'enemyAvatar';
        const flip = isEnemy ? ' scaleX(-1)' : '';
        const finalTransform = transformStr ? `${transformStr}${flip}` : (isEnemy ? 'scaleX(-1)' : '');

        const transformId = Math.random();
        el._lastTransformId = transformId;
        el.style.transform = finalTransform;

        if (resetDelay > 0) {
            setTimeout(() => {
                if (el._lastTransformId === transformId) {
                    el.style.transform = isEnemy ? 'scaleX(-1)' : '';
                    el.style.transition = '';
                }
            }, resetDelay);
        }
        return transformId;
    }

    // ─── Particle Factory ────────────────────────────────────────────

    function spawnParticle(opts) {
        particles.push({
            x: opts.x,
            y: opts.y,
            vx: opts.vx || 0,
            vy: opts.vy || 0,
            gravity: opts.gravity ?? 0.08,
            drag: opts.drag ?? 0.93,
            size: opts.size || 5,
            color: opts.color || '#fff',
            glow: opts.glow || null,
            glowRadius: opts.glowRadius || 0,
            life: 1.0,
            decay: opts.decay || 0.025,
            shape: opts.shape || 'circle',
        });
    }

    // ─── Bleed Indicator Map ─────────────────────────────────────────

    const _bleedIndicators = new Map();

function getOrCreateBleedIndicator(defenderEl) {
    if (_bleedIndicators.has(defenderEl)) {
        const existing = _bleedIndicators.get(defenderEl);
        if (existing.alive) return existing;
    }
    // Kill any zombie indicators still in the effects array
    effects.forEach(e => {
        if (e instanceof BleedStackIndicator && e.ownerEl === defenderEl) {
            e.alive = false;
        }
    });
    const indicator = new BleedStackIndicator(defenderEl);
    _bleedIndicators.set(defenderEl, indicator);
    effects.push(indicator);
    return indicator;
}

    // ─── Bleed VFX ───────────────────────────────────────────────────

    function playBloodletting(defenderEl, stackCount) {
        if (!canvas) return;

        const center = avatarCenter(defenderEl);
        const slashSize = 24;

        const slashes = stackCount >= 2
            ? [{ x1: -slashSize, y1: -slashSize, x2: slashSize, y2: slashSize },
               { x1: slashSize,  y1: -slashSize, x2: -slashSize, y2: slashSize }]
            : [{ x1: -slashSize, y1: -slashSize, x2: slashSize, y2: slashSize }];

        for (const slash of slashes) {
            effects.push(new SlashEffect(
                center.x + slash.x1, center.y + slash.y1,
                center.x + slash.x2, center.y + slash.y2,
                { color: '#f85149', duration: 350, lineWidth: 2.5 }
            ));
        }

        // droplets — owned here, not duplicated in playBleedApplied
        setTimeout(() => {
            const count = randInt(2, 3);
            for (let i = 0; i < count; i++) {
                spawnParticle({
                    x: center.x + rand(-12, 12),
                    y: center.y + rand(-8, 8),
                    vx: rand(-0.4, 0.4),
                    vy: rand(0.5, 1.5),
                    gravity: 0.06,
                    drag: 0.96,
                    size: rand(3, 5),
                    color: '#f85149',
                    glow: '#c0392b',
                    glowRadius: 6,
                    decay: 0.018,
                    shape: 'circle',
                });
            }
        }, 120);
    }

    // FIX: removed duplicate droplet loop — playBloodletting owns that
    function playBleedApplied(defenderEl, newStackCount) {
        if (!canvas) return;
        console.log('playBleedApplied called with stacks:', newStackCount);
        const indicator = getOrCreateBleedIndicator(defenderEl);
        indicator.setStacks(newStackCount);

        playBloodletting(defenderEl, newStackCount);

        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        effects.push(new RingEffect(center.x, center.y, {
            color: '#f85149',
            maxRadius: 28 + newStackCount * 4,
            duration: 300,
            lineWidth: 1.5,
        }));
    }

    function playBleedTick(defenderEl, totalDamage, stackCount) {
        if (!canvas) return;
        stackCount = parseInt(stackCount) || 0;
            console.log('playBleedTick stackCount:', stackCount);

        const anchor = getCombatAnchorCenter(defenderEl);
        const center = avatarCenter(defenderEl);

        const indicator = getOrCreateBleedIndicator(defenderEl);
         indicator.setStacks(stackCount);
        indicator.onTick();

        for (let i = 0; i < 2; i++) {
            spawnParticle({
                x: center.x + rand(-10, 10),
                y: center.y + rand(-6, 6),
                vx: rand(-0.3, 0.3),
                vy: rand(0.6, 1.8),
                gravity: 0.05, drag: 0.96,
                size: rand(2, 4),
                color: '#f85149', glow: '#f85149', glowRadius: 5,
                decay: 0.016, shape: 'circle',
            });
        }

const fontSize = totalDamage >= 20 ? 14 : totalDamage >= 10 ? 11 : 9;
const layout = getCombatTextLayout(defenderEl, anchor, 'dot');
effects.push(new FloatingTextEffect(
    layout.x + rand(-15, 15),  // ← random x offset
    layout.y - 32, { // dot numbers location
    text: `-${totalDamage}`,
    color: '#f87171',
    fontSize,
    duration: 900,
    delay: layout.delay,
    travelY: layout.travelY,
}));
    }

    function playBleedStackUpdate(defenderEl, newStackCount) {
        if (!canvas) return;

        const indicator = _bleedIndicators.get(defenderEl);
        if (!indicator) return;

        if (newStackCount <= 0) {
            indicator.setStacks(0);
            _bleedIndicators.delete(defenderEl);
        } else {
            indicator.setStacks(newStackCount);
        }
    }

    // ─── Effect Classes ──────────────────────────────────────────────

    // FIX: pulsePhase now ticks, fade-out added, ctx isolation fixed
    class BleedStackIndicator {
        constructor(ownerEl) {
            this.ownerEl = ownerEl;
            this.stacks = 0;
            this.alive = true;
            
            // Animation States
            this.scaleAnim = 1.0;
            this.textScaleAnim = 1.0;
            this.flashAlpha = 0;
            this.pulsePhase = 0;
            
            this.fadingOut = false;
            this.fadeElapsed = 0;
            this.fadeDuration = 250;
        }

        setStacks(n) {
            const prev = this.stacks;
            this.stacks = n;
            
            if (n <= 0) {
                this.fadingOut = true;
                this.fadeElapsed = 0;
                return;
            }
            this.fadingOut = false;
            
            // Kinetic feedback: Gain vs Lose
            if (n > prev) {
                this.scaleAnim = Math.min(this.scaleAnim + 0.3 + (n - prev) * 0.05, 1.4);
                this.textScaleAnim = 1.4; // Text pops aggressively
            } else if (n < prev) {
                // Subtle shrink
                this.scaleAnim = 0.85; 
            }
        }

        onTick() {
            // Damage Tick Event! Flash heavily, punch the text.
            this.flashAlpha = 1.0; 
            this.textScaleAnim = 1.35;
            this.scaleAnim = Math.max(this.scaleAnim, 1.15); // Slight plate bump
        }

        tick(dt) {
            this.elapsed += dt;
            
            // Non-linear decay physics
            this.scaleAnim = 1.0 + (this.scaleAnim - 1.0) * Math.exp(-dt * 0.015);
            this.textScaleAnim = 1.0 + (this.textScaleAnim - 1.0) * Math.exp(-dt * 0.02);
            this.flashAlpha *= Math.exp(-dt * 0.015);
            
            const throbSpeed = this.stacks >= 6 ? 0.01 : (this.stacks >= 3 ? 0.005 : 0.0);
            this.pulsePhase += dt * throbSpeed;

            if (this.fadingOut) {
                this.fadeElapsed += dt;
                if (this.fadeElapsed >= this.fadeDuration) this.alive = false;
            }
        }

        draw(ctx) {
            let x, y;
            const parent = this.ownerEl.closest('.fighter');
            if (parent) {
                const hpBar = parent.querySelector('.fighter-hp-bar');
                if (hpBar) {
                    const hpBarRect = hpBar.getBoundingClientRect();
                    const arenaRect = arena.getBoundingClientRect();
                    const isEnemy = this.ownerEl.id === 'enemyAvatar';
                    
                    x = hpBarRect.left - arenaRect.left + (isEnemy ? 110 : hpBarRect.width - 5);
                    y = hpBarRect.bottom - arenaRect.top + 10; 
                }
            }

            if (x === undefined) {
                const anchor = getCombatAnchorCenter(this.ownerEl);
                x = anchor.x + 20; y = anchor.y - 55;
            }

            const fadeAlpha = this.fadingOut ? Math.max(0, 1 - this.fadeElapsed / this.fadeDuration) : 1;
            if (fadeAlpha <= 0) return;

            const isHigh = this.stacks >= 6;
            const isMed = this.stacks >= 3;
            
            let dropTop, dropBot, textColor, borderColor, bgTop, bgBot;
            if (isHigh) {
                dropTop = '#fde047'; dropBot = '#b91c1c';
                textColor = '#fef08a';
                borderColor = '#991b1b';
                bgTop = 'rgba(40, 5, 5, 0.95)'; bgBot = 'rgba(15, 0, 0, 0.95)';
            } else if (isMed) {
                dropTop = '#fca5a5'; dropBot = '#dc2626';
                textColor = '#ffffff';
                borderColor = '#7f1d1d';
                bgTop = 'rgba(30, 8, 8, 0.9)'; bgBot = 'rgba(15, 4, 4, 0.9)';
            } else {
                dropTop = '#fecaca'; dropBot = '#ef4444';
                textColor = '#e5e5e5';
                borderColor = '#451a1a';
                bgTop = 'rgba(20, 8, 8, 0.85)'; bgBot = 'rgba(10, 5, 5, 0.85)';
            }

            const idleThrob = isHigh ? Math.sin(this.pulsePhase) * 0.05 : 0;
            const finalScale = (this.scaleAnim + idleThrob) * (this.fadingOut ? fadeAlpha : 1);

            ctx.save();
            ctx.translate(x, y);
            ctx.scale(finalScale, finalScale);
            ctx.globalAlpha = fadeAlpha;

            const textStr = `×${this.stacks}`;
            ctx.font = 'bold 11px sans-serif'; 
            const textW = ctx.measureText(textStr).width;
            
            // Box size
            const padX = 4, padY = 2, gap = 2;
            const dropW = 10, dropH = 12;
            // box size end
            
            const totalH = padY * 2 + dropH;
            const totalW = padX * 2 + dropW + gap + textW;
            const radius = totalH / 2;
            const cx = -totalW / 2;
            const cy = -totalH / 2;

            function drawPillPath(context) {
                context.beginPath();
                context.arc(cx + radius, cy + radius, radius, Math.PI / 2, Math.PI * 1.5);
                context.lineTo(cx + totalW - radius, cy);
                context.arc(cx + totalW - radius, cy + radius, radius, Math.PI * 1.5, Math.PI / 2);
                context.closePath();
            }

            drawPillPath(ctx);
            const bgGrad = ctx.createLinearGradient(0, cy, 0, cy + totalH);
            bgGrad.addColorStop(0, bgTop);
            bgGrad.addColorStop(1, bgBot);
            ctx.fillStyle = bgGrad;
            ctx.fill();
            
            ctx.lineWidth = 1;
            ctx.strokeStyle = borderColor;
            ctx.stroke();

            ctx.save();
            ctx.translate(cx + padX + (dropW / 2), 0);
            ctx.scale(0.5, 0.5); // size of drop
            
            const dropGrad = ctx.createLinearGradient(0, -6, 0, 6);
            dropGrad.addColorStop(0, dropTop);
            dropGrad.addColorStop(1, dropBot);

            ctx.fillStyle = dropGrad;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 2; 
            ctx.shadowOffsetY = 1;

            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.bezierCurveTo(4, -1, 5, 2, 5, 4);
            ctx.arc(0, 4, 5, 0, Math.PI);
            ctx.bezierCurveTo(-5, 2, -4, -1, 0, -5);
            ctx.fill();
            
            if (this.flashAlpha > 0.01) {
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fill();
            }
            ctx.restore();

            ctx.save();
            ctx.translate(cx + padX + dropW + gap, 1.2);
            ctx.scale(this.textScaleAnim, this.textScaleAnim);
            
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.font = 'bold 8px sans-serif';
            
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;

            ctx.fillStyle = textColor;
            // Use real multiplication sign × instead of x
            ctx.fillText(textStr, 0, 0);
            
            if (this.flashAlpha > 0.01) {
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillText(textStr, 0, 0);
            }
            ctx.restore();

            ctx.restore(); // Undo Main Plate Transform
        }
    }

    class RingEffect {
        constructor(x, y, opts = {}) {
            this.x = x;
            this.y = y;
            this.color = opts.color || '#fff';
            this.maxRadius = opts.maxRadius || 50;
            this.duration = opts.duration || 300;
            this.lineWidth = opts.lineWidth || 2;
            this.delay = opts.delay || 0;
            this.elapsed = -this.delay;
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            if (this.elapsed < 0) return;
            const t = Math.min(1, this.elapsed / this.duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const radius = eased * this.maxRadius;
            const alpha = (1 - t) * 0.85;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.lineWidth;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    class GhostSlide {
        constructor(from, to, opts = {}) {
            this.from = from;
            this.to = to;
            this.emoji = opts.emoji || '👾';
            this.duration = opts.duration || 240;
            this.color = opts.color || 'rgba(57,210,192,0.5)';
            this.elapsed = 0;
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed >= this.duration) this.alive = false;
        }
        draw(ctx) {
            const t = Math.min(1, this.elapsed / this.duration);
            const eased = t < 0.5
                ? 2 * t * t
                : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const x = this.from.x + (this.to.x - this.from.x) * eased;
            const y = this.from.y + (this.to.y - this.from.y) * eased;
            const alpha = t < 0.8 ? 0.65 : (1 - t) / 0.2 * 0.65;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = '#39d2c0';
            ctx.shadowBlur = 18;
            ctx.font = '2rem sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.emoji, x, y);
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(x, y, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    class SlashEffect {
        constructor(x1, y1, x2, y2, opts = {}) {
            this.x1 = x1; this.y1 = y1;
            this.x2 = x2; this.y2 = y2;
            this.color = opts.color || '#fff';
            this.duration = opts.duration || 300;
            this.lineWidth = opts.lineWidth || 2;
            this.elapsed = 0;
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            const t = Math.min(1, this.elapsed / this.duration);
            const drawProgress = Math.min(1, t * 2);
            const alpha = t < 0.5 ? 1 : 1 - ((t - 0.5) * 2);

            const cx = this.x1 + (this.x2 - this.x1) * drawProgress;
            const cy = this.y1 + (this.y2 - this.y1) * drawProgress;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.lineWidth;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x1, this.y1);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.restore();
        }
    }

    class MagicBoltEffect {
        constructor(from, to, opts = {}) {
            this.from = from;
            this.to = to;
            this.color = opts.color || '#8000ff';
            this.duration = opts.duration || 400;
            this.wobble = opts.wobble || 4;
            this.onImpact = opts.onImpact;
            this.elapsed = 0;
            this.alive = true;
            this.hasImpacted = false;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed >= this.duration) {
                this.alive = false;
                if (this.onImpact && !this.hasImpacted) {
                    this.hasImpacted = true;
                    this.onImpact();
                }
            }

            if (this.alive && Math.random() < 0.7) {
                const t = this.elapsed / this.duration;
                const x = this.from.x + (this.to.x - this.from.x) * t;
                const y = this.from.y + (this.to.y - this.from.y) * t;
                spawnParticle({
                    x, y,
                    vx: rand(-1, 1), vy: rand(-1, 1),
                    gravity: 0, drag: 0.95, size: rand(2, 5),
                    color: this.color, glow: this.color, glowRadius: 8, decay: 0.06
                });
            }
        }
        draw(ctx) {
            const t = Math.min(1, this.elapsed / this.duration);
            const baseX = this.from.x + (this.to.x - this.from.x) * t;
            const baseY = this.from.y + (this.to.y - this.from.y) * t;

            const dx = this.to.x - this.from.x;
            const dy = this.to.y - this.from.y;
            const dist = Math.hypot(dx, dy) || 1;
            const px = -dy / dist;
            const py = dx / dist;

            const envelope = Math.sin(t * Math.PI);
            const wave = Math.sin(t * Math.PI * 4) * this.wobble * envelope;

            const x = baseX + px * wave;
            const y = baseY + py * wave;

            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    class FloatingTextEffect {
        constructor(x, y, opts = {}) {
            this.x = x;
            this.y = y;
            this.text = opts.text || '';
            this.color = opts.color || '#fff';
            this.duration = opts.duration || 600;
            this.fontSize = opts.fontSize || 16;
            this.travelY = opts.travelY !== undefined ? opts.travelY : 30;
            this.elapsed = -(opts.delay || 0);
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            if (this.elapsed < 0) return;
            const t = Math.min(1, this.elapsed / this.duration);
            const alpha = t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4);
            const yOffset = this.y - t * this.travelY;

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = `bold ${this.fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(this.text, this.x, yOffset);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 6;
            ctx.fillText(this.text, this.x, yOffset);
            ctx.restore();
        }
    }

    class ScaledFloatingTextEffect {
        constructor(x, y, opts = {}) {
            this.x = x;
            this.y = y;
            this.text = opts.text || '';
            this.color = opts.color || '#fff';
            this.duration = opts.duration || 600;
            this.fontSize = opts.fontSize || 16;
            this.popScale = opts.popScale || 1;
            this.travelY = opts.travelY !== undefined ? opts.travelY : 28;
            this.elapsed = -(opts.delay || 0);
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            if (this.elapsed < 0) return;
            const t = Math.min(1, this.elapsed / this.duration);
            const alpha = t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4);
            const yOffset = this.y - t * this.travelY;

            const scalePop = t < 0.15
                ? 1 + (this.popScale - 1) * (t / 0.15)
                : 1 + (this.popScale - 1) * (1 - (t - 0.15) / 0.35);
            const scale = Math.max(1, scalePop);

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.translate(this.x, yOffset);
            ctx.scale(scale, scale);
            ctx.font = `bold ${this.fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(this.text, 0, 0);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.fillText(this.text, 0, 0);
            ctx.restore();
        }
    }

    class IronWillAuraEffect {
        constructor(ownerEl, intensity) {
            this.ownerEl = ownerEl;
            this.intensity = intensity;
            this.elapsed = 0;
            this.duration = 1200 + intensity * 600;
            this.pulsePhase = 0;
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            this.pulsePhase += dt * 0.004;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            if (!arena) return;
            const arenaRect = arena.getBoundingClientRect();
            const elRect = this.ownerEl.getBoundingClientRect();
            const cx = elRect.left - arenaRect.left + elRect.width / 2;
            const cy = elRect.top - arenaRect.top + elRect.height / 2;

            const t = Math.min(1, this.elapsed / this.duration);
            const fadeOut = t > 0.75 ? 1 - ((t - 0.75) / 0.25) : 1;
            const pulse = 0.6 + Math.sin(this.pulsePhase) * 0.4;
            const color = this.intensity >= 0.85 ? '#dc2626' : '#f97316';

            ctx.save();
            ctx.globalAlpha = (0.15 + this.intensity * 0.25) * pulse * fadeOut;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 + this.intensity * 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12 + this.intensity * 16;
            ctx.beginPath();
            ctx.arc(cx, cy, 30 + this.intensity * 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    class SweepRingEffect {
        constructor(x, y, opts = {}) {
            this.x = x;
            this.y = y;
            this.color = opts.color || '#a78bfa';
            this.maxRadius = opts.maxRadius || 50;
            this.duration = opts.duration || 400;
            this.lineWidth = opts.lineWidth || 2.5;
            this.elapsed = 0;
            this.alive = true;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) this.alive = false;
        }
        draw(ctx) {
            const t = Math.min(1, this.elapsed / this.duration);
            const eased = 1 - Math.pow(1 - t, 2);
            const endAngle = eased * Math.PI * 2 - Math.PI / 2;
            const alpha = t < 0.7 ? 0.9 : (1 - t) / 0.3 * 0.9;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.lineWidth;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.maxRadius, -Math.PI / 2, endAngle);
            ctx.stroke();
            ctx.restore();
        }
    }

    class FallingShardEffect {
        constructor(x, startY, targetY, opts = {}) {
            this.x = x;
            this.y = startY;
            this.targetY = targetY;
            this.vx = opts.vx || rand(-0.5, 0.5);
            this.vy = opts.vy || rand(8, 14);
            this.gravity = 0.18;
            this.width = opts.width || rand(3, 6);
            this.height = opts.height || rand(10, 18);
            this.rotation = opts.rotation || rand(-0.3, 0.3);
            this.rotationSpeed = rand(-0.02, 0.02);
            this.color = opts.color || '#93c5fd';
            this.glow = opts.glow || '#bfdbfe';
            this.elapsed = 0;
            this.duration = opts.duration || 600;
            this.alive = true;
            this.landed = false;
            this.onLand = opts.onLand || null;
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed > this.duration) { this.alive = false; return; }

            if (!this.landed) {
                this.vy += this.gravity;
                this.x += this.vx;
                this.y += this.vy;
                this.rotation += this.rotationSpeed;

                if (this.y >= this.targetY) {
                    this.y = this.targetY;
                    this.landed = true;
                    if (this.onLand) this.onLand(this.x, this.y);
                }
            }
        }
        draw(ctx) {
            const t = Math.min(1, this.elapsed / this.duration);
            const alpha = this.landed ? Math.max(0, 1 - ((t - 0.6) / 0.4)) : 1;

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.shadowColor = this.glow;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(0, -this.height / 2);
            ctx.lineTo(this.width / 2, 0);
            ctx.lineTo(0, this.height / 2);
            ctx.lineTo(-this.width / 2, 0);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, -this.height / 2 + 2);
            ctx.lineTo(this.width / 4, 0);
            ctx.lineTo(0, this.height / 4);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fill();
            ctx.restore();
        }
    }

    class FrozenAuraEffect {
        constructor(ownerEl) {
            this.ownerEl = ownerEl;
            this.elapsed = 0;
            this.duration = Infinity;
            this.pulsePhase = 0;
            this.alive = true;
        }
        triggerPulse() { this.pulsePhase += Math.PI * 0.8; }
        kill() {
            this.alive = false;
            if (this.ownerEl) this.ownerEl._frozenAura = null;
        }
        tick(dt) {
            this.elapsed += dt;
            this.pulsePhase += dt * 0.004;
        }
        draw(ctx) {
            if (!arena) return;
            const arenaRect = arena.getBoundingClientRect();
            const elRect = this.ownerEl.getBoundingClientRect();
            const cx = elRect.left - arenaRect.left + elRect.width / 2;
            const cy = elRect.top - arenaRect.top + elRect.height / 2;

            const pulse = 0.5 + Math.sin(this.pulsePhase) * 0.5;

            ctx.save();
            ctx.globalAlpha = Math.max(0, 0.20 + pulse * 0.20);
            ctx.strokeStyle = '#93c5fd';
            ctx.lineWidth = 2 + pulse * 1.5;
            ctx.shadowColor = '#bfdbfe';
            ctx.shadowBlur = 12 + pulse * 8;
            ctx.beginPath();
            ctx.arc(cx, cy, 34 + pulse * 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    class BerserkerAuraEffect {
        constructor(ownerEl, stacks, maxStacks) {
            this.ownerEl = ownerEl;
            this.stacks = stacks;
            this.maxStacks = maxStacks;
            this.targetIntensity = stacks / maxStacks;
            this.displayIntensity = stacks / maxStacks;
            this.elapsed = 0;
            this.pulsePhase = 0;
            this.alive = true;
            this.fadingOut = false;
            this.fadeElapsed = 0;
            this.fadeDuration = 400;
            this._cx = 0;
            this._cy = 0;
            this._posReady = false;
            this._pressure = 0;
            this._pressureRate = 0.6 + Math.random() * 0.4;
            this._pressureThresh = 40 + Math.random() * 30;
            this._burstPressure = 0;
            this._burstThresh = 70 + Math.random() * 40;
            this._burstCooldown = 0;
            this._doubleTapTimer = 0;
            this._cooloffTimer = 0;
            this._dustTimer = 0;
            this._dustInterval = 180 + Math.random() * 120;
            this._updateCenter();
        }

        _updateCenter() {
            if (!arena || !this.ownerEl) return;
            const arenaRect = arena.getBoundingClientRect();
            const elRect = this.ownerEl.getBoundingClientRect();
            const relX = elRect.left - arenaRect.left;
            const relY = elRect.top - arenaRect.top;
            this._cx = relX + (elRect.width * 0.48);
            this._cy = relY + (elRect.height * 0.40);
            this._posReady = true;
        }

        update(stacks, maxStacks) {
            this.stacks = stacks;
            this.maxStacks = maxStacks;
            this.targetIntensity = stacks / maxStacks;
            if (stacks <= 0) {
                this._startFade();
            } else if (this.fadingOut) {
                this.fadingOut = false;
                this.fadeElapsed = 0;
            }
        }

        _startFade() {
            if (this.fadingOut) return;
            this.fadingOut = true;
            this.fadeElapsed = 0;
        }

        kill() {
            this.alive = false;
            if (this.ownerEl) this.ownerEl._berserkerAura = null;
        }

        tick(dt) {
            this._updateCenter();

            if (this.fadingOut) {
                this.fadeElapsed += dt;
                this.pulsePhase += dt * 0.006;
                if (this.fadeElapsed >= this.fadeDuration) this.kill();
                return;
            }

            this.elapsed += dt;
            this.pulsePhase += dt * 0.006;

            const diff = this.targetIntensity - this.displayIntensity;
            this.displayIntensity += diff * Math.min(dt * 0.008, 0.15);
            const intensity = this.displayIntensity;

            if (this._burstCooldown > 0) this._burstCooldown -= dt;
            if (this._doubleTapTimer > 0) this._doubleTapTimer -= dt;
            if (this._cooloffTimer > 0) this._cooloffTimer -= dt;

            const emberPressureMult = this._cooloffTimer > 0 ? 0.7 : 1.0;
            this._pressureRate = (0.5 + intensity * 1.2 + Math.random() * 0.3) * emberPressureMult;
            this._pressure += this._pressureRate * dt;

            if (this._pressure >= this._pressureThresh) {
                this._pressure = 0;
                this._pressureThresh = (30 + Math.random() * 45) * (1 - intensity * 0.35);
            }

            if (this.stacks >= 3) {
                const burstPressureMult = this._cooloffTimer > 0 ? 0.55 : 1.0;
                this._burstPressure += (0.4 + intensity * 0.9 + Math.random() * 0.25) * dt * burstPressureMult;

                if (this._doubleTapTimer > -dt && this._doubleTapTimer <= 0 && this._burstCooldown <= 0) {
                    this._emitBurst();
                    this._burstCooldown = this.stacks >= this.maxStacks ? 140 + Math.random() * 120 : 80 + Math.random() * 70;
                    this._cooloffTimer = 120 + Math.random() * 80;
                    this._doubleTapTimer = 0;
                }

                if (this._burstPressure >= this._burstThresh && this._burstCooldown <= 0) {
                    this._burstPressure = 0;
                    this._burstThresh = (60 + Math.random() * 70) * (1 - intensity * 0.22);
                    this._emitBurst();
                    this._burstCooldown = this.stacks >= this.maxStacks ? 150 + Math.random() * 140 : 90 + Math.random() * 90;
                    this._cooloffTimer = 140 + Math.random() * 100;
                    this._doubleTapTimer = Math.random() < (0.12 + intensity * 0.10)
                        ? 40 + Math.random() * 55
                        : 0;
                }
            } else {
                this._burstPressure = 0;
                this._burstCooldown = 0;
                this._doubleTapTimer = 0;
                this._cooloffTimer = 0;
            }

            this._dustTimer += dt;
            if (this._dustTimer >= this._dustInterval) {
                this._dustTimer = 0;
                this._dustInterval = 150 + Math.random() * 220;
                if (intensity > 0.18 && this._cooloffTimer <= 0) this._emitDust();
            }
        }

        _emitEmber() { return; }
        _emitBurst() { return; }
        _emitDust()  { return; }

        draw(ctx) {
            if (!this._posReady) return;

            const fadeAlpha = this.fadingOut
                ? Math.max(0, 1 - this.fadeElapsed / this.fadeDuration)
                : 1;
            if (fadeAlpha <= 0) return;

            const cx = this._cx;
            const cy = this._cy;
            const intensity = this.displayIntensity;
            const stacks = this.stacks;
            const pulse = 0.78 + Math.sin(this.pulsePhase) * 0.18;
            const baseRadiusX = 38 + intensity * 25;
            const baseRadiusY = 52 + intensity * 35;

            ctx.save();
            ctx.globalAlpha = pulse * fadeAlpha * 0.9;

            ctx.beginPath();
            const blobSteps = 12;
            for (let i = 0; i <= blobSteps; i++) {
                const a = (i / blobSteps) * Math.PI * 2;
                const verticalBias = Math.max(0, Math.sin(a));
                const spike = Math.pow(verticalBias, 2.6) * (8 + intensity * 14);
                const turbulence =
                    Math.sin(a * 6 + this.pulsePhase * 2.2) * (1.5 + intensity * 2.5) +
                    Math.sin(a * 11 - this.pulsePhase * 1.7) * (1 + intensity * 2);
                const wobble = spike + turbulence;
                const x = cx + Math.cos(a) * (baseRadiusX + wobble);
                const y = cy + Math.sin(a) * (baseRadiusY + wobble * 1.2) - (2 + intensity * 4);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.clip();

            const gradient = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, baseRadiusY + 10);
            gradient.addColorStop(0,   `rgba(255,255,255,${0.18 * fadeAlpha})`);
            gradient.addColorStop(0.2, `rgba(255,120,60,${0.35 * fadeAlpha})`);
            gradient.addColorStop(0.5, `rgba(220,38,38,${0.25 * fadeAlpha})`);
            gradient.addColorStop(1,   `rgba(120,0,0,0)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(cx - baseRadiusX - 16, cy - baseRadiusY - 18, (baseRadiusX + 16) * 2, (baseRadiusY + 18) * 2);
            ctx.restore();

            if (stacks >= 3) {
                const flameCount = 2 + Math.floor(intensity * 2);
                for (let i = 0; i < flameCount; i++) {
                    const offsetX = rand(-14, 14);
                    const startY = cy + 10 + rand(-2, 8);
                    const height = 16 + intensity * 20 + rand(-3, 4);
                    const sway = Math.sin(this.pulsePhase * 3.4 + i * 1.7) * (2.5 + intensity * 1.8);

                    ctx.save();
                    ctx.globalAlpha = (0.16 + intensity * 0.20) * fadeAlpha;
                    const grad = ctx.createLinearGradient(cx + offsetX, startY, cx + offsetX + sway, startY - height);
                    grad.addColorStop(0,   '#991b1b');
                    grad.addColorStop(0.45,'#dc2626');
                    grad.addColorStop(0.8, '#f97316');
                    grad.addColorStop(1,   'rgba(251,191,36,0)');
                    ctx.strokeStyle = grad;
                    ctx.lineWidth = 2.2 + intensity * 1.1;
                    ctx.shadowColor = '#dc2626';
                    ctx.shadowBlur = 8 + intensity * 8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(cx + offsetX, startY);
                    ctx.quadraticCurveTo(cx + offsetX + sway * 0.6, startY - height * 0.45, cx + offsetX + sway, startY - height);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            if (stacks >= 5) {
                const instability = Math.sin(this.pulsePhase * 3.2);
                const tendrilCount = 1 + Math.floor(intensity * 2);
                for (let i = 0; i < tendrilCount; i++) {
                    const baseAngle = -Math.PI / 2 + rand(-0.9, 0.9);
                    const a = baseAngle + instability * 0.12;
                    const innerR = 12 + rand(0, 4);
                    const outerR = 22 + rand(0, 10) + intensity * 8;
                    const midR = (innerR + outerR) * 0.5;
                    const midKink = rand(-5, 5);
                    const x0 = cx + Math.cos(a) * innerR;
                    const y0 = cy + Math.sin(a) * innerR;
                    const xm = cx + Math.cos(a + 0.18) * midR + midKink;
                    const ym = cy + Math.sin(a + 0.18) * midR + midKink * 0.5;
                    const x1 = cx + Math.cos(a - 0.1) * outerR;
                    const y1 = cy + Math.sin(a - 0.1) * outerR;

                    ctx.save();
                    ctx.globalAlpha = (0.16 + Math.abs(instability) * 0.10) * fadeAlpha;
                    const tGrad = ctx.createLinearGradient(x0, y0, x1, y1);
                    tGrad.addColorStop(0,    '#f97316');
                    tGrad.addColorStop(0.55, '#dc2626');
                    tGrad.addColorStop(1,    'rgba(153,27,27,0)');
                    ctx.strokeStyle = tGrad;
                    ctx.lineWidth = 1.0 + intensity * 0.6;
                    ctx.shadowColor = '#dc2626';
                    ctx.shadowBlur = 6 + intensity * 5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.quadraticCurveTo(xm, ym, x1, y1);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    }

    class RealityFractureEffect {
        constructor(x, y, intensity = 1.0) {
            this.x = x;
            this.y = y;
            this.intensity = clamp(intensity, 0.6, 1.4);
            this.elapsed = 0;
            this.duration = 280;
            this.alive = true;
            this.tearHeight = 52 + intensity * 24;
            this.tearAngle = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.10);
            this.wobbleSeed = Math.random() * 100;
            this.cracks = [];
            const crackCount = Math.random() < 0.5 ? 2 : 3;
            for (let i = 0; i < crackCount; i++) {
                const sign = i % 2 === 0 ? 1 : -1;
                this.cracks.push({
                    angle: sign * (0.3 + Math.random() * 0.5),
                    length: 14 + Math.random() * 18,
                    offset: (Math.random() - 0.5) * this.tearHeight * 0.4,
                });
            }
        }
        tick(dt) {
            this.elapsed += dt;
            if (this.elapsed >= this.duration) this.alive = false;
        }
        draw(ctx) {
            const t = this.elapsed;
            const { x, y, intensity, tearHeight, tearAngle, wobbleSeed } = this;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(tearAngle);

            if (t < 60) {
                const p = t / 60;
                const wobble = Math.sin(t * 0.3 + wobbleSeed) * 3 * p;
                ctx.save();
                ctx.globalAlpha = 0.14 + p * 0.12;
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.ellipse(wobble, 0, 5 + p * 8, tearHeight * 0.42 * p, 0, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = -2; i <= 2; i++) {
                    const xShift = Math.sin(t * 0.05 + i) * 2 * p;
                    ctx.beginPath();
                    ctx.moveTo(-8 + xShift, i * 6);
                    ctx.lineTo(8 + xShift, i * 6);
                    ctx.stroke();
                }
                ctx.restore();
            }

            if (t >= 60 && t < 180) {
                const p = clamp((t - 60) / 80, 0, 1);
                const eased = 1 - Math.pow(1 - p, 2);
                this._drawTear(ctx, tearHeight * 0.5 * eased, (4 + intensity * 4) * eased, eased, t);
            }

            if (t >= 140 && t < 180) {
                const p = clamp((t - 140) / 40, 0, 1);
                const burstEased = Math.sin(p * Math.PI);
                const halfH = tearHeight * 0.5;
                const tearWidth = (4 + intensity * 4) + burstEased * intensity * 8;
                this._drawTear(ctx, halfH, tearWidth, 1.0, t);
                this._drawCracks(ctx, burstEased);
                ctx.save();
                ctx.globalAlpha = burstEased * 0.9;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(0, -halfH * 0.95);
                ctx.lineTo(0,  halfH * 0.95);
                ctx.stroke();
                ctx.restore();
            }

            if (t >= 180) {
                const p = clamp((t - 180) / 100, 0, 1);
                const eased = Math.pow(p, 1.6);
                const alpha = 1 - eased;
                const halfH = tearHeight * 0.5 * (1 - eased * 0.85);
                const tearWidth = (2 + intensity * 2) * (1 - eased);
                if (alpha > 0.02) {
                    ctx.globalAlpha = alpha;
                    this._drawTear(ctx, halfH, tearWidth, alpha, t);
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.25;
                    ctx.strokeStyle = '#a855f7';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, tearWidth * 0.5 + eased * 12, 3 + eased * 6, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            ctx.restore();
        }

        _drawTear(ctx, halfH, tearWidth, alpha, t) {
            if (tearWidth < 0.2 || halfH < 0.5) return;
            const { wobbleSeed, intensity } = this;
            const caOffset = 1.2;

            ctx.save();
            ctx.globalAlpha = alpha * 0.35;
            ctx.translate(-caOffset, 0);
            this._drawTearShape(ctx, halfH, tearWidth * 0.85, '#818cf8', t, wobbleSeed);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha * 0.35;
            ctx.translate(caOffset, 0);
            this._drawTearShape(ctx, halfH, tearWidth * 0.85, '#e879f9', t, wobbleSeed + 50);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha;
            this._drawTearShape(ctx, halfH, tearWidth, null, t, wobbleSeed);
            ctx.restore();
        }

        _drawTearShape(ctx, halfH, tearWidth, colorOverride, t, seed) {
            const steps = 14;
            const stepH = (halfH * 2) / steps;
            const leftPoints = [];
            const rightPoints = [];

            for (let i = 0; i <= steps; i++) {
                const norm = (i / steps) * 2 - 1;
                const profile = 1 - norm * norm;
                const wobble = Math.sin(t * 0.018 + i * 0.9 + seed) * 0.6 * profile;
                const halfW = tearWidth * 0.5 * profile;
                const yPos = -halfH + i * stepH;
                leftPoints.push({ x: -halfW + wobble, y: yPos });
                rightPoints.push({ x:  halfW + wobble, y: yPos });
            }

            ctx.beginPath();
            ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
            for (let i = 1; i < leftPoints.length; i++) ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
            for (let i = rightPoints.length - 1; i >= 0; i--) ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
            ctx.closePath();

            if (!colorOverride) {
                const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
                grad.addColorStop(0,   'rgba(0,0,0,0)');
                grad.addColorStop(0.2, 'rgba(139,92,246,0.9)');
                grad.addColorStop(0.5, 'rgba(255,255,255,1)');
                grad.addColorStop(0.8, 'rgba(6,182,212,0.9)');
                grad.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = colorOverride;
            }
            ctx.fill();

            if (!colorOverride) {
                ctx.strokeStyle = 'rgba(224,231,255,0.9)';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }

        _drawCracks(ctx, burstEased) {
            ctx.save();
            ctx.globalAlpha = burstEased * 0.85;
            ctx.strokeStyle = '#e0e7ff';
            ctx.lineWidth = 1.1;
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 6;
            for (const crack of this.cracks) {
                const ex = Math.cos(crack.angle) * crack.length * burstEased;
                const ey = Math.sin(crack.angle) * crack.length * burstEased;
                ctx.beginPath();
                ctx.moveTo(0, crack.offset);
                ctx.lineTo(ex * 0.5 + (Math.random() - 0.5) * 2, crack.offset + ey * 0.5 + (Math.random() - 0.5) * 2);
                ctx.lineTo(ex, crack.offset + ey);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // ─── VFX Functions ───────────────────────────────────────────────

    function playEchoStrike(attackerEl, defenderEl) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(defenderEl);

        function spawnSpeedLines(ox, oy, tx, ty, count) {
            const angle = Math.atan2(ty - oy, tx - ox);
            for (let i = 0; i < count; i++) {
                const a = angle + rand(-0.3, 0.3);
                spawnParticle({
                    x: ox + rand(-10, 10), y: oy + rand(-10, 10),
                    vx: Math.cos(a) * rand(6, 14), vy: Math.sin(a) * rand(6, 14),
                    gravity: 0, drag: 0.78, size: rand(1.5, 3),
                    color: randChoice(['#ffffff', '#e6edf3', '#58a6ff']),
                    glow: '#58a6ff', glowRadius: 6, decay: 0.07, shape: 'circle',
                });
            }
        }

        function spawnImpactSparks(tx, ty, c1, c2) {
            for (let i = 0; i < 20; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: tx, y: ty,
                    vx: Math.cos(angle) * rand(2, 7), vy: Math.sin(angle) * rand(2, 7),
                    gravity: 0.06, drag: 0.9, size: rand(1.5, 4),
                    color: randChoice([c1, c2, '#ffffff']), glow: c1, glowRadius: 8, decay: 0.055, shape: 'circle',
                });
            }
        }

        spawnSpeedLines(from.x, from.y, to.x, to.y, 18);
        attackerEl.classList.remove('attack-lunge'); void attackerEl.offsetHeight; attackerEl.classList.add('attack-lunge');

        setTimeout(() => {
            effects.push(new RingEffect(to.x, to.y, { color: '#58a6ff', maxRadius: 36, duration: 140, lineWidth: 2 }));
            spawnImpactSparks(to.x, to.y, '#58a6ff', '#ffffff');
            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
        }, 100);

        setTimeout(() => {
            effects.push(new RingEffect(from.x, from.y, { color: '#ffffff', maxRadius: 44, duration: 150, lineWidth: 3 }));
            spawnSpeedLines(from.x, from.y, to.x, to.y, 26);
            attackerEl.classList.remove('attack-lunge'); void attackerEl.offsetHeight; attackerEl.classList.add('attack-lunge');
        }, 220);

        setTimeout(() => {
            effects.push(new RingEffect(to.x, to.y, { color: '#ffffff', maxRadius: 55, duration: 170, lineWidth: 3 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#58a6ff', maxRadius: 42, duration: 220, delay: 40, lineWidth: 1.5 }));
            spawnImpactSparks(to.x, to.y, '#58a6ff', '#39d2c0');
            defenderEl.classList.remove('echo-hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('echo-hit-flash');
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
            arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
        }, 320);
    }

    function playDoubleStrike(attackerEl, defenderEl) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(defenderEl);

        function spawnSpeedLines(ox, oy, tx, ty, count, colors) {
            const angle = Math.atan2(ty - oy, tx - ox);
            for (let i = 0; i < count; i++) {
                spawnParticle({
                    x: ox + rand(-8, 8), y: oy + rand(-8, 8),
                    vx: Math.cos(angle + rand(-0.25, 0.25)) * rand(5, 11),
                    vy: Math.sin(angle + rand(-0.25, 0.25)) * rand(5, 11),
                    gravity: 0, drag: 0.76, size: rand(1.5, 2.5),
                    color: randChoice(colors), glow: colors[0], glowRadius: 5, decay: 0.08, shape: 'circle',
                });
            }
        }

        function spawnImpactSparks(tx, ty, colors, count) {
            for (let i = 0; i < count; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: tx, y: ty,
                    vx: Math.cos(angle) * rand(2, 6.5), vy: Math.sin(angle) * rand(2, 6.5),
                    gravity: 0.07, drag: 0.91, size: rand(1.5, 3.5),
                    color: randChoice(colors), glow: colors[0], glowRadius: 8, decay: 0.06, shape: 'circle',
                });
            }
        }

        effects.push(new RingEffect(from.x + (to.x - from.x) * 0.5, from.y + (to.y - from.y) * 0.5,
            { color: '#58d2ff', maxRadius: 22, duration: 280, lineWidth: 1 }));

        spawnSpeedLines(from.x, from.y, to.x, to.y, 14, ['#58d2ff', '#a0e8ff', '#ffffff']);
        attackerEl.classList.remove('attack-lunge'); void attackerEl.offsetHeight; attackerEl.classList.add('attack-lunge');

        setTimeout(() => {
            effects.push(new RingEffect(to.x, to.y, { color: '#58d2ff', maxRadius: 30, duration: 130, lineWidth: 1.8 }));
            spawnImpactSparks(to.x, to.y, ['#58d2ff', '#ffffff', '#a0e8ff'], 12);
            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
        }, 100);

        setTimeout(() => {
            effects.push(new RingEffect(from.x + (to.x - from.x) * 0.72, from.y + (to.y - from.y) * 0.72,
                { color: '#58d2ff', maxRadius: 18, duration: 200, lineWidth: 0.8 }));
            spawnSpeedLines(from.x, from.y, to.x, to.y, 18, ['#58d2ff', '#fbbf24', '#ffffff']);
            attackerEl.classList.remove('attack-lunge'); void attackerEl.offsetHeight; attackerEl.classList.add('attack-lunge');
        }, 190);

        setTimeout(() => {
            effects.push(new RingEffect(to.x, to.y, { color: '#fbbf24', maxRadius: 38, duration: 160, lineWidth: 2 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#58d2ff', maxRadius: 28, duration: 190, delay: 30, lineWidth: 1.2 }));
            spawnImpactSparks(to.x, to.y, ['#fbbf24', '#58d2ff', '#ffffff'], 18);
            defenderEl.classList.remove('echo-hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('echo-hit-flash');
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
        }, 290);
    }

    function playCorrosiveTouch(defenderEl) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);

        effects.push(new RingEffect(center.x, center.y, { color: '#bc8cff', maxRadius: 48, duration: 500, lineWidth: 2 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#7c3aed', maxRadius: 36, duration: 600, delay: 100, lineWidth: 1.5 }));

        for (let i = 0; i < 22; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: center.x + rand(-8, 8), y: center.y + rand(-8, 8),
                vx: Math.cos(angle) * rand(1.5, 5), vy: Math.sin(angle) * rand(1.5, 5) + rand(0.5, 1.5),
                gravity: 0.08, drag: 0.92, size: rand(2, 6),
                color: randChoice(['#bc8cff', '#7c3aed', '#39d2c0']), glow: '#bc8cff', glowRadius: 10, decay: 0.022, shape: 'circle',
            });
        }

        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                spawnParticle({
                    x: center.x + rand(-14, 14), y: center.y + rand(-6, 6),
                    vx: rand(-0.2, 0.2), vy: rand(0.8, 1.8),
                    gravity: 0.05, drag: 0.97, size: rand(3, 5),
                    color: randChoice(['#bc8cff', '#7c3aed']), glow: '#bc8cff', glowRadius: 8, decay: 0.014, shape: 'circle',
                });
            }
        }, 200);
    }

    function playTimeWarp(attackerEl) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);

        effects.push(new SweepRingEffect(from.x, from.y, { color: '#a78bfa', maxRadius: 50, duration: 400 }));
        effects.push(new RingEffect(from.x, from.y, { color: '#fbbf24', maxRadius: 65, duration: 350, delay: 80, lineWidth: 2 }));

        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            spawnParticle({
                x: from.x, y: from.y,
                vx: Math.cos(angle) * rand(2, 5), vy: Math.sin(angle) * rand(2, 5),
                gravity: -0.03, drag: 0.91, size: rand(2, 4),
                color: randChoice(['#a78bfa', '#fbbf24', '#ffffff']), glow: '#a78bfa', glowRadius: 10, decay: 0.03, shape: 'circle',
            });
        }

        arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
    }

    function playMagicBolt(attackerEl, defenderEl, color = '#8000ff') {
        if (!canvas) return;

        const base = avatarCenter(attackerEl);
        const from = { x: base.x - 40, y: base.y - 40 };
        const baseTarget = avatarCenter(defenderEl);
        const to = { x: baseTarget.x + rand(-16, 16), y: baseTarget.y + rand(-28, 14) };

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist, ny = dy / dist;
        const px = -ny, py = nx;
        const baseAngle = Math.atan2(dy, dx);

        effects.push(new RingEffect(from.x, from.y, { color, maxRadius: 24, duration: 180, lineWidth: 1.5 }));

        for (let i = 0; i < 6; i++) {
            const angle = baseAngle + rand(-0.35, 0.35);
            const fo = rand(4, 10), so = rand(-6, 6);
            spawnParticle({
                x: from.x + nx * fo + px * so, y: from.y + ny * fo + py * so,
                vx: Math.cos(angle) * rand(2.8, 4.4), vy: Math.sin(angle) * rand(2.8, 4.4),
                gravity: -0.005, drag: 0.9, size: rand(2, 4), color, glow: color, glowRadius: 6, decay: 0.05,
            });
        }

        for (let i = 0; i < 3; i++) {
            spawnParticle({
                x: from.x + nx * 8 + rand(-2, 2), y: from.y + ny * 8 + rand(-2, 2),
                vx: nx * rand(0.8, 1.6) + rand(-0.4, 0.4), vy: ny * rand(0.8, 1.6) + rand(-0.4, 0.4),
                gravity: 0, drag: 0.92, size: rand(1.5, 2.5), color: '#ffffff', glow: color, glowRadius: 8, decay: 0.07,
            });
        }

        effects.push(new MagicBoltEffect(from, to, {
            color, duration: 380, wobble: 20,
            onImpact: () => {
                effects.push(new RingEffect(to.x, to.y, { color: '#ffffff', maxRadius: 18, duration: 130, lineWidth: 1.25 }));
                effects.push(new RingEffect(to.x, to.y, { color, maxRadius: 26, duration: 170, lineWidth: 1.5 }));

                for (let i = 0; i < 7; i++) {
                    const angle = baseAngle + Math.PI + rand(-0.9, 0.9);
                    spawnParticle({
                        x: to.x + rand(-2, 2), y: to.y + rand(-2, 2),
                        vx: Math.cos(angle) * rand(2.8, 5.4) + rand(-0.4, 0.4),
                        vy: Math.sin(angle) * rand(2.8, 5.4) + rand(-0.4, 0.4),
                        gravity: 0.01, drag: 0.86, size: rand(2, 4), color, glow: color, glowRadius: 8, decay: 0.05,
                    });
                }

                for (let i = 0; i < 3; i++) {
                    spawnParticle({
                        x: to.x + rand(-1, 1), y: to.y + rand(-1, 1),
                        vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2),
                        gravity: 0, drag: 0.9, size: rand(1.5, 2.5), color: '#ffffff', glow: color, glowRadius: 10, decay: 0.08,
                    });
                }

                defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
            }
        }));
    }

    function playDodge(defenderEl, attackerEl) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const from = attackerEl ? avatarCenter(attackerEl) : { x: center.x - 100, y: center.y };
        const dodgeDir = center.x >= from.x ? 1 : -1;
        const dodgeDist = 32;

        defenderEl.style.transition = 'transform 0.07s ease-out, opacity 0.05s';
        const transformId = applyAvatarTransform(defenderEl, `translateX(${dodgeDir * dodgeDist}px)`);
        defenderEl.style.opacity = '0.15';

        for (let i = 0; i < 3; i++) {
            effects.push(new RingEffect(center.x + dodgeDir * i * 8, center.y, {
                color: i === 0 ? '#58a6ff' : '#39d2c0',
                maxRadius: 30 - i * 6, duration: 260 + i * 70, delay: i * 25, lineWidth: 2 - i * 0.4,
            }));
        }

        for (let i = 0; i < 22; i++) {
            spawnParticle({
                x: center.x + rand(-6, 6), y: center.y + rand(-24, 24),
                vx: rand(5, 14) * dodgeDir, vy: rand(-0.4, 0.4),
                gravity: 0, drag: 0.74, size: rand(1.2, 2.8),
                color: randChoice(['#58a6ff', '#39d2c0', '#e6edf3']), glow: '#58a6ff', glowRadius: 5, decay: 0.07, shape: 'circle',
            });
        }

        for (let i = 0; i < 14; i++) {
            const angle = (dodgeDir > 0 ? 0 : Math.PI) + rand(-Math.PI / 2.5, Math.PI / 2.5);
            spawnParticle({
                x: center.x, y: center.y + rand(-18, 18),
                vx: Math.cos(angle) * rand(2, 6), vy: Math.sin(angle) * rand(2, 6),
                gravity: -0.03, drag: 0.91, size: rand(2, 4),
                color: randChoice(['#ffffff', '#c9d1d9', '#58a6ff']), glow: '#58a6ff', glowRadius: 4, decay: 0.028, shape: 'circle',
            });
        }

        setTimeout(() => {
            const missX = center.x - dodgeDir * 10;
            effects.push(new RingEffect(missX, center.y, { color: '#f85149', maxRadius: 20, duration: 220, lineWidth: 1.5 }));
            for (let i = 0; i < 10; i++) {
                const a = rand(0, Math.PI * 2);
                spawnParticle({
                    x: missX + rand(-5, 5), y: center.y + rand(-5, 5),
                    vx: Math.cos(a) * rand(0.8, 2), vy: Math.sin(a) * rand(0.8, 2),
                    gravity: 0.04, drag: 0.92, size: rand(1, 2.5), color: '#8b949e', decay: 0.045, shape: 'circle',
                });
            }
        }, 90);

        setTimeout(() => {
            if (defenderEl._lastTransformId === transformId) {
                defenderEl.style.transition = 'transform 0.06s ease-in, opacity 0.08s';
                applyAvatarTransform(defenderEl, '');
                defenderEl.style.opacity = '1';
            }

            effects.push(new RingEffect(center.x, center.y, { color: '#ffffff', maxRadius: 38, duration: 200, lineWidth: 2.2 }));
            effects.push(new FloatingTextEffect(center.x, center.y - 36, { text: 'DODGE!', color: '#58a6ff', duration: 750 }));

            for (let i = 0; i < 12; i++) {
                const a = rand(0, Math.PI * 2);
                spawnParticle({
                    x: center.x + rand(-8, 8), y: center.y + rand(-8, 8),
                    vx: Math.cos(a) * rand(1.5, 4), vy: Math.sin(a) * rand(1.5, 4),
                    gravity: -0.015, drag: 0.93, size: rand(1.5, 3),
                    color: randChoice(['#58a6ff', '#39d2c0', '#ffffff']), glow: '#58a6ff', glowRadius: 6, decay: 0.038, shape: 'circle',
                });
            }
        }, 170);
    }

function playAssassinate(attackerEl, defenderEl) {
    if (!canvas) return;

    const from = avatarCenter(attackerEl);
    const to = avatarCenter(defenderEl);

    const pRect = attackerEl.getBoundingClientRect();
    const eRect = defenderEl.getBoundingClientRect();
    const distance = Math.max(0, Math.abs(eRect.left - pRect.right)) + 50;
    attackerEl.style.setProperty('--attack-distance', `${distance}px`);

    const dashDuration = 450;
    const vanishDelay = 30;
    const impactDelay = 90;

    attackerEl.classList.remove('attack-smash', 'attack-dash', 'attack-lunge', 'hit-flash', 'echo-hit-flash');
    void attackerEl.offsetHeight;
    attackerEl.classList.add('attack-dash');

    // departure cue
    effects.push(new RingEffect(from.x, from.y, {
        color: '#7c3aed',
        maxRadius: 14,
        duration: 180,
        lineWidth: 3
    }));

    setTimeout(() => {
        attackerEl.classList.add('assassinate-vanish');
    }, vanishDelay);

    setTimeout(() => {
        attackerEl.classList.remove('assassinate-vanish');
        attackerEl.classList.add('assassinate-reappear');

        // impact ring at defender
        effects.push(new RingEffect(to.x, to.y, {
            color: '#a78bfa',
            maxRadius: 26,
            duration: 260,
            lineWidth: 5
        }));

        for (let i = 0; i < 16; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: to.x,
                y: to.y,
                vx: Math.cos(angle) * rand(3, 8),
                vy: Math.sin(angle) * rand(3, 8),
                gravity: 0.05,
                drag: 0.88,
                size: rand(2, 4),
                color: randChoice(['#a78bfa', '#7c3aed', '#ffffff']),
                glow: '#a78bfa',
                glowRadius: 10,
                decay: 0.05,
                shape: 'circle',
            });
        }

        defenderEl.classList.remove('echo-hit-flash');
        void defenderEl.offsetHeight;
        defenderEl.classList.add('echo-hit-flash');

        arena.classList.remove('shake-hard', 'vfx-flash');
        void arena.offsetHeight;
        arena.classList.add('shake-hard', 'vfx-flash');
    }, impactDelay);

    setTimeout(() => {
        attackerEl.classList.remove('assassinate-reappear');
    }, impactDelay + 80);
}

    function playAssassinateDamage(defenderEl, value) {
        if (!canvas) return;
        const anchor = getCombatAnchorCenter(defenderEl);
        if (value > 0) {
            const layout = getCombatTextLayout(defenderEl, anchor, 'main');
            effects.push(new ScaledFloatingTextEffect(layout.x, layout.y - 45, {
                text: `☠️ ${value}`, color: '#c084fc', duration: 1100, popScale: 1.6,
                delay: layout.delay, travelY: layout.travelY,
            }));
        }
    }

    function playThickHide(defenderEl, attackerEl, reductionAmount) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        effects.push(new RingEffect(center.x, center.y, { color: '#ffffff', maxRadius: 40, duration: 400, lineWidth: 3 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#c9d1d9', maxRadius: 70, duration: 700, lineWidth: 4 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#8b949e', maxRadius: 90, duration: 900, delay: 100, lineWidth: 2.5 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#c9d1d9', maxRadius: 110, duration: 1100, delay: 200, lineWidth: 1.5 }));

        for (let i = 0; i < 28; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: center.x + rand(-6, 6), y: center.y + rand(-6, 6),
                vx: Math.cos(angle) * rand(2, 6), vy: Math.sin(angle) * rand(2, 6),
                gravity: 0.03, drag: 0.95, size: rand(3, 7),
                color: randChoice(['#8b949e', '#c9d1d9', '#ffffff']), glow: '#ffffff', glowRadius: 14, decay: 0.013, shape: 'circle',
            });
        }

        arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');

        setTimeout(() => {
            for (let i = 0; i < 14; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: center.x + rand(-18, 18), y: center.y + rand(-18, 18),
                    vx: Math.cos(angle) * rand(0.5, 2), vy: Math.sin(angle) * rand(0.5, 2) - 1,
                    gravity: 0.01, drag: 0.97,
                    color: randChoice(['#8b949e', '#c9d1d9']), glow: '#8b949e', glowRadius: 6, decay: 0.010, shape: 'circle',
                });
            }
        }, 150);

        effects.push(new FloatingTextEffect(anchor.x - 55, anchor.y + 40, { text: `🛡 ${reductionAmount}`, color: '#f1f5f9', duration: 1000 }));

        if (attackerEl) {
            const isPlayer = attackerEl.id === 'playerAvatar';
            const recoilClass = isPlayer ? 'recoil-player' : 'recoil-enemy';
            attackerEl.classList.remove(recoilClass); void attackerEl.offsetHeight; attackerEl.classList.add(recoilClass);
            setTimeout(() => attackerEl.classList.remove(recoilClass), 300);
        }
    }

    function playSecondWind(revivedEl, healValue = 0) {
        if (!canvas) return;
        const center = avatarCenter(revivedEl);
        const anchor = getCombatAnchorCenter(revivedEl);

        effects.push(new RingEffect(center.x, center.y, { color: '#3fb950', maxRadius: 55, duration: 600, lineWidth: 3 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#39d2c0', maxRadius: 75, duration: 800, delay: 100, lineWidth: 2 }));
        effects.push(new RingEffect(center.x, center.y, { color: '#3fb950', maxRadius: 95, duration: 1000, delay: 200, lineWidth: 1.5 }));

        for (let i = 0; i < 24; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: center.x + rand(-15, 15), y: center.y + rand(-10, 10),
                vx: Math.cos(angle) * rand(1.5, 4) * 0.4, vy: -rand(1.5, 4),
                gravity: -0.04, drag: 0.95, size: rand(2, 5),
                color: randChoice(['#3fb950', '#39d2c0', '#ffffff']), glow: '#3fb950', glowRadius: 10, decay: 0.018, shape: 'circle',
            });
        }

        setTimeout(() => {
            for (let i = 0; i < 16; i++) {
                spawnParticle({
                    x: center.x + rand(-20, 20), y: center.y + rand(-15, 15),
                    vx: rand(-1.5, 1.5), vy: -rand(2, 5),
                    gravity: -0.03, drag: 0.94, size: rand(3, 6),
                    color: randChoice(['#3fb950', '#ffffff']), glow: '#3fb950', glowRadius: 12, decay: 0.015, shape: 'circle',
                });
            }
        }, 200);

        const layout = getCombatTextLayout(revivedEl, anchor, 'heal');
        effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
            text: `💚 Second Wind! +${healValue}`, color: '#3fb950', duration: 1200, delay: layout.delay, travelY: layout.travelY,
        }));

        arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
    }

    function playCrit(attackerEl, defenderEl, value) {
        if (!canvas) return;
        const to = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        for (let i = 0; i < 32; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: to.x, y: to.y,
                vx: Math.cos(angle) * rand(3, 10), vy: Math.sin(angle) * rand(3, 10),
                gravity: 0.05, drag: 0.88, size: rand(2, 5),
                color: randChoice(['#fbbf24', '#f97316', '#ffffff']), glow: '#fbbf24', glowRadius: 14, decay: 0.035, shape: 'circle',
            });
        }

        effects.push(new RingEffect(to.x, to.y, { color: '#fbbf24', maxRadius: 52, duration: 350, lineWidth: 3 }));
        effects.push(new RingEffect(to.x, to.y, { color: '#f97316', maxRadius: 38, duration: 450, delay: 60, lineWidth: 2 }));

        attackerEl.classList.remove('attack-lunge'); void attackerEl.offsetHeight; attackerEl.classList.add('attack-lunge');
        defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');

        if (value > 0) {
            const layout = getCombatTextLayout(defenderEl, anchor, 'main');
            effects.push(new ScaledFloatingTextEffect(layout.x - 15, layout.y - 30, {
                text: `⚡ -${value}`, color: '#fbbf24', duration: 900, popScale: 4, delay: layout.delay, travelY: layout.travelY,
            }));
        }

        arena.classList.remove('vfx-flash', 'shake'); void arena.offsetHeight;
        arena.classList.add('vfx-flash');
        arena.classList.add('shake');
    }

    function playLifetap(attackerEl, defenderEl, drainValue) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(attackerEl);

        effects.push(new RingEffect(from.x, from.y, { color: '#f85149', maxRadius: 28, duration: 200, lineWidth: 2 }));
        effects.push(new RingEffect(from.x, from.y, { color: '#c0392b', maxRadius: 20, duration: 250, delay: 40, lineWidth: 1.5 }));

        for (let i = 0; i < 10; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: from.x + Math.cos(angle) * rand(12, 22), y: from.y + Math.sin(angle) * rand(12, 22),
                vx: Math.cos(angle) * rand(-0.5, 0.5), vy: -rand(0.5, 1.5),
                gravity: -0.02, drag: 0.94, size: rand(2, 4),
                color: randChoice(['#f85149', '#c0392b', '#ff6b6b']), glow: '#f85149', glowRadius: 8, decay: 0.04, shape: 'circle',
            });
        }

        setTimeout(() => {
            const steps = 8;
            for (let i = 0; i < steps; i++) {
                setTimeout(() => {
                    const t = i / steps;
                    spawnParticle({
                        x: from.x + (to.x - from.x) * t + rand(-6, 6),
                        y: from.y + (to.y - from.y) * t + rand(-6, 6),
                        vx: (to.x - from.x) / steps * 0.3, vy: (to.y - from.y) / steps * 0.3,
                        gravity: 0, drag: 0.88, size: rand(3, 6),
                        color: randChoice(['#f85149', '#c0392b', '#ffffff']), glow: '#f85149', glowRadius: 12, decay: 0.045, shape: 'circle',
                    });
                }, i * 18);
            }
        }, 100);

        setTimeout(() => {
            effects.push(new RingEffect(to.x, to.y, { color: '#c0392b', maxRadius: 48, duration: 400, lineWidth: 4 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#f85149', maxRadius: 36, duration: 350, delay: 50, lineWidth: 2.5 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#ffffff', maxRadius: 60, duration: 300, delay: 80, lineWidth: 1.5 }));

            for (let i = 0; i < 28; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: to.x, y: to.y,
                    vx: Math.cos(angle) * rand(3, 9), vy: Math.sin(angle) * rand(3, 9),
                    gravity: 0.05, drag: 0.88, size: rand(2, 6),
                    color: randChoice(['#c0392b', '#f85149', '#ffffff']), glow: '#c0392b', glowRadius: 14, decay: 0.032, shape: 'circle',
                });
            }

            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');

            const layout = getCombatTextLayout(attackerEl, anchor, 'dot');
            effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
                text: `-${drainValue} 🩸`, color: '#f85149', duration: 900, delay: layout.delay, travelY: layout.travelY,
            }));
        }, 280);

        setTimeout(() => {
            let flickers = 0;
            const flickerInterval = setInterval(() => {
                attackerEl.style.opacity = flickers % 2 === 0 ? '0.4' : '1';
                flickers++;
                if (flickers >= 6) {
                    clearInterval(flickerInterval);
                    attackerEl.style.opacity = '1';
                    effects.push(new RingEffect(from.x, from.y, { color: '#f85149', maxRadius: 22, duration: 300, lineWidth: 1.5 }));
                }
            }, 60);
        }, 500);
    }

    function playPhantomStep(attackerEl, defenderEl) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        attackerEl.style.transition = 'opacity 0.06s';
        attackerEl.style.opacity = '0';

        effects.push(new RingEffect(from.x, from.y, { color: '#39d2c0', maxRadius: 35, duration: 300, lineWidth: 2 }));

        for (let i = 0; i < 12; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x: from.x + rand(-10, 10), y: from.y + rand(-10, 10),
                vx: Math.cos(angle) * rand(1, 3), vy: Math.sin(angle) * rand(1, 3),
                gravity: -0.02, drag: 0.93, size: rand(2, 4),
                color: randChoice(['#39d2c0', '#58a6ff', '#ffffff']), glow: '#39d2c0', glowRadius: 8, decay: 0.03, shape: 'circle',
            });
        }

        setTimeout(() => {
            attackerEl.style.opacity = '1';

            effects.push(new RingEffect(to.x, to.y, { color: '#39d2c0', maxRadius: 50, duration: 350, lineWidth: 3 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#ffffff', maxRadius: 38, duration: 280, delay: 50, lineWidth: 2 }));

            for (let i = 0; i < 24; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: to.x, y: to.y,
                    vx: Math.cos(angle) * rand(3, 8), vy: Math.sin(angle) * rand(3, 8),
                    gravity: 0.05, drag: 0.89, size: rand(2, 5),
                    color: randChoice(['#39d2c0', '#58a6ff', '#ffffff']), glow: '#39d2c0', glowRadius: 12, decay: 0.035, shape: 'circle',
                });
            }

            const layout = getCombatTextLayout(defenderEl, anchor, 'counter');
            effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
                text: '👻 Counter!', color: '#39d2c0', duration: 900, delay: layout.delay, travelY: layout.travelY,
            }));

            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
            arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
        }, 120);
    }

    function playBerserkerStack(ownerEl, stacks, maxStacks) {
        if (!canvas) return;
        const center = avatarCenter(ownerEl);
        const anchor = getCombatAnchorCenter(ownerEl);
        const intensity = stacks / maxStacks;

        const prevStacks = ownerEl._berserkerStacks ?? 0;
        ownerEl._berserkerStacks = stacks;

        const crossedTier1 = prevStacks < 1 && stacks >= 1;
        const crossedTier2 = prevStacks < 3 && stacks >= 3;
        const crossedTier3 = prevStacks < 5 && stacks >= 5;
        const isMaxStacks = stacks >= maxStacks;
        const justHitMax = prevStacks < maxStacks && isMaxStacks;

        if (!ownerEl._berserkerAura || !ownerEl._berserkerAura.alive) {
            if (stacks > 0) {
                const aura = new BerserkerAuraEffect(ownerEl, stacks, maxStacks);
                ownerEl._berserkerAura = aura;
                effects.push(aura);
            }
        } else {
            ownerEl._berserkerAura.update(stacks, maxStacks);
        }

        if (stacks <= 0) return;

        const impactColor = isMaxStacks ? '#991b1b' : stacks >= 5 ? '#dc2626' : stacks >= 3 ? '#ea580c' : '#f97316';
        const sparkCount = 3 + Math.floor(intensity * 10);

        for (let i = 0; i < sparkCount; i++) {
            const isHot = Math.random() < 0.12;
            spawnParticle({
                x: center.x + (Math.random() - 0.5) * 18,
                y: center.y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * (isHot ? 8 : 3) * (1 + intensity),
                vy: -(1.5 + Math.random() * (isHot ? 7 : 3.5) * (1 + intensity * 0.8)),
                gravity: 0.05 + Math.random() * 0.04, drag: 0.88 + Math.random() * 0.05,
                size: isHot ? 3 + Math.random() * 3 : 1.0 + Math.random() * (1.5 + intensity * 1.5),
                color: isHot ? randChoice(['#ffffff', '#fde68a']) : randChoice([impactColor, '#fbbf24']),
                glow: Math.random() < 0.35 ? null : impactColor,
                glowRadius: isHot ? 14 + intensity * 8 : 2 + Math.random() * 6,
                decay: isHot ? 0.028 + Math.random() * 0.01 : 0.04 + Math.random() * 0.025,
                shape: 'circle',
            });
        }

        if (crossedTier2 || crossedTier3 || justHitMax) {
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
        }

        if (stacks >= 5) {
            ownerEl.style.transition = 'transform 0.1s ease-out';
            const transformId = applyAvatarTransform(ownerEl, `scale(${1.08 + intensity * 0.06})`);
            setTimeout(() => {
                if (ownerEl._lastTransformId === transformId) {
                    ownerEl.style.transition = 'transform 0.22s ease-in';
                    applyAvatarTransform(ownerEl, `scale(${1.03 + intensity * 0.04})`);
                }
            }, 120);
            setTimeout(() => {
                if (ownerEl._lastTransformId === transformId) applyAvatarTransform(ownerEl, '');
            }, 600);
        }

        if (justHitMax) {
            for (let i = 0; i < 22; i++) {
                const isHot = i < 4;
                spawnParticle({
                    x: center.x + (Math.random() - 0.5) * 20, y: center.y + (Math.random() - 0.5) * 14,
                    vx: (Math.random() - 0.48) * (isHot ? 10 : 5) * (1 + intensity * 0.5),
                    vy: -(2 + Math.random() * (isHot ? 10 : 6)),
                    gravity: 0.04 + Math.random() * 0.03, drag: 0.86 + Math.random() * 0.04,
                    size: isHot ? 4 + Math.random() * 3 : 1.5 + Math.random() * 3.5,
                    color: isHot ? randChoice(['#ffffff', '#fde68a', '#fbbf24']) : randChoice(['#dc2626', '#991b1b', '#fbbf24', '#f97316']),
                    glow: isHot ? '#ff4400' : (Math.random() < 0.4 ? null : '#dc2626'),
                    glowRadius: isHot ? 20 : 4 + Math.random() * 12,
                    decay: isHot ? 0.018 : 0.020 + Math.random() * 0.012, shape: 'circle',
                });
            }
            for (let i = 0; i < 10; i++) {
                const goLeft = i < 3;
                spawnParticle({
                    x: center.x + (Math.random() - 0.5) * 8, y: center.y + 4 + Math.random() * 14,
                    vx: (goLeft ? -1 : 1) * (goLeft ? 5 + Math.random() * 6 : 2 + Math.random() * 4),
                    vy: -0.3 + Math.random() * 0.8,
                    gravity: 0.08 + Math.random() * 0.04, drag: 0.83 + Math.random() * 0.05,
                    size: 1.8 + Math.random() * 3,
                    color: randChoice(['#dc2626', '#ea580c', '#fbbf24']),
                    glow: Math.random() < 0.5 ? null : '#dc2626', glowRadius: 4 + Math.random() * 8,
                    decay: 0.028 + Math.random() * 0.014, shape: 'circle',
                });
            }
            arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
            effects.push(new FloatingTextEffect(anchor.x, anchor.y - 44, { text: '🔥 MAX RAGE', color: '#dc2626', duration: 1300 }));
        } else if (crossedTier3) {
            effects.push(new FloatingTextEffect(anchor.x, anchor.y - 36, { text: '💀 BERSERK', color: '#dc2626', duration: 1000 }));
        } else if (crossedTier2) {
            effects.push(new FloatingTextEffect(anchor.x, anchor.y - 32, { text: '😠 Enraged', color: '#ea580c', duration: 800 }));
        } else if (crossedTier1) {
            effects.push(new FloatingTextEffect(anchor.x, anchor.y - 32, { text: '😤 Berserker', color: '#f97316', duration: 700 }));
        }
    }

    function playLifestealHeal(ownerEl, value) {
        if (!canvas) return;
        const center = avatarCenter(ownerEl);
        const anchor = getCombatAnchorCenter(ownerEl);

        for (let i = 0; i < 10; i++) {
            spawnParticle({
                x: center.x + rand(-16, 16), y: center.y + rand(-8, 8),
                vx: rand(-0.5, 0.5), vy: -rand(1.2, 3.0),
                gravity: -0.025, drag: 0.95, size: rand(2, 4),
                color: randChoice(['#3fb950', '#39d2c0', '#7ee8a2']), glow: '#3fb950', glowRadius: 8, decay: 0.020, shape: 'circle',
            });
        }

        effects.push(new RingEffect(center.x, center.y, { color: '#3fb950', maxRadius: 28, duration: 300, lineWidth: 1.5 }));

        const layout = getCombatTextLayout(ownerEl, anchor, 'heal');
        effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
            text: `+${value}`, color: '#3fb950', duration: 750, delay: layout.delay, travelY: layout.travelY,
        }));
    }

    function playIronWill(defenderEl, attackerEl, reductionAmount, missingHPPercent) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);
        const attackerCenter = attackerEl ? avatarCenter(attackerEl) : { x: center.x - 100, y: center.y };
        const t = missingHPPercent;

        function lerpColor(a, b, t) {
            const ah = a.replace('#', ''), bh = b.replace('#', '');
            const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
            const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
            return `#${Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0')}${Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0')}${Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0')}`;
        }

        const color = t < 0.5 ? lerpColor('#c9d1d9', '#f97316', t / 0.5) : lerpColor('#f97316', '#dc2626', (t - 0.5) / 0.5);
        const glowIntensity = 8 + t * 24;

        if (!defenderEl.style.transform) applyAvatarTransform(defenderEl, '');
        defenderEl.style.transition = 'transform 0.05s ease-out';
        const transformId = applyAvatarTransform(defenderEl, `scale(0.94)`);
        setTimeout(() => {
            if (defenderEl._lastTransformId === transformId) {
                defenderEl.style.transition = 'transform 0.08s ease-in';
                applyAvatarTransform(defenderEl, '');
            }
        }, 70 + rand(-8, 8));

        effects.push(new RingEffect(center.x, center.y, { color: '#ffffff', maxRadius: 20 + t * 12, duration: 150, lineWidth: 1.5 + t * 1.5 }));

        const shockDelay = 70 + rand(-10, 10);
        setTimeout(() => {
            effects.push(new RingEffect(center.x + rand(-2, 2), center.y + rand(-2, 2), { color, maxRadius: 38 + t * 42, duration: 320 + t * 280, lineWidth: 2.5 + t * 3 }));
            effects.push(new RingEffect(center.x + rand(-4, 4), center.y + rand(-3, 3), { color, maxRadius: 28 + t * 30, duration: 280 + t * 200, delay: rand(15, 35), lineWidth: 1 + t * 1.5 }));
            if (t >= 0.5) {
                effects.push(new RingEffect(center.x + rand(-3, 3), center.y + rand(-3, 3), {
                    color: lerpColor('#f97316', '#dc2626', Math.min(1, (t - 0.5) * 2)),
                    maxRadius: 58 + t * 32, duration: 480 + t * 120, delay: rand(40, 70), lineWidth: 1.2,
                }));
            }
        }, shockDelay);

        setTimeout(() => {
            const dx = center.x - attackerCenter.x, dy = center.y - attackerCenter.y;
            const baseAngle = Math.atan2(dy, dx);
            for (let i = 0; i < Math.floor(6 + t * 22); i++) {
                const angle = baseAngle + rand(-0.7 - t * 0.5, 0.7 + t * 0.5);
                spawnParticle({
                    x: center.x + rand(-6, 6), y: center.y + rand(-6, 6),
                    vx: Math.cos(angle) * rand(1.5, 3.5 + t * 5), vy: Math.sin(angle) * rand(1.5, 3.5 + t * 5),
                    gravity: t >= 0.5 ? -0.01 : 0.04, drag: 0.92, size: rand(1.5, 2.5 + t * 3),
                    color: randChoice(t < 0.4 ? ['#c9d1d9', '#ffffff', '#8b949e'] : t < 0.75 ? ['#f97316', '#fbbf24', '#ffffff'] : ['#dc2626', '#f97316', '#ffffff']),
                    glow: color, glowRadius: glowIntensity, decay: 0.025 + t * 0.015, shape: 'circle',
                });
            }
        }, 72 + rand(-10, 10));

        if (t * 6 > 2) {
            setTimeout(() => { arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake'); }, 80 + rand(-10, 10));
        }

        setTimeout(() => {
            effects.push(new ScaledFloatingTextEffect(anchor.x - 47, anchor.y + 38, {
                text: `🛡${reductionAmount}`, color: '#ffffff', duration: 700 + t * 300, fontSize: 6, popScale: 1 + t * 0.5,
            }));
        }, 90 + rand(-10, 10));

        if (t >= 0.7) effects.push(new IronWillAuraEffect(defenderEl, t));
    }

    function playArmorBlock(defenderEl, attackerEl, thickReduction, ironReduction, missingHPPercent, finalDamage = null) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);
        const attackerCenter = attackerEl ? avatarCenter(attackerEl) : { x: center.x - 100, y: center.y };
        const t = missingHPPercent;
        const total = thickReduction + ironReduction;
        const ironDominates = ironReduction > thickReduction;

        function lerpColor(a, b, t) {
            const ah = a.replace('#', ''), bh = b.replace('#', '');
            const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
            const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
            return `#${Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0')}${Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0')}${Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0')}`;
        }

        const steelColor = '#c9d1d9';
        const ironColor = t < 0.5 ? lerpColor('#c9d1d9', '#f97316', t / 0.5) : lerpColor('#f97316', '#dc2626', (t - 0.5) / 0.5);
        const primaryColor = ironDominates ? ironColor : steelColor;
        const secondaryColor = ironDominates ? steelColor : ironColor;

        if (!defenderEl.style.transform) applyAvatarTransform(defenderEl, '');
        defenderEl.style.transition = 'transform 0.05s ease-out';
        const transformId = applyAvatarTransform(defenderEl, `scale(0.94)`);
        setTimeout(() => {
            if (defenderEl._lastTransformId === transformId) {
                defenderEl.style.transition = 'transform 0.08s ease-in';
                applyAvatarTransform(defenderEl, '');
            }
        }, 65 + rand(-8, 8));

        effects.push(new RingEffect(center.x, center.y, { color: '#ffffff', maxRadius: 22 + t * 10, duration: 150, lineWidth: 2 }));

        setTimeout(() => {
            effects.push(new RingEffect(center.x + rand(-2, 2), center.y + rand(-2, 2), {
                color: primaryColor, maxRadius: ironDominates ? 44 + t * 40 : 38 + t * 20,
                duration: ironDominates ? 340 + t * 260 : 280, lineWidth: ironDominates ? 3 + t * 3 : 2.5,
            }));
            effects.push(new RingEffect(center.x + rand(-3, 3), center.y + rand(-3, 3), {
                color: secondaryColor, maxRadius: ironDominates ? 26 + t * 14 : 52 + t * 18, duration: 220, delay: rand(20, 45), lineWidth: 1.2,
            }));
            if (t >= 0.5 && ironDominates) {
                effects.push(new RingEffect(center.x + rand(-2, 2), center.y + rand(-2, 2), {
                    color: lerpColor('#f97316', '#dc2626', Math.min(1, (t - 0.5) * 2)),
                    maxRadius: 65 + t * 25, duration: 500, delay: rand(50, 80), lineWidth: 1.2,
                }));
            }
        }, 72 + rand(-10, 10));

        setTimeout(() => {
            const dx = center.x - attackerCenter.x, dy = center.y - attackerCenter.y;
            const baseAngle = Math.atan2(dy, dx);
            for (let i = 0; i < Math.floor(8 + t * 20); i++) {
                const angle = baseAngle + rand(-0.7 - t * 0.4, 0.7 + t * 0.4);
                spawnParticle({
                    x: center.x + rand(-6, 6), y: center.y + rand(-6, 6),
                    vx: Math.cos(angle) * rand(1.5, 4 + t * 5), vy: Math.sin(angle) * rand(1.5, 4 + t * 5),
                    gravity: t >= 0.5 ? -0.01 : 0.04, drag: 0.92, size: rand(1.5, 2.5 + t * 3),
                    color: randChoice(ironDominates ? [ironColor, primaryColor, '#ffffff'] : [steelColor, '#ffffff', '#8b949e']),
                    glow: primaryColor, glowRadius: 8 + t * 16, decay: 0.025 + t * 0.012, shape: 'circle',
                });
            }
        }, 74 + rand(-10, 10));

        if ((total / 30) + t * 4 > 1.5) {
            setTimeout(() => { arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake'); }, 82 + rand(-10, 10));
        }

        setTimeout(() => {
            const blockLayout = getCombatTextLayout(defenderEl, anchor, 'secondary');
            const blockFontSize = total <= 8 ? 5.04 : total <= 16 ? 6.3 : 7.56;
            effects.push(new ScaledFloatingTextEffect(blockLayout.x - 22, blockLayout.y - 20, {
                text: `🛡 ${total}`, color: primaryColor, duration: 550, fontSize: blockFontSize,
                popScale: 1 + t * 0.2, delay: blockLayout.delay, travelY: blockLayout.travelY,
            }));

            if (finalDamage !== null && finalDamage > 0) {
                setTimeout(() => {
                    const finalLayout = getCombatTextLayout(defenderEl, anchor, 'main');
                    effects.push(new ScaledFloatingTextEffect(finalLayout.x, finalLayout.y - 12, {
                        text: `-${finalDamage}`, color: '#ffffff',
                        duration: 800 + t * 200, fontSize: finalDamage <= 10 ? 16 : finalDamage <= 25 ? 20 : 26,
                        popScale: 1.3 + t * 0.3, delay: finalLayout.delay, travelY: finalLayout.travelY,
                    }));
                }, 80);
            }
        }, 88 + rand(-10, 10));

        if (t >= 0.7) effects.push(new IronWillAuraEffect(defenderEl, t));
    }

    function playHit(attackerEl, defenderEl, value, isMagic = false) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        if (!isMagic) {
            const dx = to.x - from.x, dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = dx / len, ny = dy / len;

            for (let i = 0; i < 12; i++) {
                const forward = rand(2.5, 6.5), side = rand(-2.2, 2.2);
                spawnParticle({
                    x: to.x, y: to.y,
                    vx: nx * forward + (-ny) * side, vy: ny * forward + nx * side,
                    gravity: 0.04, drag: 0.90, size: rand(1.8, 3.8),
                    color: randChoice(['#ffffff', '#dbe5f0', '#b8c7d9']), glow: '#ffffff', glowRadius: 8, decay: 0.05,
                    shape: randChoice(['circle', 'spark']),
                });
            }

            for (let i = 0; i < 6; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: to.x, y: to.y,
                    vx: Math.cos(angle) * rand(1, 3), vy: Math.sin(angle) * rand(1, 3),
                    gravity: 0.06, drag: 0.88, size: rand(1.5, 2.8),
                    color: '#8b949e', glow: '#c9d1d9', glowRadius: 4, decay: 0.06, shape: 'circle',
                });
            }

            effects.push(new RingEffect(to.x, to.y, { color: '#f8fafc', maxRadius: 42, duration: 180, lineWidth: 2.2 }));
            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
        }

        if (value > 0) {
            const layout = getCombatTextLayout(defenderEl, anchor, 'main');
            effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
                text: `-${value}`, color: '#f3f4f6', duration: 760, delay: layout.delay, travelY: layout.travelY,
            }));
        }
    }

    function playEsAbsorb(defenderEl, value) {
        const anchor = getCombatAnchorCenter(defenderEl);
        const { x, y } = getLiveArenaRelativeCenter(defenderEl);

        const layout = getCombatTextLayout(defenderEl, anchor, 'secondary');
        effects.push(new FloatingTextEffect(layout.x + 20, layout.y - 10, {
            text: `⬡ -${value}`, color: '#00e5ff', duration: 900, delay: layout.delay, travelY: layout.travelY,
        }));

        effects.push(new RingEffect(x, y, { color: '#00e5ff', maxRadius: 60, duration: 400, lineWidth: 2 }));
        effects.push(new RingEffect(x, y, { color: '#00e5ff', maxRadius: 45, duration: 500, delay: 100, lineWidth: 1.5 }));

        for (let i = 0; i < 8; i++) {
            const angle = rand(0, Math.PI * 2);
            spawnParticle({
                x, y, vx: Math.cos(angle) * rand(3, 7), vy: Math.sin(angle) * rand(3, 7),
                gravity: 0.05, drag: 0.9, size: rand(1.5, 3), color: '#00e5ff', glow: '#00e5ff', glowRadius: 5, decay: 0.05,
            });
        }
    }

    function playBlizzard(defenderEl) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        const shardCount = 16;
        for (let i = 0; i < shardCount; i++) {
            const delay = Math.max(0, (i * 22) - 100);
            setTimeout(() => {
                effects.push(new FallingShardEffect(center.x + rand(-45, 45), -20, center.y + rand(-10, 15), {
                    vx: rand(-0.6, 0.6), vy: rand(7, 12), width: rand(3, 7), height: rand(12, 22),
                    rotation: rand(-0.4, 0.4),
                    color: randChoice(['#93c5fd', '#bfdbfe', '#dbeafe', '#ffffff']),
                    glow: '#93c5fd', duration: rand(500, 750),
                    onLand: (lx, ly) => {
                        for (let j = 0; j < 3; j++) {
                            const angle = rand(Math.PI * 1.25, Math.PI * 1.75);
                            spawnParticle({
                                x: lx, y: ly,
                                vx: Math.cos(angle) * rand(1, 3), vy: -Math.abs(Math.sin(angle) * rand(1, 3)),
                                gravity: 0.08, drag: 0.90, size: rand(1, 2.5),
                                color: '#dbeafe', glow: '#93c5fd', glowRadius: 4, decay: 0.05, shape: 'circle',
                            });
                        }
                    }
                }));
            }, delay);
        }

        setTimeout(() => {
            effects.push(new RingEffect(center.x, center.y, { color: '#93c5fd', maxRadius: 52, duration: 280, lineWidth: 3 }));
            effects.push(new RingEffect(center.x, center.y, { color: '#dbeafe', maxRadius: 68, duration: 320, delay: 60, lineWidth: 1.2 }));

            [0, 45, 90, 135, 180, 225, 270, 315].forEach(deg => {
                const rad = deg * Math.PI / 180;
                spawnParticle({
                    x: center.x, y: center.y,
                    vx: Math.cos(rad) * 3.5, vy: Math.sin(rad) * 3.5,
                    gravity: 0, drag: 0.92, size: 2.5, color: '#dbeafe', glow: '#93c5fd', glowRadius: 6, decay: 0.04, shape: 'circle',
                });
            });

            defenderEl.classList.remove('hit-flash'); void defenderEl.offsetHeight; defenderEl.classList.add('hit-flash');
            arena.classList.remove('shake-cold'); void arena.offsetHeight; arena.classList.add('shake-cold');
        }, 200);

        const layout = getCombatTextLayout(defenderEl, anchor, 'secondary');
        effects.push(new FloatingTextEffect(layout.x, layout.y - 40, {
            text: '❄️ Chilled!', color: '#93c5fd', duration: 900, delay: layout.delay, travelY: layout.travelY,
        }));

        if (!defenderEl._frozenAura || !defenderEl._frozenAura.alive) {
            defenderEl._frozenAura = new FrozenAuraEffect(defenderEl);
            effects.push(defenderEl._frozenAura);
        }
    }

    function playShatter(defenderEl) {
        if (!canvas) return;
        const center = avatarCenter(defenderEl);
        const anchor = getCombatAnchorCenter(defenderEl);

        defenderEl._frozenAura?.kill();

        for (let i = 0; i < randInt(4, 6); i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(3, 7);
            effects.push(new FallingShardEffect(center.x + rand(-8, 8), center.y + rand(-8, 8), center.y + rand(20, 40), {
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                width: rand(2, 5), height: rand(6, 12), rotation: rand(0, Math.PI * 2),
                color: randChoice(['#93c5fd', '#dbeafe', '#ffffff']), glow: '#bfdbfe', duration: 400, onLand: null,
            }));
        }

        effects.push(new RingEffect(center.x, center.y, { color: '#bfdbfe', maxRadius: 30, duration: 180, lineWidth: 2 }));

        const layout = getCombatTextLayout(defenderEl, anchor, 'secondary');
        effects.push(new FloatingTextEffect(layout.x, layout.y - 30, {
            text: '🧊 Shattered!', color: '#dbeafe', duration: 700, delay: layout.delay, travelY: layout.travelY,
        }));
    }

    function playRealityFracture(targetEl, attackerEl, intensity = 1.0, value = 0) {
        if (!canvas) return;
        const from = avatarCenter(attackerEl);
        const to = avatarCenter(targetEl);
        const anchor = getCombatAnchorCenter(targetEl);

        effects.push(new RingEffect(from.x, from.y, { color: '#a855f7', maxRadius: 32, duration: 220, lineWidth: 2 }));
        effects.push(new RingEffect(from.x, from.y, { color: '#06b6d4', maxRadius: 22, duration: 180, delay: 40, lineWidth: 1.5 }));

        const baseAngle = Math.atan2(to.y - from.y, to.x - from.x);
        for (let i = 0; i < 10; i++) {
            const angle = baseAngle + rand(-0.4, 0.4);
            spawnParticle({
                x: from.x + rand(-8, 8), y: from.y + rand(-8, 8),
                vx: Math.cos(angle) * rand(3, 6), vy: Math.sin(angle) * rand(3, 6),
                gravity: -0.01, drag: 0.88, size: rand(2, 4),
                color: randChoice(['#a855f7', '#06b6d4', '#e0e7ff']), glow: '#a855f7', glowRadius: 10, decay: 0.05, shape: 'circle',
            });
        }

        setTimeout(() => {
            effects.push(new RealityFractureEffect(anchor.x, anchor.y - 10, intensity));
        }, 60);

        setTimeout(() => {
            for (let i = 0; i < 20; i++) {
                const angle = rand(0, Math.PI * 2);
                spawnParticle({
                    x: to.x + rand(-6, 6), y: to.y + rand(-6, 6),
                    vx: Math.cos(angle) * rand(2, 7), vy: Math.sin(angle) * rand(2, 7),
                    gravity: -0.01, drag: 0.89, size: rand(1.5, 4),
                    color: randChoice(['#a855f7', '#06b6d4', '#e0e7ff', '#818cf8', '#e879f9']),
                    glow: randChoice(['#a855f7', '#06b6d4']), glowRadius: 10, decay: 0.035, shape: 'circle',
                });
            }
            for (let i = 0; i < 6; i++) {
                spawnParticle({
                    x: to.x + rand(-12, 12), y: to.y + rand(-12, 12),
                    vx: rand(-0.8, 0.8), vy: rand(-1.5, -0.3),
                    gravity: -0.008, drag: 0.97, size: rand(2, 5),
                    color: randChoice(['#818cf8', '#c084fc']), glow: '#a855f7', glowRadius: 8, decay: 0.012, shape: 'circle',
                });
            }
        }, 140);

        setTimeout(() => {
            targetEl.classList.remove('hit-flash'); void targetEl.offsetHeight; targetEl.classList.add('hit-flash');
            effects.push(new RingEffect(to.x, to.y, { color: '#a855f7', maxRadius: 48, duration: 350, lineWidth: 2.5 }));
            effects.push(new RingEffect(to.x, to.y, { color: '#06b6d4', maxRadius: 36, duration: 280, delay: 50, lineWidth: 1.5 }));
            arena.classList.remove('shake'); void arena.offsetHeight; arena.classList.add('shake');
            arena.classList.remove('vfx-flash'); void arena.offsetHeight; arena.classList.add('vfx-flash');
        }, 160);

        if (value > 0) {
            setTimeout(() => {
                const layout = getCombatTextLayout(targetEl, anchor, 'main');
                effects.push(new ScaledFloatingTextEffect(layout.x, layout.y - 40, {
                    text: `⬡✦-${value}`, color: '#c084fc', duration: 1000,
                    fontSize: value >= 30 ? 22 : value >= 15 ? 18 : 14,
                    popScale: 1.4 + intensity * 0.3, delay: layout.delay, travelY: layout.travelY,
                }));
            }, 200);
        }
    }

    // ─── Ambient Background System ──────────────────────────────────────────────

    let ambientCanvas, ambientCtx;
    let ambientParticles = [];
    let ambientRafId = null;
    let ambientLastFrame = 0;
    let ambientSpawnTimer = 0;

    function initAmbient() {
        const overlay = document.getElementById('battleOverlay');
        if (!overlay) return;

        const old = document.getElementById('ambientCanvas');
        if (old) old.remove();

        ambientCanvas = document.createElement('canvas');
        ambientCanvas.id = 'ambientCanvas';
        ambientCanvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    `;
        overlay.appendChild(ambientCanvas);
        ambientCtx = ambientCanvas.getContext('2d');

        resizeAmbientCanvas();
        window.addEventListener('resize', resizeAmbientCanvas);

        ambientParticles = [];
        if (ambientRafId) cancelAnimationFrame(ambientRafId);
        ambientLoopFn();
    }

    function resizeAmbientCanvas() {
        if (!ambientCanvas) return;
        const rect = ambientCanvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        ambientCanvas.width = rect.width * dpr;
        ambientCanvas.height = rect.height * dpr;
        ambientCtx.scale(dpr, dpr);
        ambientCanvas._w = rect.width;
        ambientCanvas._h = rect.height;
    }

    function spawnEmber(W, H) {
        ambientParticles.push({
            x: rand(0, W), y: H + rand(0, 20),
            vx: rand(-0.4, 0.4), vy: -rand(0.4, 1.2),
            size: rand(1.5, 3),
            color: randChoice(['#f97316', '#f85149', '#fbbf24', '#ff6b35']),
            glow: '#f97316', glowRadius: rand(4, 8),
            life: 1.0, decay: rand(0.003, 0.007),
            wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.02, 0.05),
        });
    }

    function spawnDust(W, H) {
        ambientParticles.push({
            x: rand(0, W), y: rand(0, H),
            vx: rand(-0.15, 0.15), vy: -rand(0.05, 0.25),
            size: rand(1, 2), color: 'rgba(255,255,255,0.6)',
            glow: null, glowRadius: 0,
            life: 1.0, decay: rand(0.002, 0.005),
            wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.01, 0.03),
        });
    }

    function spawnWisp(W, H) {
        ambientParticles.push({
            x: rand(0, W), y: rand(H * 0.3, H * 0.8),
            vx: rand(-0.2, 0.2), vy: -rand(0.1, 0.4),
            size: rand(4, 8),
            color: randChoice(['#bc8cff', '#39d2c0', '#58a6ff']),
            glow: '#bc8cff', glowRadius: rand(12, 20),
            life: 1.0, decay: rand(0.001, 0.003),
            wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.01, 0.025),
        });
    }

    function ambientLoopFn(timestamp = 0) {
        ambientRafId = requestAnimationFrame(ambientLoopFn);

        const dt = ambientLastFrame ? Math.min(timestamp - ambientLastFrame, 50) : 16.67;
        ambientLastFrame = timestamp;

        const W = ambientCanvas._w || ambientCanvas.width;
        const H = ambientCanvas._h || ambientCanvas.height;
        ambientCtx.clearRect(0, 0, W, H);

        ambientSpawnTimer += dt;
        if (ambientSpawnTimer > 180) {
            ambientSpawnTimer = 0;
            if (Math.random() < 0.85) spawnEmber(W, H);
            if (Math.random() < 0.5)  spawnEmber(W, H);
            if (Math.random() < 0.6)  spawnDust(W, H);
            if (Math.random() < 0.15) spawnWisp(W, H);
        }

        ambientParticles = ambientParticles.filter(p => {
            p.wobble += p.wobbleSpeed;
            p.x += p.vx + Math.sin(p.wobble) * 0.3;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) return false;

            ambientCtx.save();
            ambientCtx.globalAlpha = Math.max(0, p.life * 0.7);
            if (p.glow) { ambientCtx.shadowColor = p.glow; ambientCtx.shadowBlur = p.glowRadius; }
            ambientCtx.fillStyle = p.color;
            ambientCtx.beginPath();
            ambientCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ambientCtx.fill();
            ambientCtx.restore();
            return true;
        });
    }

    // ─── Public API ─────────────────────────────────────────────────

    return {
        init,
        initAmbient,
        cacheCombatAnchors,
        clearCombatAnchors,
        playEchoStrike,
        playDoubleStrike,
        playTimeWarp,
        playMagicBolt,
        playAssassinate,
        playAssassinateDamage,
        playBloodletting,
        playCorrosiveTouch,
        playBleedApplied,
        playBleedTick,
        playBleedStackUpdate,
        playThickHide,
        playSecondWind,
        playDodge,
        playCrit,
        playLifetap,
        playPhantomStep,
        playBerserkerStack,
        playLifestealHeal,
        playIronWill,
        playArmorBlock,
        playHit,
        playEsAbsorb,
        playBlizzard,
        playShatter,
        playRealityFracture,
    };

})();