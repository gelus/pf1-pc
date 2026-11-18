import {Injectable, PLATFORM_ID, inject, signal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'theme';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

// light, dark, or whatever the system uses. the choice is kept in the browser and set as data-theme on <html>, which
// the tokens read (styles/tokens.css); index.html sets it before the app starts so the page never flashes
@Injectable({providedIn: 'root'})
export class ThemeService {
  private browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly mode = signal<ThemeMode>(this.saved());

  next(): void {
    this.set(ORDER[(ORDER.indexOf(this.mode()) + 1) % ORDER.length]);
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    if (!this.browser) return;
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch { /* storage blocked: the choice lasts for this visit */ }
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
  }

  private saved(): ThemeMode {
    if (!this.browser) return 'system';
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
