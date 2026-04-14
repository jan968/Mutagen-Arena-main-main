# 🗺️ Mutagen Arena: Gameplay Roadmap

Based on our recent testing, the most important "next step" is to finalize the **systems** before fine-tuning the **numbers**. Balancing level 1 while building for level 99 is a recipe for frustration.

---

## 🚀 Recommended Phase 1: The INT Integration
**Don't balance DEX/STR yet.** Adding Intelligence (INT) will introduce a new "Rock, Paper, Scissors" dynamic. 

### **Proposed INT Archetypes**
*   **STR beats DEX**: (Bulk outlasts burst)
*   **DEX beats INT**: (Burst kills the "glass cannon" mage)
*   **INT beats STR**: (Magic/Status effects bypass armor/bulk)

### **INT Mutation Ideas**
*   **"Arcane Shield"**: Absorbs damage based on INT. A direct counter to STR's heavy hits.
*   **"Mana Burn"**: Reduces the opponent's "Mutation Trigger Rate" or adds a "Mana" cost to active mutations.
*   **"Status escalation"**: INT could increase the *duration* of Bleed or Daze.

---

## 📈 Recommended Phase 2: The Leveling & Scaling System
The "1500 HP" test showed that Agility becomes too consistent in long fights. To fix this for Level 99, we need **Non-Linear Scaling**.

### **1. Diminishing Returns**
*   **Currently**: 400 AGI gives 35% dodge.
*   **Proposed**: The closer you get to 400, the "harder" it should be to gain more dodge. 
*   *Formula Idea*: `Dodge = 1 - (1 / (1 + (AGI * 0.002)))`. This allows stats to go to 999 without ever breaking the 100% barrier.

### **2. Scaling with Level**
*   Status effects (like Daze or Bleed) should scale their value based on either the **attacker's level** or a **percentage of the target's max HP**. 
*   *Example*: Bleed shouldn't be "10 damage"; it should be "2% of Max HP per turn." This keeps it relevant from Level 1 to 99 flawlessly.

---

## 🎯 The "Best Next Step"?
**Implement the INT stat and basic leveling logic first.** 

1.  **Define INT's Role**: Does it provide a new resource (Mana)? Does it increase Mutation power?
2.  **Add 3-4 Core INT Mutations**: This completes the primary "Stat Triangle."
3.  **Normalize HP/Damage**: Once all 3 stats are in, we can run a "Big Simulation" for Level 1, 50, and 99 to find the mathematical "sweet spots" for base numbers.

**My Advice**: Focus on **Feature Completion (INT)** first. Balancing is easy once the rules of the game are finished!
