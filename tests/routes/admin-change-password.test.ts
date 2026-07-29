import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  createCollectionStub,
} from "../helpers/setup-pocketbase-mock";

/**
 * Test security dan validasi untuk POST /api/admin/change-password.
 *
 * Route memakai dua sesi PocketBase: token caller untuk memastikan role admin,
 * lalu service account untuk melakukan update password tanpa oldPassword.
 */
const mockState = vi.hoisted(() => ({
  collections: {} as Record<string, any>,
  callerRole: "admin",
  callerAuthShouldFail: false,
  serviceAuthShouldFail: false,
  authStoreSave: vi.fn(),
}));

const pbErrorMocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
}));

vi.mock("pocketbase", () => ({
  default: class PocketBase {
    authStore = {
      save: mockState.authStoreSave,
      record: null,
    };

    collection(name: string) {
      if (!mockState.collections[name]) {
        mockState.collections[name] = createCollectionStub();
      }
      return mockState.collections[name];
    }
  },
}));

vi.mock("@/lib/pb-error", () => pbErrorMocks);

import { POST } from "../../app/api/admin/change-password/route";

const VALID_BODY = {
  userId: "user-target-123",
  password: "newStrongPass123",
  passwordConfirm: "newStrongPass123",
};

const originalEnv = {
  NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL,
  PB_SERVICE_EMAIL: process.env.PB_SERVICE_EMAIL,
  PB_SERVICE_PASSWORD: process.env.PB_SERVICE_PASSWORD,
};

function asPostRequest(request: ReturnType<typeof buildRequest>) {
  return request as unknown as Parameters<typeof POST>[0];
}

function usersCollection() {
  return mockState.collections.users as ReturnType<typeof createCollectionStub> & {
    authRefresh: ReturnType<typeof vi.fn>;
    authWithPassword: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mockState.collections)) {
    delete mockState.collections[key];
  }

  mockState.callerRole = "admin";
  mockState.callerAuthShouldFail = false;
  mockState.serviceAuthShouldFail = false;
  pbErrorMocks.isSameOriginRequest.mockReturnValue(true);

  mockState.collections.users = createCollectionStub({
    authRefresh: vi.fn().mockImplementation(() => {
      if (mockState.callerAuthShouldFail) {
        return Promise.reject({ status: 401, message: "Token invalid" });
      }
      return Promise.resolve({ record: { role: mockState.callerRole } });
    }),
    authWithPassword: vi.fn().mockImplementation(() => {
      if (mockState.serviceAuthShouldFail) {
        return Promise.reject(new Error("Invalid service credentials"));
      }
      return Promise.resolve({ record: { role: "admin" } });
    }),
  });

  process.env.NEXT_PUBLIC_PB_URL = "http://example.test";
  process.env.PB_SERVICE_EMAIL = "svc@example.test";
  process.env.PB_SERVICE_PASSWORD = "svc-password-xyz";
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("app/api/admin/change-password — security & validation", () => {
  it("menolak cross-origin request dengan HTTP 403 sebelum memproses token", async () => {
    pbErrorMocks.isSameOriginRequest.mockReturnValue(false);

    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden: invalid origin" });
    expect(usersCollection().authRefresh).not.toHaveBeenCalled();
  });

  it.each(["", "Basic fake-token", "Bearer "])(
    "menolak Authorization header yang kosong/tidak valid: %j",
    async (authorization) => {
      const res = await POST(asPostRequest(buildRequest(VALID_BODY, { authorization })));

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(usersCollection().authRefresh).not.toHaveBeenCalled();
    },
  );

  it.each(["user", "investor"])("menolak caller dengan role %s", async (role) => {
    mockState.callerRole = role;

    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/hanya admin/i);
    expect(usersCollection().authWithPassword).not.toHaveBeenCalled();
  });

  it("mengembalikan 401 jika token caller tidak valid atau kedaluwarsa", async () => {
    mockState.callerAuthShouldFail = true;

    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/tidak valid|kedaluwarsa/i);
    expect(usersCollection().authWithPassword).not.toHaveBeenCalled();
  });

  it("menyimpan bearer token sebelum melakukan authRefresh", async () => {
    await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(mockState.authStoreSave).toHaveBeenCalledWith("fake-token", null);
    expect(usersCollection().authRefresh).toHaveBeenCalledOnce();
  });

  it("menolak JSON body yang tidak dapat diparse", async () => {
    const request = buildRequest(VALID_BODY);
    request.json = vi.fn().mockRejectedValue(new SyntaxError("Invalid JSON"));

    const res = await POST(asPostRequest(request));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body tidak valid" });
  });

  it.each([
    null,
    [],
    { ...VALID_BODY, userId: 123 },
    { ...VALID_BODY, password: 123, passwordConfirm: 123 },
  ])("menolak bentuk atau tipe body yang tidak valid: %j", async (body) => {
    const res = await POST(asPostRequest(buildRequest(body)));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/body tidak valid|field wajib/i);
    expect(usersCollection().authWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    { password: VALID_BODY.password, passwordConfirm: VALID_BODY.passwordConfirm },
    { userId: VALID_BODY.userId, passwordConfirm: VALID_BODY.passwordConfirm },
    { userId: VALID_BODY.userId, password: VALID_BODY.password },
    { ...VALID_BODY, userId: "   " },
  ])("menolak body dengan field wajib kosong: %j", async (body) => {
    const res = await POST(asPostRequest(buildRequest(body)));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/wajib/i);
    expect(usersCollection().authWithPassword).not.toHaveBeenCalled();
  });

  it("menolak jika password dan passwordConfirm berbeda", async () => {
    const res = await POST(asPostRequest(buildRequest({
      ...VALID_BODY,
      passwordConfirm: "differentPassword",
    })));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak cocok/i);
  });

  it("menolak password kurang dari 8 karakter", async () => {
    const res = await POST(asPostRequest(buildRequest({
      ...VALID_BODY,
      password: "short",
      passwordConfirm: "short",
    })));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/minimal 8 karakter/i);
  });

  it.each(["PB_SERVICE_EMAIL", "PB_SERVICE_PASSWORD"])(
    "mengembalikan 500 jika %s tidak dikonfigurasi",
    async (envName) => {
      delete process.env[envName];

      const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/service account belum/i);
      expect(usersCollection().authWithPassword).not.toHaveBeenCalled();
    },
  );

  it("mengembalikan 500 jika login service account gagal", async () => {
    mockState.serviceAuthShouldFail = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Gagal mengganti password");
    expect(usersCollection().update).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("mengganti password dengan service account untuk caller admin", async () => {
    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(usersCollection().authWithPassword).toHaveBeenCalledWith(
      "svc@example.test",
      "svc-password-xyz",
    );
    expect(usersCollection().update).toHaveBeenCalledWith(VALID_BODY.userId, {
      password: VALID_BODY.password,
      passwordConfirm: VALID_BODY.passwordConfirm,
    });
  });

  it("tidak membocorkan detail error PocketBase ke client", async () => {
    usersCollection().update.mockRejectedValue(
      new Error("DB connection lost: server-123.internal"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(asPostRequest(buildRequest(VALID_BODY)));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Gagal mengganti password" });
    expect(JSON.stringify(body)).not.toContain("server-123.internal");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
