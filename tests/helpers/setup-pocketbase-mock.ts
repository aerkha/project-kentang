/**
 * Shared PocketBase mock untuk route test.
 *
 * Pemakaian:
 *   import { buildMockState, createCollectionStub, buildPocketBaseMock, buildRequest } from "./setup-pocketbase-mock";
 *
 *   const mockState = buildMockState();
 *   vi.mock("@/lib/pocketbase", () => buildPocketBaseMock(mockState));
 *
 *   // atur collection mock di beforeEach
 *   mockState.collections.inv_pengiriman = createCollectionStub({ getOne: ... });
 *   // panggil route
 *   const res = await POST(buildRequest({ body }));
 *
 * Catatan: `mockState` dibuat via `vi.hoisted` di test file agar Vitest
 * bisa meng-hoist-nya ke atas semua import. State collections di-share
 * lintas test dengan referensi yang sama, sehingga `new PocketBase()`
 * di route handler selalu melihat koleksi yang sama.
 */
import { vi } from "vitest";

export interface MockState {
  collections: Record<string, any>;
}

export function createCollectionStub(overrides: Record<string, any> = {}): any {
  return {
    getFullList: vi.fn().mockResolvedValue([]),
    getFirstListItem: vi.fn().mockRejectedValue({ status: 404 }),
    getOne: vi.fn().mockRejectedValue({ status: 404 }),
    create: vi.fn().mockResolvedValue({ id: "new-record" }),
    update: vi.fn().mockResolvedValue({ id: "updated" }),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

export function buildPocketBaseMock(mockState: MockState) {
  return {
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
  };
}

export function buildRequest(body: any, headers: Record<string, string> = {}) {
  const headerMap = new Map<string, string>([
    ["authorization", "Bearer fake-token"],
    ["content-type", "application/json"],
    ...Object.entries(headers),
  ]);
  return {
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => body,
  };
}
