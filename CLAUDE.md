# PF1 Character App — design decisions

An Angular 19 app for Pathfinder 1e characters: a sheet, a rules engine and an AI (Gemini, through Firebase AI Logic)
that creates, levels and plays characters with the player. This file records the design decisions made so far.
Read it before changing the engine, the rules or the AI layer, and update it when a significant decision is made.

## The goal, and the rule that follows from it

The goal is an AI system that **understands the rules of Pathfinder and has the tools to create and build any
character in the system, whatever is thrown at it**: any race, class, feat, trait, spell or item, including
ones the app has never seen. So everything has to scale. Nothing should be tailored to one named feature.

**Fix the actual problem, never with a one-off.** When something comes out wrong for one feat, trait, race, class or
item, find the general mechanism it exposed and fix that. The specific case should then come out right with no
special code.

- Example: Magical Knack's +2 caster level went nowhere. The fix was not a Magical Knack special case. Caster level
  became a stat that features adjust like any other: `spells.<class>.casterLevel` and `spells.*.casterLevel`, with
  variants for situations such as Elven Magic's `spells.*.casterLevel[vs. spell resistance]`. The engine also finds a
  caster by its class however its name is capitalized (`casterPath`). Every caster level bonus now works.
- Example: Track's half level with no minimum, and Studied Target's +1 that never grew. These were fixed once with
  per-feature formula corrections (19b76ae). That was the wrong fix, and it was replaced (c123890): the AI fills a
  form from the rules page (`gained_at`, `grows` as the class table's column, `uses_by_level`), and the app fits the
  formula the same way for every feature (`ai/feature-form.ts`).
- Example: tables of the core races' speeds, rage's uses, armor categories and class alignments were removed
  (310e8bf). In their place are general requirements (a race needs speed, size and languages; armor needs its
  category; a class's alignment is read from its page) that hold for any race, class or item.

What this means in practice:

- No `if (name === 'Some Feat')` in the engine, the rules or the AI checks. No tables keyed by feature, race or item
  name. If a fix needs a name, the abstraction is missing. Add the path, mode, rule hook or form field instead.
- When a rule can't be expressed, extend the **adjustment language** (a new path, a mode, a special value or a
  formula reference) or add a **rule module**. Don't patch the result.
- The checks read the text the way a rule is written ("+N on X", "saves" meaning all three, "proficient with"), not
  a list of known features. They use what the engine and schema already know (the skill list, `casterNumberFields`).
- When an audit of a saved log turns up a failure, ask what class of input breaks this way, and fix that class.

## The flow of data: raw character → applied character

```
raw Character (JSON, saved in localStorage as character-<id>)
   │  ApplyCharacterService.raw: WritableSignal<Character>    every change goes through update(), one undo step
   ▼
ApplyCharacterService.applied = computed(() => applyCharacter(raw))
   │  rebuilt from scratch on every change. the raw character is never mutated by the engine
   ▼
applied Character  ──► the sheet (stat-total.ts totals each stat for display)
                   ──► the AI (character-reader.ts reads the same totals and tooltips)
adjustmentsMap     ──► tooltips: every entry that adjusted a path, its origin, type, mode, overwritten flag
```

The **raw** character is the source of truth. It is what's saved, what the undo history holds, and what every
edit, play action and AI tool changes. The **applied** character is derived and never saved. Fields that only
the rules work out (a spell level's `base`, `bonus`, `known` and `dc`; a caster's `maxSpellLevel`; the display entries
made from `shownIn`) exist only on the applied character. To change something the player sees on the applied
character, change the raw object behind it. `rawFeature()` finds it by id.

### `applyCharacter` step by step (`src/app/apply-character.service.ts`)

1. **Copy and defaults.** Deep-copy the raw character, then `ensureCharacterDefaults` (skills, knowledge specialties,
   open skill families). Snapshot `baseChar`, which is what a `set` adjustment replaces.
2. **Class skills** from each class level's `classSkills`.
3. **Resolve features and conditions** (`resolveFeaturesAndConditions`). This collects every active feature,
   including the features nested in other features' adjustments, to get the active names that `if`/`unless` test. It
   also collects the conditions granted by features and by the rules' `conditions` hook, then resolves severity groups,
   inclusions and duplicates.
4. **Rule hook `base`.** Features the rules derive from the raw data alone (BAB and saves from class progression, hit
   points, ability damage).
5. **Class level features**, then the **feature lists** in `FEATURE_LIST_LOCATIONS` order: `race.features`,
   `conditions` (the effective ones), `feats`, `specialAttack`, `traits`, `drawbacks`. Then the features of
   **equipped items**, each named after its item when left unnamed. Conditions pushed late are applied too.
6. **Deferred adds.** Formulas that read `{mod:…}`/`{stat:…}` and adjustments of every attack (`melee.*`,
   `ranged.*`) are applied now, once all the attacks exist and the scores are in.
7. **Skill selectors** (`skills.*`, `skills.@dex`, family wildcards) expanded and applied.
8. **Finalize.** First the `set`s (in order, the last wins), then the `min`/`max` bounds, then armor speed and
   encumbrance (they need the final Str and size), then the bounds a load caps (max Dex, ACP).
9. **Rule hook `final`.** Features that need final values (size, BAB). They are resolved right away, sets and
   bounds included.
10. **Speed reductions** (`half`, `reduced`), each applied once, last.
11. **Rule hook `finalize`.** Direct writes for what isn't an adjustment (iterative attacks, spell slots and DCs).
12. **Display and uses.** Variant overwritten flags are settled, `applyShownIn` places race and class features on
    the sheet, and `applyExtraUses` adds `extraUses` to charges.
13. **`finalConditions`.** If a rule gives a condition from final values (dying below 0 hp), the whole character is
    worked out once more from step 1 with that condition in place. A rule giving one must not read what that
    condition changes, so it doesn't loop.

### Rule modules (`src/app/rules/`)

Game rules that follow from the character's data are **rule modules** (`rule-module.ts`). A module returns
ordinary `Feature`s, which the engine applies like any other feature, so a rule's effect shows in the tooltips under
its name (`ruleFeature(origin, adjustments)`). The hooks are `conditions`, `base`, `final`, `finalize` and
`finalConditions`. Each module is one file, registered with one line in `rules/index.ts` (order matters:
`damageTakenRule` is last because it reads the final max hp). A module that throws is logged and skipped, so one
broken rule doesn't break the sheet. New rules go here, not into the service.

## Adjustments: how targeting works

A `Feature` is `{id, name, description, adjustments, active?, charges?, shownIn?}`. `adjustments` maps a **path**
to a **value**. The full, generated reference is `pf1.reference()` in the browser console
(`rules/adjustment-reference.ts`). `pf1.validate` and the AI builders check adjustments against
`rules/adjustment-schema.ts`. The engine itself silently skips a path it can't use, so always validate what
is written by someone other than the code.

### Paths

- A **dot path into the Character**: `ac`, `saves.will`, `abilityScores.str`, `speed.land`, `hp`, `bab`, `cmd`,
  `initiative`, `skills.stealth.value`, `skills.knowledge.subSkills.arcana.value`, `proficiencies.weapons`,
  `energyResistance.fire`, `damageReduction.magic`, `spellSchoolDcBonus.evocation`, `availableCombatOptions.powerAttack`,
  `bonusFeats`, `bonusSkillRanks`, `extraUses.<feature name>`.
- **Wildcards**: `melee.*.toHitBonus` and `ranged.*.damageBonus` hit every attack, each bounded on its own.
  `spells.*.casterLevel` hits every caster.
- **Attack selectors**: `melee.@longsword.toHitBonus` and `ranged.@bows.damageBonus` hit the attacks of one kind of
  weapon, one weapon group or one weapon by name (`attackMatches`: an attack's `weapon`, `groups`, then the words of its
  name). Weapon Focus, Weapon Training and a bane weapon use them. Each one becomes an entry for every attack it picks
  (`melee.2.toHitBonus`), so the attack's tooltip shows it and modes reach it. `create_item` records a weapon's
  `weapon` and `weapon_groups` from its page.
- **Skill selectors**: `skills.*.value` (every skill) and `skills.@dex.value` (every Dex-based skill), plus open
  families (craft, perform, profession). These resolve after everything else.
- **Casters**: `spells.<origin>.casterLevel`, `.concentration`, `.dcBonus`, `.spells.<n>.perDay.total`. The
  origin is matched case-insensitively against the character's casters and its class casters. A whole caster, spell
  level or spell given as an adjustment is **merged** by origin, spell level and spell name, never replaced.
- **Variants**, `path[situation]`: `saves.will[vs. fear]` or `skills.survival.value[follow tracks]`. A variant is a
  conditional bonus. It is listed in the tooltip and never added to the total. Variants always add.
- **Speeds**: `speed.land`, `speed.swim`, `speed.fly`, `speed.climb`, `speed.burrow`, plus `flyManeuverability`
  (text, the best one given counts). `rules/movement.rule.ts` adds what the rules attach to any creature's speeds: +8
  racial on Climb and on Swim for a climb or swim speed, and the maneuverability's modifier on Fly. The AI's stat reader
  takes "climb" as the skill and "climb speed" as the speed.
- **Senses** are data (`rules/senses.ts`): `senses.<sense>` with its range in feet (0 for low-light vision, scent).
  Two sources of a sense keep the longest range, never the sum. A text of them (`"senses": "darkvision 60 ft."`, and
  older saves) is read into them.
- **`ac`** also adjusts `touchAc` and `flatFootedAc`, unless the bonus type is dropped from them
  (`touchAcIgnoredBonusTypes`, `flatFootedAcIgnoredBonusTypes`, the `dex` type).

### Values

- A **number**, a **boolean** (turns a flag on), **text** (appended with a space), or a **list** (pushed onto an
  array: `languages`, `immunities`, a feature list).
- A **formula** (`utils/object.util.ts` → `evaluateVal`): `{bab}`, `{level}`, `{level.rogue}`,
  `{mod:abilityScores.cha}`, `{stat:abilityScores.dex}`, `+ - * /`, `floor ceil round abs min max`. Division
  isn't rounded, so write `floor(...)` or `ceil(...)` as the rule says. A formula that can't resolve is NaN.
- **Special values**: `half`, `reduced` (speeds, applied last) and `auto-fail` (checks).
- **Typed and moded**: `{value, type?, mode?, if?, unless?}`.
  - `type` is a bonus type. Bonuses of one type don't stack, and only the highest applies (`bonusStackingKey`).
    Untyped and dodge bonuses stack. Circumstance bonuses stack unless they come from the same feature. A
    losing bonus is kept and marked `overwritten`, so the tooltip shows it crossed out.
    The engine settles the bonuses of one path. A number made of several paths (a save with `savingThrowBonus`, a skill
    with `skillCheckBonus`, an attack with `attackRollBonus`, `melee.*` and its own index) is settled where it's added
    up, with `notStacking`. That happens in `notStackingEntries` for the sheet's stats and the AI's reader, and in the
    attacks rule for attack parts. A morale +2 to every save and a morale +1 to Will give Will +2, and Fort and Ref
    keep their +2.
  - `mode`: `add` (the default), `set` (replaces the base value; adds still add on top; the last set wins), `min`
    (caps; the lowest cap wins), `max` (floors; the highest floor wins, even over a cap). Modes reach any number on the
    character, including caster numbers and per-attack fields. They don't reach what the sheet adds at display time
    (ability modifiers, ranks, the base 10).
  - `if` / `unless`: one or more feature names (case-insensitive). The adjustment applies only while those
    features are (or aren't) active.

### Features inside features

An adjustment can give whole features: `feats`, `specialAttack`, `defensiveAbilities`, `specialQuality`,
`conditions`, `melee`, `ranged`, a caster. They're pushed onto the applied character's list. A class feature giving
Rage, an item giving Uncanny Dodge and a condition granting another condition all work this way. Features that the
player switches on and off keep their toggle (`active: false` until switched on) and their bonuses **on the entry
they give**. That entry is where the sheet shows the checkbox, and the class feature itself has no checkbox.
`charges` (`{total, current, per: 'day'|'encounter'|'none', label}`) live on the entry too. A rest refills
`day` and `encounter` charges.

Entries that features give in `defensiveAbilities` and `specialQuality` are applied after the equipped items, like
`specialAttack` entries. The character's own entries in those two lists are display only: older saves keep copies of
their class features there, and applying them would count them twice.

### Changing shape

A form (a polymorph spell, wild shape) is a condition with `form` (`{meldsGear?, noCasting?, from?}`), kept off until
the character changes into it. `rules/forms.ts` and the engine hold to the polymorph rules for any form:
- **One form at a time.** The last one switched on counts, and `setFeatureActive` turns the others off.
- **The original form is set aside.** The race's natural attacks, movement types other than land, and senses don't
  apply while a form is on.
- **A form that melds gear** gives no armor or shield bonuses from any item, no armor penalties, and no weapon attacks.
  Other constant item bonuses keep working.
- **Casting.** A form with `noCasting` warns when a spell with verbal or somatic components is cast, unless the
  character has `castsInAnyForm` (Natural Spell).

What a form set aside is on `applied.setAside`, so the sheet greys it out (melded items and attacks, the Forms group
under the conditions). An attack's `sizedFor` says what size its dice are for (a creature's stat block), and they scale
from there.

### Several characters at once, and companions

`CharacterRegistry` works out the characters the app shows at once.
- **The open sheet** uses the app's `ApplyCharacterService`, as everything on the sheet does.
- **Any other character** shown (a companion's side bar entry, its hit points dialog) gets an `ApplyCharacterService`
  of its own, with its own undo history.
- **Opening a character** (`openCharacter`) hands its data and history to the open sheet, and keeps the one it leaves.
  Undo histories hand over by `state()` and `load()`.

A companion (`rules/companions.ts`: cohort, familiar, animal companion, mount, eidolon) is a character of its own:
- **The link.** It has a `master` link (the master's id, the kind of companion, and a `copy` of what its rules read from
  the master: levels, max hp, BAB, base saves, skill ranks), and the master lists it in `companions`.
- **The copy.** It is refreshed whenever the master changes and when the companion opens, with `sync()`, which is no
  undo step. So every sheet stays worked out from its own data alone.
- **The side bar** (`party/`) lists the master and its companions, collapsible. Each entry is a letter over an hp bar,
  with a pop-out of name, init, AC, saves and hp that opens that character's hit points dialog.
- **Reusable parts.** The hp bar, hp text and hit points dialog (`hit-points/`) take the character they show.
- **The character list** shows companions under their master. Deleting a master asks whether its companions go too.
- **A companion's kind has its own rules**, as warnings (`companionWarnings`: a cohort is at least 2 levels below its
  leader). The AI is told what it builds (`companionLine`) in the creation's opener and steps. The master's level up
  says its companions may advance. A companion is created from the side bar, by hand or with the AI (`?create=ai`,
  which the sheet and the chat now follow as it changes, not only when they are first built).
- **A companion whose levels come from its master** (`advancesWithMaster`: every kind but a cohort) never levels up on
  its own. It counts the levels of the master's classes that grant it (`link.classes`, `masterClassLevel`), which are
  picked in the add dialog, on its sheet, or with `set_companion`. Its creature (a cat, a wolf) is its race and its
  own scores: `set_race` asks a creature for no languages or racial modifiers, and its scores may be 1–40.
- **A familiar** (`rules/familiar.rule.ts`) has half its master's hp, its master's BAB, the better of the two base
  saves, the better of the two skill ranks (its six class skills get +3), and natural armor, Int and abilities by
  master class level. The AI creates one by its own script (`ai/companion-scripts.ts`: the creature, the master's
  classes, its name), run by the creation's steps (`stepsOf`, `startingProgress`).
- **An animal companion** (and a mount, `rules/animal-companion.rule.ts`) works at its effective druid level
  (`companionLevel`: master class level + the class feature's `levelOffset`, a ranger's -3). Its Hit Dice come by level
  (the one column that isn't a formula), and from them, as an animal's: average d8 hp with Con, 3/4 BAB, good Fort and
  Ref, a skill rank and half a feat a HD. It gets +2 natural armor and +1 Str/Dex every 3 levels, bonus tricks, its
  abilities, and ability increases at 4/9/14/19 (`link.increases`, warned of until picked). Its 4th- or 7th-level growth
  is a racial trait with `atLevel` (a feature applies from that level: a companion's own, or the character level).
- **A mount** is an animal companion at its class's level. What its class feature adds is written from that feature's
  text as racial traits of the mount, with `atLevel` (`create_feature` in `race.features`); in a companion's formulas
  `{level}` is its own level ("SR = paladin level + 11" is `{level} + 11`). What the class feature takes away is listed
  in `link.without` (a cavalier's mount: Share Spells). No class is coded.
- **An eidolon** (`rules/eidolon.rule.ts`, both summoners, tables read from d20pfsrd) works at its summoner level. Its
  Hit Dice, armor bonus, evolution pool (smaller for the Unchained) and max attacks come by level. From the Hit Dice,
  as an outsider's: average d10 hp, BAB = HD, its base form's good saves (`link.goodSaves`), 6 + Int ranks a HD, feats.
  Its base form (and Unchained subtype) is its race. Its evolutions are racial traits with a `cost` (0 for free ones,
  `atLevel` for a subtype's or a level minimum). `eidolonWarnings` holds them to the pool (all spent), the max attacks
  (natural ones; an Unchained eidolon's every attack roll), levels and prerequisites, as warnings. A companion table's
  natural armor is typed `natural armor increase`, so it stacks with its creature's natural armor (touch AC takes
  neither).
- **A synthesist** (`rules/synthesist.ts`, read from d20pfsrd and Archives of Nethys) is a summoner whose eidolon has
  `link.synthesist`. The registry keeps a **Fused** form on the summoner (`form.fusedWith`, `meldsArmor`), copied from
  the eidolon whenever either changes. While fused the summoner has:
  - the eidolon's Str, Dex and Con (its own race's physical modifiers set aside) and BAB (the difference from its class
    BAB)
  - its size, natural armor, speeds, senses, natural attacks and evolutions
  - its current hp as temporary hp (damage is taken on the eidolon's own sheet)
  - its own mind, saves, skills, feats and gear, but no worn armor

  The summoner's "while fused" features use `"if": "Fused"`. The eidolon stays in the side bar, marked "fused".

## Where a feature shows on the sheet

- **Feats, traits, drawbacks, conditions** show in their own lists on the sheet.
- **Race and class features** don't show by themselves. Each one is placed by `applyShownIn`:
  1. `shownIn` set: it's listed in that section, `specialAttack` (what it does in a fight: sneak attack, smite, rage),
     `defensiveAbilities` (what protects it: evasion, uncanny dodge) or `specialQuality` (everything else: track,
     wild empathy). `hidden` lists it nowhere (bookkeeping).
  2. Else, if its adjustments give an entry in one of those lists, it shows there, once, as that entry.
  3. Else it shows in the **special qualities**.
- The entry `applyShownIn` makes keeps the feature's own `id`, so spending a use or flipping a toggle on the sheet
  changes the raw feature. **Nothing is written twice**: don't store a copy of the feature as an entry just to show
  it. Set `shownIn` instead. The AI gives `shown_in`, which `mechanics.ts` normalizes. The feature editor's section
  select sets it as well.
- Bookkeeping adjustments (`bonusFeats`, `bonusSkillRanks`, `proficiencies.*`, `classSkills`, `languages`,
  `favoredClass`) are counted by the sheet and don't need a display entry.

## The AI layer (`src/app/ai/`)

- **The AI never works out a number.** It reads the engine (`character-reader.ts` gives the same totals and
  tooltips as the sheet) and changes the raw character through tools (`ai-tools.ts`), each change one named undo
  step. Play actions go through the same service calls the sheet uses.
- **Rules come from the page, not from memory.** `rules-lookup.ts` reads Archives of Nethys or d20pfsrd. Features and
  items are built from that text and checked against it.
- **The AI fills forms, the app writes formulas.** The AI reads tables well and writes formulas badly, so for
  numbers that grow it gives values by level (`feature-form.ts`), and the app fits and verifies the formula.
- **Validate and refuse, with every problem at once.** Builders (`builders.ts`, `editors.ts`, `mechanics.ts`) check
  what the AI writes with the same validator as `pf1.validate`. They refuse it with all of its problems and the
  guides (`PATHS_GUIDE`, `MECHANICS_GUIDE`), so the next try can be right. A feature whose text gives a number the
  sheet keeps must adjust that path. `descriptionOnly` is for rules judged at the table, not for paths the AI couldn't
  find. "No path:" and "no uses:" answer a demand the text really doesn't support.
- **Any class casts.** A class without a preset gives its `spellcasting` from its page: its ability, prepared or
  spontaneous, arcane or divine, and either a core table it shares (`"table": "sorcerer"` for an oracle) or its own
  rows (`perDay`, `known`, by class level). The rules read the tables through `SpellTableSource`, so no class needs to
  be known to the app. A caster's choices (a specialist's school and oppositions, a cleric's domains) are required at
  its first level. A class feature may not add a fixed number to its own class's caster level or spells per day
  unless its text gives one; the levels already give them.
- **Archetypes are data on the class level.** A level keeps the archetypes taken at it (`ClassLevel.archetypes`:
  what each replaces and alters, by the class's feature names, and the class skills and proficiencies it changes).
  The archetype's own features are just that level's features. `rules/archetypes.ts` holds the rules of any archetype:
  a replaced feature is refused at every later level, two archetypes can't trade one feature, an archetype comes before
  the features it trades, proficiency changes come at the class's 1st level. The AI (`ai/archetypes.ts`) and the class
  levels editor's Archetypes section both take an archetype by them; the editor tells what breaks them, never refuses.
  An archetype may replace nothing (a totem warrior), said as `"replaces": "none"`. The archetype page is read into a
  `FACT: replaced features` line that the AI's list is held to, holding only what the page says in so many words. Names are matched by `featureKey` ("Bravery +1" is
  bravery). An archetype that changes casting gives `spellcasting`: `"none"`, or only what changes
  (`{"ability": "int"}`, `{"spells_per_day_change": -1}`, `{"extra_slot": "none"}`). The change is merged over the
  class's own (`spellcastingFrom` with a base), kept on every level of the class, and applied again when
  `set_class_spellcasting` replaces the class's casting.
- **Alternate racial traits work the same way.** A racial trait has `replaces` (`Feature.replaces`), and the traits it
  replaces are left out. `racialTraitProblems` (`ai/page-facts.ts`) refuses a replaced trait kept alongside its
  replacement, a trait replaced twice, and a replaced name that isn't a standard trait. It also refuses an alternate
  the page lists whose `replaces` differs from the page's. The race page is read into `FACT: alternate racial traits`.
- **Prestige classes.** A prestige class's first level keeps its `requirements` (its page's, read into a `FACT:` line).
  `unmetRequirementsOf` (`rules/prerequisites.ts`) checks them: an alignment, ranks in a skill, a spell level it casts
  (arcane, divine or any), BAB, ability scores, and feats and class features by name. Unmet requirements refuse the
  level, as a feat's do. Its levels are `prestige` (good saves start at +1). A level giving "+1 level of existing
  spellcasting class" has `advancesCasting` (the class or classes), which the spellcasting rule counts for that class's
  spells per day, spells known and caster level only (`classCasters`).
- **Metamagic** (`rules/metamagic.ts`): a metamagic feat carries `metamagic: {levels, heightens?}` from its page. A
  prepared caster prepares the spell in the raised slot (`PreparedSpell.metamagic` and `level`, the spell's own). A
  spontaneous caster's cast spends a slot of the raised level, noted as a full-round action.
- **Items that cast** (`rules/spell-items.ts`, `spell-items.ts`): `Item.casts` is a wand, scroll, staff or potion with
  its spells (level, caster level, a staff spell's charge cost) and charges.
  - **Using one** spends charges or uses it up. The DC is 10 + level + the least ability modifier for that level; a staff
    uses its wielder's caster level and ability when higher.
  - **Use Magic Device** and a scroll's caster level check are told, never refused.
  - **A staff** recharges from a caster's slot.
- **Crafting** (`rules/crafting.ts`): half the base price (masterwork in full), a day a 1,000 gp (2 hours for a cheap
  potion or scroll), Spellcraft DC 5 + caster level (+5 a missing requirement). Never refused; gold only from Pay. The
  AI's `craft_item`, or the inventory's Craft Item dialog.
- **Spells are built like features.** `add_spells`, `prepare_spells`, `remove_spells`, `set_caster_choices` and
  `set_class_spellcasting` (`ai/spells.ts`) check what the caster can have (levels it casts, spells known, a domain
  spell's domain). Spell-like abilities go on the feature that gives them (`spell_like_abilities`, `ai/spell-form.ts`),
  each with its own `uses` (`Spell.uses`), spent as it's cast and refilled by a rest.
- **Lookups reach any page.** Class options have kinds of their own (mystery, bloodline, domain, arcane school; curses,
  hexes, talents and discoveries on their list pages; a revelation `within` its mystery). Every read returns the
  page's links, so the AI can follow them to anything no name finds.
- **Facts are checked against a second reading of the page.** The browser can't fetch the rules sites, so the page is
  read by the provider. Class, race and feat pages are also read into fixed `FACT:` lines (hit die, skill ranks,
  starting wealth, class skills, proficiencies; standard racial traits; prerequisites). `ai/page-facts.ts` holds what
  the AI wrote against them. A fact read wrong is read again, and the newest reading replaces it.
- **Gear weighs what it weighs for the character.** A weight is per piece. Ammunition weighed by the bundle is divided
  by its count, and a Small or Large character's weapons and armor are sized from the page's Medium weight. A
  character can be made under any load, and the AI is told to say what the load does.
- **Alternate favored class bonuses are race data.** A race keeps the options its page lists
  (`race.favoredClassOptions`: class, text, and what one pick adjusts, fractions included). A favored class level
  picks `'other'` plus an option id, and `rules/favored-class.rule.ts` adds up the picks and rounds down.
- **Concentration follows caster level.** An adjustment to a caster's `casterLevel` also adjusts its `concentration`
  (`derivedConcentration`); a situational variant doesn't. A bonus its text caps at the character's Hit Dice is a
  formula of the levels (`"min(2, {level} - {level.wizard})"`), never a plain number.
- **The AI is held to what the page and the player said.** Trait pages are read for their category and prerequisites
  (a drawback goes in drawbacks, a race trait is its race's). Two racial traits giving the same bonus are refused.
  A trait the page's list names that the AI can't find is read again or answered `not_on_page`, never made up.
  Lookups are capped per player turn, so the AI reads a list page with a focus instead of guessing names.
- **Creation follows the Core Rulebook steps** (`creation-script.ts`). Each step's changes are held until the player
  answered it, and `character-check.ts` (no AI in it) must pass before the creation ends. Errors hold it open, and
  warnings go to the player. An AI that ends its turn with its step open (changes made and no question, or telling the
  player the character is done) is sent back once to finish it (`unfinishedStepNote`). The player's choices are held
  to the player's own words: text the app writes for the player (a point buy confirmed) is not counted as theirs.
- **A character can be made above 1st level.** The concept step sets `startingLevel` (`set_character_details
  starting_level`). Its 1st level is built as usual and its other levels at the "Higher levels" step. That step holds
  until every level is in with its ranks, feats and ability increases, and it is checked by several requirement groups
  (`checks: ['class', 'skills', 'feats', 'level']`). Its gear is bought with the Core Rulebook's wealth by level
  (`rules/starting-wealth.ts`, `startingWealthOf`) instead of the class's gold. One item costing more than half of that
  is warned of. The character ends with the XP of its level.
- **Retraining is told, never refused** (Ultimate Campaign). `rules/retraining.ts` gives each kind's days and cost
  (10 gp × level × days) from rules that hold for any class. The class-pair synergy table isn't encoded; the AI reads
  it from the page. `retraining.ts` (outside `ai/`) makes each kind of swap as one undo step, with its quote and
  warnings. The sheet's Retrain dialog and the AI's `retrain` tool share it, so everything the AI does can be done by
  hand. A new feat, feature or spell is written in the sheet's own editors. The gold leaves the purse only through a
  Pay button (`payGold`), in the dialog or in the chat. A feat keeps its `prerequisites` (`rules/prerequisites.ts`),
  so a retraining warns of feats that needed what it took away, or that no longer qualify.
- **A level up follows the same steps machinery** (`level-up-script.ts`): class level, ability increase, skill ranks,
  feat, spells, review. A step is skipped when the level doesn't need it. Progress is kept in `raw.levelUp`
  (`script: 'level-up'`, `fromLevel`), so the chat stays in play mode. The step runtime in `creation-script.ts` (the
  gate, completing a step, completing it from a change) runs on whichever script `progressOf` finds. A level up adds
  one level, and its steps are checked by the creation's requirements (`checks`). The end check is
  `checkLeveledCharacter`: problems the character had when the level up started (`known`) are warnings, so a
  character made by hand can level up.
- **Provider-agnostic.** `ai-provider.ts` is the interface and `gemini-firebase.provider.ts` is the adapter. The AI
  chunk loads lazily, off the first bundle.

## Working conventions

- Unit tests: `npm test` (Karma, headless Chrome). E2E on macOS 13: `npx playwright test -c playwright.local.config.ts`.
- `pf1.*` console commands: `reference`, `validate`, `importCharacter`, `importExample`.
- The adjustment schema documents every Character field, and a spec fails when a new field isn't documented. When
  adding a field, document it in `adjustment-schema.ts`.
- Characters saved in old shapes are migrated in `initializeCharacter` (spell arrays, damage reduction lists).
  Keep old saves loading.
- Comments in this codebase say *what something is and why*, in plain prose, often naming the case that motivated it.
