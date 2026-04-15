const MUTATION_TYPES = {
  // --- EXISTING / GOOD ---
  'Bloodletting': Bloodletting, // bleed dot
  'Corrosive Touch': CorrosiveTouch, // corrosive dot
  'Momentum': Momentum, // str dmg, gotta check scaling TODO
  'Assassinate': TimeWarp, // (Mapped to your TimeWarp class)
  'Second Wind': SecondWind, // heal
  'Quick Reflex': QuickReflex, // dodge chance
  'Echo Strike': EchoStrike, // works awesome now, looks cool on agi
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

  // NEW INT
  'Magic Shield': MagicShield,
  'Mind Blast': MindBlast,
  'Blizzard': Blizzard,
  'Reality Fracture': RealityFracture,



  // Remake
   'Lifetap': Lifetap, // lifesteal and taking dmg, lower hp more dmg / might need tuning, change animation for melle TODO, basicly overhaul everything about it
   'Bloodthirst': Bloodthirst, // Remake and test seems boring atm
};