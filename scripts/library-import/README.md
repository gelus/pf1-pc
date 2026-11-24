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

To change an entry, edit its authoring file and run `gen_race.py` again, then `npm run library` and `npm test`: the
library spec holds every entry to the validator, the AI's own checks, its text and its examples on the engine.

Fetching a race page:

    curl -sL -A "Mozilla/5.0" -o .pages/dwarf.html "https://aonprd.com/RacesDisplay.aspx?ItemName=Dwarf"
    python3 -I html2text.py .pages/dwarf.html > .pages/dwarf.txt
    python3 -I parse_race.py .pages/dwarf.txt ../../public/library/books.json > parsed/dwarf.parsed.json
