const MUTATION_TYPES = {
  // --- EXISTING / GOOD ---
  'Bloodletting': Bloodletting, // bleed dot
  'Corrosive Touch': CorrosiveTouch, // corrosive dot
  'Momentum': Momentum, // str dmg
  'Assassinate': TimeWarp, // (Mapped to your TimeWarp class)
  'Second Wind': SecondWind, // heal
  'Quick Reflex': QuickReflex, // dodge chance
  'Echo Strike': EchoStrike, // works awesome now, looks cool on agi
  'Lifetap': Lifetap, // lifesteal and taking dmg, lower hp more dmg / might need tuning
  'Thorn Skin': ThornSkin, // thorn reflect

  // Rework maybe
  'Adrenaline Rush': AdrenalineRush, // dmg when hp < 30%
  'Brutal Strike': BrutalStrike, // need animation TODO more testing

  // --- NEW STRENGTH BASE ---
  'Thick Hide': ThickHide, // Flat damage reduction scaling with STR
  'Berserker': Berserker, // Could stagger timings nerf it? seems weaker now 
  'Iron Will': IronWill,

  // --- NEW AGILITY BASE ---
  'Phantom Step': PhantomStep,
  'Staggering Blow': StaggeringBlow,

  // TESTING PHASE
  'Bloodthirst': Bloodthirst,

  // NEW INT
  'Magic Shield': MagicShield,
  'Mind Blast': MindBlast,
  'Blizzard': Blizzard,
  'Reality Fracture': RealityFracture,
};