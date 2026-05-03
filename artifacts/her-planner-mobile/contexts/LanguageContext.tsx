import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { LangCode, T } from "@/constants/translations";

const STORAGE_KEY = "her-planner-language";

interface LanguageContextValue {
  language: LangCode;
  setLanguage: (lang: LangCode) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: async () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LangCode>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "en" || val === "es" || val === "pt") {
        setLanguageState(val);
      }
    });
  }, []);

  const setLanguage = useCallback(async (lang: LangCode) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const record = T[key];
      if (!record) return key;
      let str = record[language] ?? record.en ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
