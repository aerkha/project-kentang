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

import { POST } from "@/app/api/inventory/sortir/route";

describe("app/api/inventory/sortir — validasi kuantitas", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockState.collections)) delete mockState.collections[key];
  });

  it("menolak nilai negatif dengan HTTP 400", async () => {
    mockState.collections.inv_sortir = createCollectionStub();
    const res = await POST(buildRequest({
      mode: "create",
      data: { pembelian_id: "p-1", grade_a: -5 },
    }) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("menolak total sortir + susut yang melebihi tonase gudang dengan HTTP 409", async () => {
    mockState.collections.inv_pembelian = createCollectionStub({
      getOne: vi.fn().mockResolvedValue({ id: "p-1", tonase_gudang: 100 }),
    });
    mockState.collections.inv_sortir = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([
        { id: "s-1", grade_a: 80, grade_b: 0, grade_c: 0, grade_baby: 0, grade_reject: 0, susut: 0 },
      ]),
    });
    const res = await POST(buildRequest({
      mode: "create",
      data: { pembelian_id: "p-1", grade_a: 30, grade_b: 0, grade_c: 0, grade_baby: 0, grade_reject: 0, susut: 0 },
    }) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(409);
  });
});
