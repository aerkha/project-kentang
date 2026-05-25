"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface Investor {
  id: string;
  name: string;
  address: string;
  brokerName: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  occupation: string;
  investmentAmount: number;
  heirName: string;
  relationship?: string;
  mobile?: string;
  heirBankName: string;
  heirAccountNumber: string;
  isActive?: boolean; // undefined / true = aktif, false = nonaktif
}

interface InvestorsContextType {
  investors: Investor[];
  addInvestor: (investor: Omit<Investor, "id">) => void;
  updateInvestor: (id: string, updates: Partial<Investor>) => void;
  deleteInvestor: (id: string) => void;
}

const InvestorsContext = createContext<InvestorsContextType | undefined>(undefined);

const INITIAL_INVESTORS: Investor[] = [
  {
    id: "INV-0001",
    name: "John Smith",
    address: "Jl. Sudirman No. 1, Jakarta Pusat",
    brokerName: "Ahmad Wijaya",
    idNumber: "3174010101800001",
    bankName: "BCA",
    accountNumber: "1234567890",
    phone: "+62 812-1234-5678",
    occupation: "Pengusaha",
    investmentAmount: 150000000,
    heirName: "Jane Smith",
    relationship: "Istri",
    mobile: "+62 812-8765-4321",
    heirBankName: "BCA",
    heirAccountNumber: "0987654321",
  },
  {
    id: "INV-0002",
    name: "Sarah Johnson",
    address: "Jl. Thamrin No. 20, Jakarta Pusat",
    brokerName: "Budi Santoso",
    idNumber: "3174020202850002",
    bankName: "Mandiri",
    accountNumber: "2345678901",
    phone: "+62 813-2345-6789",
    occupation: "Dokter",
    investmentAmount: 250000000,
    heirName: "Tom Johnson",
    heirBankName: "Mandiri",
    heirAccountNumber: "1098765432",
  },
  {
    id: "INV-0003",
    name: "Michael Chen",
    address: "Jl. Kuningan No. 5, Jakarta Selatan",
    brokerName: "Ahmad Wijaya",
    idNumber: "3174030303900003",
    bankName: "BNI",
    accountNumber: "3456789012",
    phone: "+62 821-3456-7890",
    occupation: "Konsultan",
    investmentAmount: 100000000,
    heirName: "Lisa Chen",
    heirBankName: "BNI",
    heirAccountNumber: "2109876543",
  },
  {
    id: "INV-0004",
    name: "Emily Davis",
    address: "Jl. Rasuna Said No. 15, Jakarta Selatan",
    brokerName: "Budi Santoso",
    idNumber: "3174040404880004",
    bankName: "BRI",
    accountNumber: "4567890123",
    phone: "+62 822-4567-8901",
    occupation: "Arsitek",
    investmentAmount: 300000000,
    heirName: "Mark Davis",
    heirBankName: "BRI",
    heirAccountNumber: "3210987654",
  },
  {
    id: "INV-0005",
    name: "Robert Wilson",
    address: "Jl. MT Haryono No. 8, Jakarta Timur",
    brokerName: "Ahmad Wijaya",
    idNumber: "3174050505750005",
    bankName: "CIMB",
    accountNumber: "5678901234",
    phone: "+62 815-5678-9012",
    occupation: "Pensiunan",
    investmentAmount: 75000000,
    heirName: "Alice Wilson",
    heirBankName: "CIMB",
    heirAccountNumber: "4321098765",
  },
];

export function InvestorsProvider({ children }: { children: ReactNode }) {
  const [investors, setInvestors] = useState<Investor[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("minbun_investors");
    if (stored) {
      setInvestors(JSON.parse(stored));
    } else {
      setInvestors(INITIAL_INVESTORS);
      localStorage.setItem("minbun_investors", JSON.stringify(INITIAL_INVESTORS));
    }
  }, []);

  const saveInvestors = (newInvestors: Investor[]) => {
    setInvestors(newInvestors);
    localStorage.setItem("minbun_investors", JSON.stringify(newInvestors));
  };

  const generateId = (current: Investor[]) => {
    const maxNum = current.reduce((max, inv) => {
      const num = parseInt(inv.id.replace("INV-", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `INV-${String(maxNum + 1).padStart(4, "0")}`;
  };

  const addInvestor = (investor: Omit<Investor, "id">) => {
    const newInvestor: Investor = { ...investor, id: generateId(investors) };
    saveInvestors([...investors, newInvestor]);
  };

  const updateInvestor = (id: string, updates: Partial<Investor>) => {
    saveInvestors(investors.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv)));
  };

  const deleteInvestor = (id: string) => {
    saveInvestors(investors.filter((inv) => inv.id !== id));
  };

  return (
    <InvestorsContext.Provider value={{ investors, addInvestor, updateInvestor, deleteInvestor }}>
      {children}
    </InvestorsContext.Provider>
  );
}

export function useInvestors() {
  const context = useContext(InvestorsContext);
  if (context === undefined) {
    throw new Error("useInvestors must be used within an InvestorsProvider");
  }
  return context;
}
