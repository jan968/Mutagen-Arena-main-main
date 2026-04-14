# Ensure Character Contact during Lunge

Currently, characters in the battle arena are too far apart to touch during the lunge animation. This plan will adjust the arena geometry and animation variables to ensure a visible impact.

## User Review Required

> [!NOTE]
> **Layout Change**: I am moving the fighters closer together at the start of the battle (using `justify-content: center`) to make the physical impact visible on all screen sizes.

## Proposed Changes

### Styling & Layout

#### [MODIFY] [style.css](file:///Users/janpetra/Downloads/Mutagen-Arena-main/style.css)
- Update `.fighter-arena` to use `justify-content: center` with a fixed `gap: 60px` (or similar) instead of `space-between`. This brings them closer to the center of the screen.
- Increase `--lunge-distance` to ensure it exceeds the neutral gap. A value of `clamp(180px, 20vw, 320px)` should ensure overlap.
- Adjust the `recoil` animation to trigger precisely when the lunge reaches its peak.

## Verification Plan

### Automated Verification
- Use the browser subagent to measure the `gap` and `lunge-peak` coordinates.
- Capture screenshots at the 50% mark of the `attack-lunge` animation to confirm visual overlap.

### Manual Verification
- Visually observe the Rogue attacking the Warrior Dummy to ensure it looks like a "real" hit.
