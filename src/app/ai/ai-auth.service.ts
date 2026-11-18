import {Injectable, signal} from '@angular/core';
import {aiConfig} from './ai-config';
import {firebaseApp, loadFirebase} from './firebase-app';

// who is signed in for the AI. the AI costs money, so AI Logic only answers players signed in with Google (its
// authenticated-users mode), and only the players the owner added can sign in: sign-up is turned off in the
// Firebase console, so an account it does not know gets admin-restricted-operation. the sheet itself needs no
// sign-in, only the chat does. it starts listening the first time the chat needs to know

export interface SignedInPlayer {
  name: string;
  email: string;
}

@Injectable({providedIn: 'root'})
export class AiAuthService {
  // undefined until Firebase says who is signed in (it keeps the player signed in across visits), null for no one
  readonly player = signal<SignedInPlayer | null | undefined>(undefined);
  // what went wrong signing in, for the chat to show
  readonly problem = signal<string | null>(null);
  private started?: Promise<import('firebase/auth').Auth | null>;

  // starts listening to who is signed in, once
  start(): Promise<import('firebase/auth').Auth | null> {
    return this.started ??= (async () => {
      const config = aiConfig();
      if (!config) return null;
      try {
        const modules = await loadFirebase();
        const auth = modules.auth.getAuth(firebaseApp(modules, config));
        const seen = (user: import('firebase/auth').User | null) =>
          this.player.set(user ? {name: user.displayName || user.email || 'signed in', email: user.email || ''} : null);
        modules.auth.onAuthStateChanged(auth, seen);
        // a player signed in on an earlier visit is known once this resolves
        await auth.authStateReady();
        seen(auth.currentUser);
        return auth;
      } catch (e) {
        this.problem.set(`Sign-in could not start: ${(e as Error).message}`);
        this.player.set(null);
        return null;
      }
    })();
  }

  async signIn(): Promise<void> {
    this.problem.set(null);
    const auth = await this.start();
    if (!auth) return;
    const {GoogleAuthProvider, signInWithPopup} = await loadFirebase().then(m => m.auth);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      this.problem.set(signInProblem((e as {code?: string}).code, (e as Error).message));
    }
  }

  async signOut(): Promise<void> {
    const auth = await this.start();
    if (auth) await (await loadFirebase()).auth.signOut(auth);
  }
}

// what a failed sign-in tells the player, null when they closed the popup themselves
export const signInProblem = (code: string | undefined, message: string): string | null => {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    // sign-up is off: the account is not one the owner added
    case 'auth/admin-restricted-operation':
      return 'This Google account is not on the list of players: ask the owner of the app to add it.';
    case 'auth/popup-blocked':
      return 'The browser blocked the sign-in window: allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'Sign-in is not allowed from this address: add it to the authorized domains (Firebase console, Authentication, Settings).';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not turned on (Firebase console, Authentication, Sign-in method).';
    default:
      return `Could not sign in: ${message}`;
  }
};
