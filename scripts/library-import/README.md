# Library import

How the library's entries (`public/library/`) are written from the rules pages. Nothing in an entry is written from
memory: the rules text, sources and what a trait replaces are read from the page verbatim, and only the judgment
(adjustments, where a feature shows, choices, examples) is authored by hand.

- `html2text.py` reads an Archives of Nethys page as text.
- `parse_race.py <page.txt> <books.json>` reads a race page into its standard traits, alternate racial traits (with
  what they replace) and favored class options, each with its source. Only books whose OGL notice is in
  `public/library/books.json` are kept; the rest are listed as skipped.
- `books.py` reads the section 15 notices of Paizo's OGL page (legacy.aonprd.com/openGameLicense.html) into
  `books.json`.
- `rules_pages.py` reads (and caches in `.pages/`) the spell and feat pages an entry refers to: the spells of a
  spell-like ability, the feat a trait grants.
- `gen_race.py <parsed> <author> public/library` writes a race's entries from its parse (`parsed/`) and its authoring
  file (`author/`). An item of the page the authoring file lacks, or one it has that the page doesn't, stops it.

- `auto_author_race.py <race>` drafts the items of a race's page its authoring file lacks (a book whose notice was
  added): each on the sheet, no adjustments. The library spec then flags those whose text gives numbers;
  `flagged_race.py <race>` prints them with their text (from `.pages/race-problems.txt`, the spec's race lines), and
  `patch_race.py <race> patches/race/<race>-N.json` merges what is written for them (`--where-present` for a patch of
  traits several races share). A favored class option is keyed by its class, or by its class and the start of its text
  when the class has several. An alternate the race can't take as its page says is left out with `"skip": "<reason>"`.
- `book_code.py` gives a source's book code as `books.json` keys it, whatever spelling of the title the page uses.

Traits and feats, by book (only books with a notice):

- `parse_traits.py` reads the Archives of Nethys trait lists (`.pages/traits/`, one page a category) into
  `parsed/trait/`; `fetch_feats.py` reads every feat's page (the feat list, `.pages/feat-list.html`) and
  `parse_feat.py` reads them into `parsed/feat/`. Both cut the site's book marks ("emotionUM") and editor's notes.
- `auto_author_trait.py <book>` / `auto_author_feat.py <book>` draft the book's authoring file (`author/trait/`,
  `author/feat/`) with every item it lacks; `gen_trait.py <book>` / `gen_feat.py <book>` write the entries.
- `draft_flagged.py <kind> <book> [--all]` writes what `draft_adjustments.py` reads of the flagged items' text (the
  rules' fixed forms: "+1 trait bonus on Bluff and Diplomacy checks", "... to notice traps or ambushes", "one of these
  skills (your choice) is a class skill"); an item whose text gives no number is told so in its description. The rest
  is written by hand: `patch_items.py <kind> patches/<kind>/<n>.json` (by slug or name, in whichever book has it).

To change an entry, edit its authoring file and run `gen_race.py` again, then `npm run library` and `npm test`: the
library spec holds every entry to the validator, the AI's own checks, its text and its examples on the engine.

Fetching a race page:

    curl -sL -A "Mozilla/5.0" -o .pages/dwarf.html "https://aonprd.com/RacesDisplay.aspx?ItemName=Dwarf"
    python3 -I html2text.py .pages/dwarf.html > .pages/dwarf.txt
    python3 -I parse_race.py .pages/dwarf.txt ../../public/library/books.json > parsed/dwarf.parsed.json
