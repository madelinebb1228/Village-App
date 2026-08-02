import React from 'react';

export type AppContextType = {
  markOnboardingComplete: () => Promise<void>;
  // Incremented each time something (e.g. Settings' "Take a Tour" row) asks for the
  // Home screen's coach-mark tour to (re)play. Home watches this and starts the tour
  // whenever it changes.
  tourRequestId: number;
  requestTour: () => void;
};

export const AppContext = React.createContext<AppContextType>({
  markOnboardingComplete: async () => {},
  tourRequestId: 0,
  requestTour: () => {},
});
