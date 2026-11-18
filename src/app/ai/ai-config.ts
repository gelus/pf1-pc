import type {FirebaseOptions} from 'firebase/app';
import {ls} from '../utils/localstorage.util';

// how the AI is reached. the chat runs Gemini through Firebase AI Logic (the Gemini Developer API, which has a free
// tier), from the browser: the firebase config below is not a secret, it names the project. to set it up:
//  1. create a project at https://console.firebase.google.com and add a web app to it
//  2. in the console open AI Logic, get started and pick the Gemini Developer API
//  3. paste the config of the web app below (or, to try it without committing it, run
//     pf1.setFirebaseConfig({...}) in the browser console, it is kept in this browser only)
// App Check keeps others from spending the quota of the project, turn it on before sharing the app beyond your table
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: "AIzaSyC4sMNxoI-wcJarbrqQ2idu-prIehy6mmg",
  authDomain: "pf1-pc.firebaseapp.com",
  projectId: "pf1-pc",
  storageBucket: "pf1-pc.firebasestorage.app",
  messagingSenderId: "1041263692924",
  appId: "1:1041263692924:web:3741f5292bd2f5ed768df9",
  measurementId: "G-T8GDB8J9PG"
}

// the Gemini model the chat uses. the flash-lite models are the cheapest and have the largest free quota, a flash
// model answers better. pf1.setAiModel('...') overrides it in this browser
export const defaultGeminiModel = 'gemini-3.5-flash-lite';

// the models the chat goes on with when the one above reached a limit of the free tier (see ai/rate-limits.ts), each
// has limits of its own. free models only (Gemini Developer API pricing, "free of charge"), so a limit is never a
// charge. fastest and with the largest free quota first: the flash-lite ones, then the flash ones, which answer
// better but slower and have lower free limits, then a preview, which may go away. one that is retired or can not
// call functions is skipped (isUnavailableModel). left out: the 2.5 flash and pro models, deprecated and routed to
// newer ones from December 2026, and gemini-4-hydrogen, whose limits and function calling are not documented
export const fallbackGeminiModels = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
];

// App Check: AI Logic of the project only answers apps that prove they are this one, through Fraud Defense (formerly
// reCAPTCHA Enterprise). the site key is not a secret (Firebase console, App Check, Apps, the reCAPTCHA Enterprise
// row; it starts with 6L). null leaves App Check out, which only works while AI Logic does not enforce it
export const appCheckSiteKey: string | null = '6LcWfCUuAAAAADig7sCJZmiQUxbdQIqdTMKTYXvk';

// where reCAPTCHA can not run (localhost, the e2e tests) a debug token stands in for it: add one in the Firebase
// console (App Check, Apps, Manage debug tokens) and run pf1.setAppCheckDebugToken('...') in the browser. it is kept
// in this browser only, never commit it: anyone holding it passes App Check

// the AI costs money once billing is on: only players signed in with Google use it. AI Logic holds to it when its
// authenticated-users mode is on (Firebase console, AI Logic, Settings), and who can sign in is who the owner added
// (Authentication, Settings, User actions: sign-up turned off, players added under Users). see ai-auth.service.ts
export const requireSignIn = true;

const configKey = 'ai-firebase-config';
const modelKey = 'ai-model';
const debugTokenKey = 'ai-app-check-debug-token';

export interface AiConfig {
  firebase: FirebaseOptions;
  model: string;
  // the models to go on with when the model reached a limit
  fallbackModels: string[];
  // the Fraud Defense site key and the debug token of this browser, App Check is on when either is set
  appCheck: {siteKey: string | null, debugToken: string | null};
  // the AI is only for signed in players, see requireSignIn
  requireSignIn: boolean;
}

// the config in use: the one set in this browser, else the one above. null until either is set
export const aiConfig = (): AiConfig | null => {
  let stored: FirebaseOptions | null = null;
  let model: string | null = null;
  let debugToken: string | null = null;
  try {
    stored = ls.getItem(configKey);
    model = ls.getItem(modelKey);
    debugToken = ls.getItem(debugTokenKey);
  } catch { /* no storage (server side rendering), use the file */ }
  const firebase = stored || firebaseConfig;
  const chosen = model || defaultGeminiModel;
  return firebase ? {
    firebase, model: chosen, fallbackModels: fallbackGeminiModels.filter(m => m !== chosen),
    appCheck: {siteKey: appCheckSiteKey, debugToken}, requireSignIn,
  } : null;
};

export const setFirebaseConfig = (config: FirebaseOptions | null): void => {
  if (config) ls.setItem(configKey, config);
  else ls.removeItem(configKey);
};

export const setAiModel = (model: string | null): void => {
  if (model) ls.setItem(modelKey, model);
  else ls.removeItem(modelKey);
};

export const setAppCheckDebugToken = (token: string | null): void => {
  if (token) ls.setItem(debugTokenKey, token);
  else ls.removeItem(debugTokenKey);
};
