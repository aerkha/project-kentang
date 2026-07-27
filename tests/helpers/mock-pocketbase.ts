/**
 * Mock helper untuk PocketBase. Test tidak butuh server PocketBase
 * hidup karena semua panggilan ke `new PocketBase(...)` di-handle
 * oleh stub ini.
 */
import { vi } from "vitest";

export type CollectionStub = {
  getFullList: any;
  getFirstListItem: any;
  getOne: any;
  create: any;
  update: any;
  delete: any;
  authRefresh?: any;
};

export function buildCollectionStub(overrides: Record<string, any> = {}): CollectionStub {
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

export function buildUsersStub(): CollectionStub {
  return {
    ...buildCollectionStub(),
    authRefresh: vi.fn().mockResolvedValue({ record: { role: "admin" } }),
  };
}

export function buildPocketBaseMock(): {
  authStore: { save: any; record: { role: string; id?: string } };
  collection: (name: string) => CollectionStub;
  collections: Record<string, CollectionStub>;
  setAuth: (record: { role: string; id?: string }) => void;
} {
  const collections: Record<string, CollectionStub> = {};
  const authStore = {
    save: () => undefined,
    record: { role: "admin" },
  };
  return {
    authStore,
    collection: (name: string) => {
      if (!collections[name]) {
        collections[name] = name === "users" ? buildUsersStub() : buildCollectionStub();
      }
      return collections[name];
    },
    collections,
    setAuth: (record) => {
      authStore.record = { ...authStore.record, ...record };
    },
  };
}
