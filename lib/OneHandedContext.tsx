import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'one_handed_mode_v1';

interface OneHandedContextType {
  isOneHanded: boolean;
  toggleOneHanded: () => void;
}

const OneHandedContext = createContext<OneHandedContextType>({
  isOneHanded: false,
  toggleOneHanded: () => {},
});

export function useOneHanded(): OneHandedContextType {
  return useContext(OneHandedContext);
}

export function OneHandedProvider({ children }: { children: React.ReactNode }) {
  const [isOneHanded, setIsOneHanded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'true') setIsOneHanded(true);
    });
  }, []);

  const toggleOneHanded = useCallback(() => {
    setIsOneHanded(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <OneHandedContext.Provider value={{ isOneHanded, toggleOneHanded }}>
      {children}
    </OneHandedContext.Provider>
  );
}
