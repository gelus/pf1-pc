import type {AiConfig} from './ai-config';

// the firebase app the AI goes through, its modules loaded the first time the AI is used (they are large, the sheet
// does not need them). App Check and Auth are started on the app before the AI's first call: the AI SDK sends their
// tokens only when they are there when it is made

const appName = 'pf1-ai';

export type FirebaseModules = {
  app: typeof import('firebase/app'),
  ai: typeof import('firebase/ai'),
  appCheck: typeof import('firebase/app-check'),
  auth: typeof import('firebase/auth'),
};
let modules: Promise<FirebaseModules> | undefined;
export const loadFirebase = (): Promise<FirebaseModules> => modules ??= Promise.all([
  import('firebase/app'), import('firebase/ai'), import('firebase/app-check'), import('firebase/auth'),
]).then(([app, ai, appCheck, auth]) => ({app, ai, appCheck, auth}));

// made once: App Check can only be started once per app, before its first call
export const firebaseApp = ({app, appCheck, auth}: FirebaseModules, config: AiConfig): import('firebase/app').FirebaseApp => {
  const existing = app.getApps().find(a => a.name === appName);
  if (existing) return existing;
  const created = app.initializeApp(config.firebase, appName);
  const {siteKey, debugToken} = config.appCheck;
  if (siteKey || debugToken) {
    // the SDK reads the debug token from here when App Check starts, it then skips reCAPTCHA
    if (debugToken) (self as {FIREBASE_APPCHECK_DEBUG_TOKEN?: string}).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    appCheck.initializeAppCheck(created, {
      provider: new appCheck.ReCaptchaEnterpriseProvider(siteKey || 'debug-token-only'),
      isTokenAutoRefreshEnabled: true,
    });
  }
  // the signed in player, whose token the AI SDK sends with each request
  auth.getAuth(created);
  return created;
};
