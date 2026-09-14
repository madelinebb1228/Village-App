import React from 'react';

// The four in-Home creation flows a global Create-tap can ask Home to run.
// Event and Ask-for-Help don't need this — they're fully self-contained
// (EventsScreen, PatchTasksSheet) and are opened directly at the app root.
export type CreateAction = 'post' | 'question' | 'media' | 'story';

export type AppContextType = {
  markOnboardingComplete: () => Promise<void>;
  // Incremented each time something (e.g. Settings' "Take a Tour" row) asks for the
  // Home screen's coach-mark tour to (re)play. Home watches this and starts the tour
  // whenever it changes.
  tourRequestId: number;
  requestTour: () => void;
  // Opens the global create-options sheet, owned and rendered at the app root
  // (sibling of the tab navigator) — reliably shows above whichever tab is
  // active, and isn't affected by tab mount/focus lifecycle.
  requestCreate: () => void;
  // Set (with a fresh requestId each time, so repeats are detectable) when the
  // root create-options sheet asks Home to run one of its existing creation
  // flows (open the post composer in a given mode, or the story composer).
  // Home is the only consumer; it owns all the actual state/handlers for these.
  createAction: { action: CreateAction; requestId: number } | null;
  requestCreateAction: (action: CreateAction) => void;
};

export const AppContext = React.createContext<AppContextType>({
  markOnboardingComplete: async () => {},
  tourRequestId: 0,
  requestTour: () => {},
  requestCreate: () => {},
  createAction: null,
  requestCreateAction: () => {},
});
