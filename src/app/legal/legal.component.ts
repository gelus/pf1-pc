import {Component, OnInit, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {LibraryIndex, booksOf} from '../library/library-index';

// the Open Game License the library's rules text is shipped under: the license itself (public/legal), and its section
// 15, the copyright notice of every book an entry of the library cites (public/library/books.json), so adding an
// entry from a new book adds its notice here
const LICENSE_NOTICES = [
  'Open Game License v 1.0a Copyright 2000, Wizards of the Coast, Inc.',
  // as Paizo's own reference document gives it
  'System Reference Document. Copyright 2000, Wizards of the Coast, Inc.; Authors Jonathan Tweet, Monte Cook, Skip '
    + 'Williams, based on material by E. Gary Gygax and Dave Arneson.',
];

@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  template: `
    <div class="pf-brandbar"></div>
    <main class="legal-page">
      <p><a routerLink="/">← Your characters</a></p>
      <h1>Open Game License</h1>
      <p>The rules text of this app's library is Open Game Content, used under the Open Game License v1.0a below.
        This app uses trademarks and/or copyrights owned by Paizo Inc., used under Paizo's Community Use Policy. It is
        not published, endorsed, or specifically approved by Paizo Inc.</p>
      <pre class="legal-text">{{license()}}</pre>
      <h2>15. COPYRIGHT NOTICE</h2>
      <ul class="legal-notices">
        @for (notice of notices(); track notice) {
          <li>{{notice}}</li>
        }
      </ul>
    </main>
  `,
  // inline styles are sass, as the project's (angular.json inlineStyleLanguage)
  styles: `
.legal-page
  max-width: var(--sheet-measure)
  margin: 0 auto
  padding: var(--space-8) var(--space-4) var(--space-16)
.legal-text
  white-space: pre-wrap
  font-family: inherit
.legal-notices
  padding-left: var(--space-4)
`,
})
export class LegalComponent implements OnInit {
  license = signal('');
  notices = signal<string[]>(LICENSE_NOTICES);

  async ngOnInit(): Promise<void> {
    const text = (url: string) => fetch(url).then(response => response.ok ? response.text() : '').catch(() => '');
    const json = async <T>(url: string, otherwise: T): Promise<T> => {
      const read = await text(url);
      try { return read ? JSON.parse(read) as T : otherwise; } catch { return otherwise; }
    };
    const [license, index, books] = await Promise.all([
      text('legal/ogl-1.0a.txt'),
      json<LibraryIndex>('library/index.json', {schemaVersion: 0, entries: []}),
      json<{[code: string]: {copyright: string}}>('library/books.json', {}),
    ]);
    this.license.set(license);
    const cited = new Set(index.entries.flatMap(booksOf));
    this.notices.set([...LICENSE_NOTICES, ...Object.entries(books).filter(([code]) => cited.has(code)).map(([, book]) => book.copyright)]);
  }
}
