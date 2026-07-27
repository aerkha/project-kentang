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
    authStore = {
      save: vi.fn(),
      record: { role: "admin" },
    };
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

// Import setelah vi.mock agar Vitest sudah meng-hoist mock-nya.
import { POST } from "@/app/api/inventory/invoice/route";

describe("app/api/inventory/invoice — duplikat dan rollback", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockState.collections)) delete mockState.collections[key];
  });

  it("menolak invoice_id duplikat dengan HTTP 409", async () => {
    const invoice = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([{ id: "inv-x", ref_sj: "SJ-001" }]),
      getFirstListItem: vi.fn().mockResolvedValue({ id: "inv-x" }),
    });
    mockState.collections.inv_invoice = invoice;
    mockState.collections.inv_pengiriman = createCollectionStub({
      getOne: vi.fn().mockResolvedValue({ id: "ship-1", buyer: "buyer-1", sj_id: "SJ-001", invoice_id: "" }),
    });

    const res = await POST(buildRequest({
      invoice: { buyer: "buyer-1", invoice_id: "INV-DUP" },
      pengirimanIds: ["ship-1"],
    }) as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(409);
    expect(invoice.create).not.toHaveBeenCalled();
  });

  it("menolak Surat Jalan yang sudah tertagih", async () => {
    const invoice = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([]),
      getFirstListItem: vi.fn().mockRejectedValue({ status: 404 }),
    });
    mockState.collections.inv_invoice = invoice;
    mockState.collections.inv_pengiriman = createCollectionStub({
      getOne: vi.fn().mockResolvedValue({ id: "ship-1", buyer: "buyer-1", sj_id: "SJ-001", invoice_id: "inv-9" }),
    });

    const res = await POST(buildRequest({
      invoice: { buyer: "buyer-1", invoice_id: "INV-NEW" },
      pengirimanIds: ["ship-1"],
    }) as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(409);
    expect(invoice.create).not.toHaveBeenCalled();
  });

  it("membuat invoice dan menandai relasi jika semua valid", async () => {
    const invoice = createCollectionStub({
      getFullList: vi.fn().mockResolvedValue([]),
      getFirstListItem: vi.fn().mockRejectedValue({ status: 404 }),
      create: vi.fn().mockResolvedValue({ id: "inv-1" }),
      getOne: vi.fn().mockResolvedValue({ id: "inv-1", invoice_id: "INV-OK", ref_sj: "SJ-001" }),
    });
    const shipments = createCollectionStub({
      getOne: vi.fn()
        .mockResolvedValueOnce({ id: "ship-1", buyer: "buyer-1", sj_id: "SJ-001", invoice_id: "" })
        .mockResolvedValueOnce({ id: "ship-1", invoice_id: "" }),
    });
    mockState.collections.inv_invoice = invoice;
    mockState.collections.inv_pengiriman = shipments;

    const res = await POST(buildRequest({
      invoice: { buyer: "buyer-1", invoice_id: "INV-OK" },
      pengirimanIds: ["ship-1"],
    }) as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
    expect(invoice.create).toHaveBeenCalled();
    expect(shipments.update).toHaveBeenCalledWith("ship-1", { invoice_id: "inv-1" });
  });
});
