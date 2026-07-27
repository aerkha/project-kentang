// Set env SEBELUM import MouContext agar PB_BASE di-evaluasi dengan benar.
process.env.NEXT_PUBLIC_PB_URL = "http://example.test";

import { describe, expect, it, vi } from "vitest";

// Mock pocketbase agar MouContext tidak membuat instance PocketBase hidup
// ketika modul di-load (MouProvider memicu getFullList di useEffect).
vi.mock("@/lib/pocketbase", () => ({
  default: {
    authStore: { record: { id: "user-1", role: "admin" } },
    collection: () => ({
      getFullList: vi.fn().mockResolvedValue([]),
      authRefresh: vi.fn().mockResolvedValue({ record: { role: "admin" } }),
    }),
  },
}));

import { recordToMou, pbFileUrl } from "@/lib/mou-context";

function buildRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customId: "MOU-202507-001",
    id: "pbrecord-1",
    buktiPengembalian: "bukti-kembali.pdf",
    buktiInvestor: "bukti-investor.pdf",
    buktiBroker: undefined,
    buktiTrader: "bukti-trader.pdf",
    buktiMinBun: undefined,
    ...overrides,
  };
}

describe("lib/mou-context.recordToMou — pemetaan bukti transfer", () => {
  it("memetakan buktiPengembalian menjadi URL lengkap PocketBase", () => {
    const result = recordToMou(buildRecord(), new Map());
    expect(result.buktiPengembalian).toBe(
      "http://example.test/api/files/mous/pbrecord-1/bukti-kembali.pdf",
    );
  });

  it("memetakan buktiInvestor dan buktiTrader dengan pola yang sama", () => {
    const result = recordToMou(buildRecord(), new Map());
    expect(result.buktiInvestor).toBe(
      "http://example.test/api/files/mous/pbrecord-1/bukti-investor.pdf",
    );
    expect(result.buktiTrader).toBe(
      "http://example.test/api/files/mous/pbrecord-1/bukti-trader.pdf",
    );
  });

  it("mengembalikan string kosong untuk field bukti yang tidak diisi", () => {
    const result = recordToMou(buildRecord(), new Map());
    expect(result.buktiBroker).toBe("");
    expect(result.buktiMinBun).toBe("");
  });

  it("memetakan bukti array (koleksi) menjadi elemen pertama", () => {
    const result = recordToMou(
      buildRecord({ buktiInvestor: ["first.pdf", "second.pdf"] }),
      new Map(),
    );
    expect(result.buktiInvestor).toBe(
      "http://example.test/api/files/mous/pbrecord-1/first.pdf",
    );
  });

  it("pbFileUrl mengembalikan string kosong untuk input kosong", () => {
    expect(pbFileUrl("x", "")).toBe("");
    expect(pbFileUrl("x", undefined)).toBe("");
  });
});
