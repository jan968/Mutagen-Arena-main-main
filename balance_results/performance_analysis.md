# Mutagen Arena Performance Analysis Report

This document outlines the potential causes of lag on older PCs for the Mutagen Arena game and provides recommendations for optimization without code changes where possible, or identifying specific areas for future improvement.

## 1. Primary Bottlenecks

### 🚀 Canvas VFX System ([vfx.js](file:///c:/Users/Thai%20Harmony/Downloads/GAME/vfx.js))
*   **Shadow Blurs**: Many particle effects use `ctx.shadowBlur`. On older GPUs or integrated graphics, this is a multi-pass operation that is extremely expensive.
*   **Particle Count**: High-speed attacks (like Echo Strike or Double Strike) can spawn hundreds of particles simultaneously, overwhelming the CPU's ability to process the `particles.filter` loop and the GPU's draw calls.
*   **Constant Render Loop**: The `requestAnimationFrame` loop runs perpetually, even when no particles are visible, clearing the canvas 60+ times per second.

### 🎨 CSS Rendering & Animations ([style.css](file:///c:/Users/Thai%20Harmony/Downloads/GAME/style.css))
*   **Backdrop Filters**: The `.battle-intro-overlay` uses `backdrop-filter: blur(4px)`. This is one of the most expensive CSS properties as it requires a screen-readback and blur pass every frame.
*   **Animated Filters**: The `.echo-hit-flash` and `.hit-flash` animations use `brightness`, `saturate`, and `hue-rotate` filters. These are computationally intensive when applied to large elements like the 150x150px avatars.
*   **Arena Drift**: The `arenaDrift` animation constantly moves a large background image. This forces the browser to re-paint the arena section continuously.
*   **Glow Effects**: Large `box-shadow` and `text-shadow` glows (e.g., in `.battle-intro-text` and `.panel:hover`) add significant per-pixel overhead.

### 📦 Asset Management
*   **Large Images**: Assets like [enemy_avatar.png](file:///c:/Users/Thai%20Harmony/Downloads/GAME/enemy_avatar.png) (1.4MB) and [player_avatar.png](file:///c:/Users/Thai%20Harmony/Downloads/GAME/player_avatar.png) (1.2MB) are quite large for simple avatars. Loading and decoding these in memory can cause initial hitches.
*   **Unoptimized Formats**: PNG is great for transparency but can be much heavier than modern formats like WebP.

### ⚙️ Main Thread Logic ([app.js](file:///c:/Users/Thai%20Harmony/Downloads/GAME/app.js))
*   **DOM Thrashing**: During battle playback, the code updates the `hpBar`, `hpText`, and `battleLiveText` at high frequencies (as low as 440ms). Frequent `classList` toggling also triggers reflows and repaints.
*   **Timer Drift**: Relying on `setTimeout` for battle sequencing can lead to jitter if the main thread is busy with rendering the heavy VFX and CSS.

---

## 2. Recommendations for Improvement

### Immediate (No Code Change)
*   **Asset Compression**: Compress the [.png](file:///c:/Users/Thai%20Harmony/Downloads/GAME/battle_bg.png) files using tools like TinyPNG or convert them to `.webp`. This reduces initial load time and memory pressure.
*   **Hardware Acceleration**: Ensure the PC has "Hardware Acceleration" enabled in the browser settings.
*   **Resolution Scaling**: If the browser window is very large, older PCs will struggle to repainted the canvas. Running in a smaller window may improve FPS.

### Technical Recommendations (For Future Development)
*   **Disable ShadowBlur**: Replace `shadowBlur` with pre-rendered glow sprites or simply use solid colors for particles on low-end devices.
*   **Pause VFX Loop**: Only run the `requestAnimationFrame` loop in [vfx.js](file:///c:/Users/Thai%20Harmony/Downloads/GAME/vfx.js) when there are active particles or effects.
*   **CSS Optimization**: Replace `backdrop-filter` with a simple semi-transparent background color. Use `will-change: transform` on animated elements to promote them to their own compositor layers.
*   **Layer Optimization**: Instead of animating the background with `background-position`, use a separate `img` or `div` and animate its `transform: translate`.

### Conclusion
The game is visually rich, but it prioritizes aesthetics over low-end performance. The combination of per-pixel CSS filters and canvas shadow effects is the likely culprit for the lag reported on older PCs.
