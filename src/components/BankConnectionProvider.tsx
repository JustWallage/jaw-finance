import { createContext, useContext, type ReactNode } from "react";
import { useBankConnection } from "../hooks/useBankConnection";

type BankConnectionContextType = ReturnType<typeof useBankConnection>;

const BankConnectionContext = createContext<BankConnectionContextType | null>(null);

export function BankConnectionProvider({ children }: { children: ReactNode }) {
  const bank = useBankConnection();
  return (
    <BankConnectionContext.Provider value={bank}>
      {children}
    </BankConnectionContext.Provider>
  );
}

export function useBankConnectionContext() {
  const ctx = useContext(BankConnectionContext);
  if (!ctx) throw new Error("useBankConnectionContext must be used within BankConnectionProvider");
  return ctx;
}
