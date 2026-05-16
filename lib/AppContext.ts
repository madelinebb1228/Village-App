import React from 'react';

export type AppContextType = {
  markOnboardingComplete: () => Promise<void>;
};

export const AppContext = React.createContext<AppContextType>({
  markOnboardingComplete: async () => {},
});
