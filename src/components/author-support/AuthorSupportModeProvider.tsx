"use client";

import { createContext, useContext, type ReactNode } from "react";

const AuthorSupportModeContext = createContext(false);

export function AuthorSupportModeProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <AuthorSupportModeContext.Provider value={active}>
      {children}
    </AuthorSupportModeContext.Provider>
  );
}

export function useAuthorSupportMode(): boolean {
  return useContext(AuthorSupportModeContext);
}
