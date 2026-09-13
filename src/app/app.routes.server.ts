import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // The character index reads browser local storage during construction.
    path: '',
    renderMode: RenderMode.Client
  },
  {
    // Character ids are local-storage records and cannot be enumerated during
    // prerendering. Render those dynamic URLs in the browser instead.
    path: ':characterid',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
