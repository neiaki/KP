"use client";

import React, { createContext, useContext } from "react";
import { useAtCellStore } from "@/lib/store";
import type { PublicSnapshot } from "@/lib/actions/public";

type StoreType = ReturnType<typeof useAtCellStore>;

const StoreContext = createContext<StoreType | null>(null);

export function StoreProvider({
  children,
  publicSeed,
}: {
  children: React.ReactNode;
  /* Hasil getPublicSnapshot di server, hanya diisi layout area publik. */
  publicSeed?: PublicSnapshot | null;
}) {
  const store = useAtCellStore(publicSeed);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
