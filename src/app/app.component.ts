import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { registerConsoleCommands } from './utils/console-commands';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent {
  title = 'pf1-character-app';

  constructor() {
    // developer commands for the browser console, see console-commands
    if (isPlatformBrowser(inject(PLATFORM_ID))) registerConsoleCommands();
  }
}
