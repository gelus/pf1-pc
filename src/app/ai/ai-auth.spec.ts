import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { AiAuthService, SignedInPlayer, signInProblem } from './ai-auth.service';
import { AI_PROVIDER, AiChatService } from './ai-chat.service';

// the AI costs money: a provider that needs the player signed in gets no request from a player who is not
describe('AI sign-in', () => {
  const player = signal<SignedInPlayer | null | undefined>(undefined);
  let sent: unknown[];
  let chat: AiChatService;

  const setUp = (requiresSignIn: boolean) => {
    sent = [];
    player.set(null);
    TestBed.configureTestingModule({providers: [
      {provide: AI_PROVIDER, useValue: () => ({
        name: 'fake', requiresSignIn,
        startSession: () => ({send: async (input: unknown) => { sent.push(input); return {text: 'hi', toolCalls: []}; }}),
      })},
      {provide: AiAuthService, useValue: {player, problem: signal(null), start: async () => null, signIn: async () => {}, signOut: async () => {}}},
    ]});
    TestBed.inject(ApplyCharacterService).initializeCharacter(new Character());
    chat = TestBed.inject(AiChatService);
  };

  it('sends nothing until the player signs in', async () => {
    setUp(true);
    expect(chat.signInNeeded()).toBeTrue();
    await chat.send('hello');
    expect(sent).toEqual([]);
    expect(chat.messages().at(-1)!.text).toContain('Sign in to use the AI');
    player.set({name: 'A player', email: 'player@example.com'});
    expect(chat.signInNeeded()).toBeFalse();
    await chat.send('hello again');
    expect(sent.length).toBe(1);
  });

  it('asks no one to sign in for a provider that does not need it', async () => {
    setUp(false);
    expect(chat.signInNeeded()).toBeFalse();
    await chat.send('hello');
    expect(sent.length).toBe(1);
  });

  it('says why a sign-in failed, and nothing when the player closed the popup', () => {
    expect(signInProblem('auth/popup-closed-by-user', '')).toBeNull();
    expect(signInProblem('auth/admin-restricted-operation', '')).toContain('not on the list of players');
    expect(signInProblem('auth/operation-not-allowed', '')).toContain('Sign-in method');
    expect(signInProblem('auth/network-request-failed', 'offline')).toBe('Could not sign in: offline');
  });
});
