"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface Broker {
  id: string;
  name: string;
  address: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
}

interface BrokersContextType {
  brokers: Broker[];
  addBroker: (broker: Omit<Broker, "id">) => void;
  updateBroker: (id: string, updates: Partial<Broker>) => void;
  deleteBroker: (id: string) => void;
}

const BrokersContext = createContext<BrokersContextType | undefined>(undefined);

const INITIAL_BROKERS: Broker[] = [
  {
    id: "BRK-0001",
    name: "Ahmad Wijaya",
    address: "Jl. Gatot Subroto No. 10, Jakarta Selatan",
    idNumber: "3174020202800002",
    bankName: "Mandiri",
    accountNumber: "1122334455",
    phone: "+62 813-1111-2222",
  },
  {
    id: "BRK-0002",
    name: "Budi Santoso",
    address: "Jl. Thamrin No. 5, Jakarta Pusat",
    idNumber: "3174030303800003",
    bankName: "BNI",
    accountNumber: "5566778899",
    phone: "+62 821-3333-4444",
  },
];

export function BrokersProvider({ children }: { children: ReactNode }) {
  const [brokers, setBrokers] = useState<Broker[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("minbun_brokers");
    if (stored) {
      setBrokers(JSON.parse(stored));
    } else {
      setBrokers(INITIAL_BROKERS);
      localStorage.setItem("minbun_brokers", JSON.stringify(INITIAL_BROKERS));
    }
  }, []);

  const saveBrokers = (newBrokers: Broker[]) => {
    setBrokers(newBrokers);
    localStorage.setItem("minbun_brokers", JSON.stringify(newBrokers));
  };

  const generateId = (current: Broker[]) => {
    const maxNum = current.reduce((max, b) => {
      const num = parseInt(b.id.replace("BRK-", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `BRK-${String(maxNum + 1).padStart(4, "0")}`;
  };

  const addBroker = (broker: Omit<Broker, "id">) => {
    const newBroker: Broker = { ...broker, id: generateId(brokers) };
    saveBrokers([...brokers, newBroker]);
  };

  const updateBroker = (id: string, updates: Partial<Broker>) => {
    saveBrokers(brokers.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const deleteBroker = (id: string) => {
    saveBrokers(brokers.filter((b) => b.id !== id));
  };

  return (
    <BrokersContext.Provider value={{ brokers, addBroker, updateBroker, deleteBroker }}>
      {children}
    </BrokersContext.Provider>
  );
}

export function useBrokers() {
  const context = useContext(BrokersContext);
  if (context === undefined) {
    throw new Error("useBrokers must be used within a BrokersProvider");
  }
  return context;
}
