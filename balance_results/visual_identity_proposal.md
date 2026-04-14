# 🎭 Visual & Combat Identity Proposal

Every fighter should feel different based on their stats. Currently, everyone "auto-attacks" the same way. Here is how we give them a unique soul.

---

## ⚔️ 1. Unique Attack Archetypes
We will change the generic "Attack" into three distinct styles based on the highest stat:

| Stat | Attack Style | Visual Effect | Narrative Vibe |
| :--- | :--- | :--- | :--- |
| **STR** | **Crushing Blow** | Red glow + Heavy screen shake | "Brutally", "Meaty", "Smashes" |
| **DEX** | **Precision Strike** | Cyan after-images + Speed blurs | "Swiftly", "Gracefully", "Pierces" |
| **INT** | **Arcane Pulse** | Purple runes + Glow orbits | "Ethereally", "Surges", "Overruns" |

---

## 🧬 2. The Hybrid "Class" System
If two stats are within 20% of each other, the fighter earns a **Hybrid Title**. This title will appear in the UI and change the battle logs.

*   **STR + DEX** = **"Vanguard"** (Balanced physical power)
*   **STR + INT** = **"Spellblade"** (Melee magic)
*   **DEX + INT** = **"Nightshade"** (High-speed caster/assassin)
*   **All Balanced** = **"Mutant Prime"** (Jack of all trades)

---

## 🎨 3. Combat Log Enhancements
Currently, logs say: `You attack Test Dummy for 20 damage`.
**Proposed**:
*   *STR Focus*: `You **OBLITERATE** Test Dummy for 45 damage!`
*   *DEX Focus*: `You land a **BLISTERING** strike on Test Dummy for 18 damage.`
*   *INT Focus*: `You **UNLEASH** a magical surge on Test Dummy for 22 damage.`

---

## 🛠️ Implementation Plan
1.  **Logic**: Update [BattleEngine](file:///c:/Users/Thai%20Harmony/Downloads/GAME/test_dex_vs_str.js#197-281) to determine an `attackType` at the start of battle.
2.  **Strings**: Expand `BATTLE_STRINGS` to have 3 categories instead of 1.
3.  **VFX**: Update [vfx.js](file:///c:/Users/Thai%20Harmony/Downloads/GAME/vfx.js) to accept a `vfxColor` parameter based on the `attackType`.

**Does this sound like the right direction?** It would make the autobattler feel much more like an RPG.
