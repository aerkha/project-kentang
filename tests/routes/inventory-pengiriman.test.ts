import { describe, it, beforeEach, expect, vi } from "vitest";
import {
  createCollectionStub,
  buildRequest,
} from "../helpers/setup-pocketbase-mock";

const mockState = vi.hoisted(() => ({ collections: {} as Record<string, any> }));

// Catatan: route handler `import PocketBase from "pocketbase"` (package langsung),
// bukan dari `@/lib/pocketbase`. Jadi mock harus target modul `pocketbase`.
vi.mock("pocketbase", () => ({
  default: class PocketBase {
    authStore = { save: vi.fn(), record: { role: "admin" } };
    collection(name: string) {
      if (!mockState.collections[name]) {
        if (name === "users") {
          mockState.collections[name] = {
            ...createCollectionStub(),
            authRefresh: vi.fn().mockResolvedValue({ record: { role: "admin" } }),
          };
        } else {
          mockState.collections[name] = createCollectionStub();
        }
      }
      return mockState.collections[name];
    }
  },
}));

vi.mock("@/lib/pb-error", () => ({
  isSameOriginRequest: () => true,
}));

import { POST } from "@/app/api/inventory/pengiriman/route";

describe("app/api/inventory/pengiriman — validasi stok", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockState.collections)) delete mockState.collections[key];
  });

  it("menolak kuantitas melebihi stok grade tersedia", async () => {
    mockState.collections.inv_sortir = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([
        { grade_a: 100, grade_b: 0, grade_c: 0, grade_baby: 0, grade_reject: 0, susut: 0 },
      ]),
    });
    mockState.collections.inv_pengiriman = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([]),
    });
    const res = await POST(buildRequest({
      mode: "create",
      data: { qty_grade_a: 200, qty_grade_b: 0, qty_grade_c: 0, qty_grade_baby: 0, qty_campur: 0 },
    }) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(409);
  });
});
