import { Component, ElementRef, HostListener, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {abilityModifier} from '../ability-mod.pipe';
import {Character} from '../utils/character.class';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {Feature, Skill, sizes} from '../interfaces/character.interface';
import {InventoryListComponent} from '../inventory-list/inventory-list.component';
import {SkillListComponent} from '../skill-list/skill-list.component';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {ApplyCharacterService} from '../apply-character.service';
import { ConditionsService } from '../conditions.service';
import {AttackComponent} from '../attack/attack.component';
import {JsonModalComponent} from '../json-modal/json-modal.component';
import {FeatureListComponent} from '../feature-list/feature-list.component';
import {SpellCastingListComponent} from '../spell-casting-list/spell-casting-list.component';
import {Attack} from '../utils/attack.class';
import {characterLevel} from '../utils/classlevel.class';
import {levelUpAvailable, nextLevelXp, xpForLevel} from '../rules/experience';
import {availableFeats, pendingAbilityIncreases} from '../rules/class-progression';
import {DefensesComponent} from '../defenses/defenses.component';
import {CombatOptionsComponent} from '../combat-options/combat-options.component';
import {traitsAllowed, traitsUsed} from '../utils/background.util';
import {ABILITIES, Ability, abilityLabel} from '../rules/ability-damage';
import {currentHpChange} from '../rules/damage-taken';
import {
  LONG_TERM_CARE_DESCRIPTION, REST_DESCRIPTIONS, REST_KINDS, REST_LABELS, RestKind, TEMPORARY_HP_NOTE, restBlockedBy,
} from '../rules/rest';


import {skillAdditional} from '../stat-display/stat-total';
import {AiChatComponent} from '../ai-chat/ai-chat.component';
import {ConditionPickerComponent} from '../condition-picker/condition-picker.component';
import {ChatRequestsService} from '../ai-chat/chat-requests.service';
import {ThemeMode, ThemeService} from '../theme.service';
import {RaceModalComponent} from '../race-modal/race-modal.component';
import {AlignmentModalComponent} from '../alignment-modal/alignment-modal.component';
import {alignmentDescription, alignmentName, alignmentTooltip} from '../rules/alignments';
import {TipDirective} from '../tip/tip.directive';
type SheetTab = 'sheet' | 'skills' | 'equipment' | 'bio';

@Component({
  selector: 'app-character-sheet',
  imports: [
    AiChatComponent,
    ConditionPickerComponent,
    TipDirective,
    CommonModule,
    FormsModule,
    RouterLink,
    AddFeatureModalComponent,
    InventoryListComponent,
    SkillListComponent,
    StatDisplayComponent,
    AttackComponent,
    JsonModalComponent,
    FeatureListComponent,
    SpellCastingListComponent,
    DefensesComponent,
    CombatOptionsComponent,
    RaceModalComponent,
    AlignmentModalComponent,
  ],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.sass'
})
export class CharacterSheetComponent {

  sizes = sizes;
  characterLevel = characterLevel;
  nextLevelXp = nextLevelXp;
  levelUpAvailable = levelUpAvailable;
  availableFeats = availableFeats;
  pendingAbilityIncreases = pendingAbilityIncreases;
  advancementTracks = ['slow', 'medium', 'fast'];
  traitsAllowed = traitsAllowed;
  traitsUsed = traitsUsed;
  abilities = ABILITIES;
  abilityLabel = abilityLabel;

  restKinds = REST_KINDS;
  restLabels = REST_LABELS;
  // a caregiver tends the character while it rests (long-term care), see rules/rest.ts
  restLongTermCare = false;

  // a dead or dying character can not rest
  restBlocked(char: Character): 'dead' | 'dying' | undefined {
    return restBlockedBy(this.character.raw(), char);
  }

  // what a rest does, or why the character can not rest
  restTitle(kind: RestKind, char: Character): string {
    const blocked = this.restBlocked(char);
    if (blocked) return blocked === 'dead' ? 'A dead character can not rest.' : 'A dying character can not rest, stabilize it first.';
    return [REST_DESCRIPTIONS[kind], this.restLongTermCare ? LONG_TERM_CARE_DESCRIPTION : '', TEMPORARY_HP_NOTE]
      .filter(Boolean).join('\n');
  }

  // a rest taken closes the dialog: the sheet shows what came back, and Undo takes it back
  rest(kind: RestKind): void {
    this.character.rest({kind, longTermCare: this.restLongTermCare});
    this.closeRest();
  }

  // the rests, in a dialog opened from the line under the name. it says when the character rested, the sheet shows the rest
  restOpen = signal(false);
  restDescriptions = REST_DESCRIPTIONS;
  temporaryHpNote = TEMPORARY_HP_NOTE;

  closeRest(): void {
    this.restOpen.set(false);
  }

  // damage is whole points and never negative
  toPoints(value: any): number {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  // the attacks with the best first attack roll first, attacks keep their order on a tie. only the sheet sorts them,
  // the character keeps its attacks in order: adjustments name an attack by its place (melee.0.toHitBonus)
  byToHit<T extends Attack>(attacks: T[]): T[] {
    const first = (attack: T): number => attack.result?.attackBonuses?.[0] ?? -Infinity;
    return [...attacks].sort((a, b) => first(b) - first(a));
  }

  // what a condition the rules gave does, and why the character is under it
  ruleConditionTooltip(condition: Feature): string {
    const why = [condition.source, condition.reason].filter(Boolean).join(': ');
    return [why ? `${condition.name} (${why})` : condition.name, condition.description?.trim()].filter(Boolean).join('\n\n');
  }

  // the character keeps the damage it took, so entering its current hp stores the damage leaving it with that much
  // (and ends its being stable once it takes more damage or is healed, see currentHpChange)
  setCurrentHp(char: Character, currentHp: any): void {
    if (currentHp === null || currentHp === '') return;
    this.character.update(currentHpChange(this.character.raw(), char, Number(currentHp) || 0));
  }

  setAbilityPoints(raw: Character, field: 'abilityDamage' | 'abilityDrain', ability: Ability, points: any): void {
    this.character.update({[field]: {...raw[field], [ability]: this.toPoints(points)}});
  }

  // a flat-footed character loses its dex bonus to ac, a dex penalty however still applies
  flatFootedAbility(char: Character): string {
    return abilityModifier(char, 'dex') < 0 ? 'dex' : '';
  }

  // the weapon and armor proficiencies of the character, each with what granted it (a class, a feat, ...)
  proficiencies(char: Character): {kind: string, names: {name: string, from: string}[]}[] {
    const sourcesOf = (kind: 'weapons' | 'armor', name: string): string[] => [...new Set(
      (this.character.adjustmentsMap[`proficiencies.${kind}`] || [])
        .filter(entry => (Array.isArray(entry.value) ? entry.value : [entry.value])
          .some((granted: unknown) => String(granted).trim().toLowerCase() === name.toLowerCase()))
        .map(entry => entry.origin)
    )];
    return (['weapons', 'armor'] as const)
      .map(kind => ({
        kind: kind === 'weapons' ? 'Weapons' : 'Armor',
        names: (char.proficiencies?.[kind] || []).map(name => ({name, from: sourcesOf(kind, name).join(', ')})),
      }))
      .filter(({names}) => names.length);
  }

  skillAdditional(skill: Skill): Array<[number, string]> {
    return skillAdditional(skill);
  }

  // the sections of the sheet, one at a time
  tabs: {id: SheetTab, label: string}[] = [
    {id: 'sheet', label: 'Sheet'},
    {id: 'skills', label: 'Skills'},
    {id: 'equipment', label: 'Equipment'},
    {id: 'bio', label: 'Bio'},
  ];
  tab = signal<SheetTab>('sheet');
  // the tabs of text, where the search marks what it finds (the others filter their rows)
  textTab = computed(() => this.tab() === 'sheet' || this.tab() === 'bio');
  tabLabel = computed(() => this.tabs.find(t => t.id === this.tab())!.label);

  // the search of the open tab: the skills and the equipment filter by it, the sheet marks what it finds (CSS highlights)
  query = signal('');
  matchCount = signal(0);
  matchIndex = signal(0);
  private matches: Range[] = [];
  private host: HTMLElement = inject(ElementRef).nativeElement;
  private browser = isPlatformBrowser(inject(PLATFORM_ID));

  // the sign a modifier shows (+3, +0), drawn by CSS so the modifier's own text stays the number
  modifierSign(char: Character, ability: string): string | null {
    return abilityModifier(char, ability) >= 0 ? '+' : null;
  }

  // how far the character is from its level toward the next one, in percent; full past level 20 or with a level to take
  xpProgress(char: Character): number {
    const next = nextLevelXp(char);
    if (next === undefined) return 100;
    const from = xpForLevel(characterLevel(char), char.advancementTrack) ?? 0;
    const xp = Number(char.experience) || 0;
    return Math.max(0, Math.min(100, Math.round((xp - from) / Math.max(1, next - from) * 100)));
  }

  // the next place on the sheet that has what was searched (Enter in the search)
  nextMatch(): void {
    if (!this.textTab() || !this.matches.length) return;
    this.matchIndex.set((this.matchIndex() + 1) % this.matches.length);
    this.showMatch();
  }

  private markMatches(): void {
    const highlights = this.browser && typeof CSS !== 'undefined' ? (CSS as any).highlights : undefined;
    const Highlight = this.browser ? (window as any).Highlight : undefined;
    if (!highlights || !Highlight) return;
    highlights.delete('sheet-search');
    highlights.delete('sheet-search-current');
    this.matches = [];
    const query = this.query().trim().toLowerCase();
    const root = this.host.querySelector('.tab-text');
    if (query && root && this.textTab()) {
      // the text of the sheet, not its tooltips
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.parentElement?.closest('.tooltip, script, style, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent || '').toLowerCase();
        for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + query.length)) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + query.length);
          this.matches.push(range);
        }
      }
    }
    this.matchCount.set(this.matches.length);
    if (this.matchIndex() >= this.matches.length) this.matchIndex.set(0);
    if (this.matches.length) {
      highlights.set('sheet-search', new Highlight(...this.matches));
      this.showMatch();
    }
  }

  private showMatch(): void {
    const range = this.matches[this.matchIndex()];
    const highlights = (CSS as any).highlights;
    if (!range || !highlights) return;
    highlights.set('sheet-search-current', new (window as any).Highlight(range));
    (range.startContainer.parentElement as HTMLElement | null)?.scrollIntoView?.({block: 'center', behavior: 'smooth'});
  }

  // the settings at the bottom left: the colour theme and the history (undo, redo)
  theme = inject(ThemeService);
  themeModes: {id: ThemeMode, label: string}[] = [{id: 'system', label: 'Auto'}, {id: 'light', label: 'Light'}, {id: 'dark', label: 'Dark'}];
  settingsOpen = signal(false);
  // the xp and the track, in a dialog opened from the level
  levelOpen = signal(false);

  // the race's editor and the alignment chart, opened from the line under the name
  raceOpen = signal(false);
  alignmentOpen = signal(false);
  alignmentTooltip = alignmentTooltip;
  alignmentName = alignmentName;
  alignmentDescription = alignmentDescription;

  // a height kept in inches, as it is said: 74 is 6 ft. 2 in.
  feetAndInches(inches: number): string {
    const whole = Math.round(Number(inches) || 0);
    return `${Math.floor(whole / 12)} ft. ${whole % 12} in.`;
  }

  // the hit points, temporary hp and nonlethal damage, in a dialog opened from the hp in the header
  hpOpen = signal(false);

  // the health bar, in percent of the max hp: the current hp, the temporary hp laid over them from the left, and the
  // nonlethal damage laid over the end of the current hp
  hpBar(raw: Character, char: Character): {current: number, temp: number, nonlethalFrom: number, nonlethal: number} {
    const max = Math.max(1, Number(char.hp) || 0);
    const pct = (n: number) => Math.max(0, Math.min(100, n / max * 100));
    const current = Math.max(0, Math.min(max, Number(char.currentHp) || 0));
    const nonlethal = Math.min(current, Math.max(0, Number(raw.nonlethalDamage) || 0));
    return {current: pct(current), temp: pct(Number(char.tempHp) || 0), nonlethalFrom: pct(current - nonlethal), nonlethal: pct(nonlethal)};
  }

  hpSummary(raw: Character, char: Character): string {
    const parts = [`${char.currentHp} of ${char.hp} hp`];
    if (char.tempHp) parts.push(`${char.tempHp} temporary`);
    if (raw.nonlethalDamage) parts.push(`${raw.nonlethalDamage} nonlethal`);
    return parts.join(', ');
  }

  // an ability's damage and drain, in a dialog opened from its name
  abilityOpen = signal<Ability | null>(null);
  abilityNames: Record<Ability, string> = {str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'};

  // an ability that took damage or drain shows its name in red, and says how much in its title
  abilityHurt(raw: Character, ability: Ability): boolean {
    return ((raw.abilityDamage as any)?.[ability] || 0) + ((raw.abilityDrain as any)?.[ability] || 0) > 0;
  }

  abilityHurtTitle(raw: Character, ability: Ability): string {
    const damage = (raw.abilityDamage as any)?.[ability] || 0;
    const drain = (raw.abilityDrain as any)?.[ability] || 0;
    const parts = [damage ? damage + ' damage' : '', drain ? drain + ' drain' : ''].filter(Boolean);
    return parts.length ? `${this.abilityNames[ability]}: ${parts.join(', ')}` : `${this.abilityNames[ability]}: damage and drain`;
  }

  abilityModifierText(char: Character, ability: Ability): string {
    const modifier = abilityModifier(char, ability);
    return (modifier >= 0 ? '+' : '−') + Math.abs(modifier);
  }

  // once the header has scrolled out of sight, a slim line of it comes back scrolling up, and goes scrolling down
  compactShown = signal(false);
  private lastScroll = 0;

  onSheetScroll(panel: HTMLElement): void {
    const y = panel.scrollTop;
    const header = panel.querySelector('.sheet-top') as HTMLElement | null;
    const past = !!header && header.getBoundingClientRect().bottom < panel.getBoundingClientRect().top;
    if (!past) this.compactShown.set(false);
    else if (y < this.lastScroll - 4) this.compactShown.set(true);
    else if (y > this.lastScroll + 4) this.compactShown.set(false);
    this.lastScroll = y;
  }

  @HostListener('document:click', ['$event'])
  closeSettings(event: MouseEvent): void {
    if (this.settingsOpen() && !(event.target as HTMLElement)?.closest?.('.settings')) this.settingsOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  escapeSettings(): void {
    this.settingsOpen.set(false);
    this.levelOpen.set(false);
    this.hpOpen.set(false);
    this.abilityOpen.set(null);
    this.closeRest();
  }

  // which panel shows when the page is too narrow for both (the rail switches them), wide pages show both
  view = signal<'sheet' | 'chat'>('sheet');
  // the AI replied while the sheet was showing, the rail marks the chat
  chatUnread = signal(false);

  openChat(): void {
    this.view.set('chat');
    this.chatUnread.set(false);
  }

  chatReplied(): void {
    if (this.view() !== 'chat') this.chatUnread.set(true);
  }

  constructor(
    private route: ActivatedRoute,
    public character: ApplyCharacterService,
    public conditions: ConditionsService,
  ) {
    this.character.initializeCharacter(new Character(this.route.snapshot.params['characterid']), true)
    // a character created with the AI opens on the chat
    if (this.route.snapshot.queryParamMap?.get('create') === 'ai') this.view.set('chat');
    // the sheet marks what the search finds, again whenever the search, the tab or the character changes
    effect(() => {
      this.query();
      this.tab();
      this.character.applied();
      untracked(() => setTimeout(() => this.markMatches()));
    });
    // a new search starts at its first match
    effect(() => {
      this.query();
      untracked(() => this.matchIndex.set(0));
    });
    // a question asked from the sheet (a stat's tooltip) is answered in the chat, which comes into view
    const requests = inject(ChatRequestsService);
    const since = Date.now();
    effect(() => {
      const request = requests.asked();
      if (request && request.at >= since) untracked(() => this.openChat());
    });
  }

  // a preset condition from the list; the list goes back to its prompt
  addPresetCondition(condition: Feature): void {
    if (condition) this.character.consumeFeature({feature: condition, destination: 'conditions'});
  }

  // a feat the character took itself (in its own list), not one another feature gives
  isOwnFeat(raw: Character, feat: Feature): boolean {
    return (raw.feats || []).some(own => own.id === feat.id);
  }

  // the tooltip of the undo and redo buttons
  historyTitle(kind: 'Undo' | 'Redo'): string {
    const label = kind === 'Undo' ? this.character.history.undoLabel() : this.character.history.redoLabel();
    return label ? `${kind}: ${label}` : `${kind} the last change`;
  }

  // ctrl+z undoes, ctrl+shift+z and ctrl+y redo. in a text field the browser's own undo of the text applies instead
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const key = event.key.toLowerCase();
    const redo = key === 'y' || (key === 'z' && event.shiftKey);
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (redo) this.character.redo();
    else this.character.undo();
  }

}
