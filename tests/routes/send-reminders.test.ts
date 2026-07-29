import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  runReminders: vi.fn(),
  runRemindersTest: vi.fn(),
}));

const pocketBaseMocks = vi.hoisted(() => ({
  authStoreSave: vi.fn(),
  authRefresh: vi.fn(),
}));

vi.mock("@/lib/send-reminders-core", () => coreMocks);

vi.mock("pocketbase", () => ({
  default: class PocketBase {
    authStore = {
      save: pocketBaseMocks.authStoreSave,
    };

    collection(name: string) {
      if (name !== "users") {
        throw new Error(`Unexpected collection: ${name}`);
      }
      return { authRefresh: pocketBaseMocks.authRefresh };
    }
  },
}));

import { GET, POST } from "../../app/api/send-reminders/route";

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  ADMIN_TEST_TOKEN: process.env.ADMIN_TEST_TOKEN,
  NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL,
};

type RequestOptions = {
  authorization?: string;
  testToken?: string;
};

function buildGetRequest(url: string, options: RequestOptions = {}) {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set("authorization", options.authorization);
  }
  if (options.testToken !== undefined) {
    headers.set("x-test-token", options.testToken);
  }

  return {
    headers,
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

function buildPostRequest(options: RequestOptions = {}) {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set("authorization", options.authorization);
  }

  return { headers } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  process.env.ADMIN_TEST_TOKEN = "admin-test-token";
  process.env.NEXT_PUBLIC_PB_URL = "http://example.test";

  coreMocks.runReminders.mockResolvedValue({
    status: 200,
    body: { sent: 2 },
  });
  coreMocks.runRemindersTest.mockResolvedValue({
    status: 200,
    body: { mode: "test", adminEmail: "sent", waStatus: "skipped" },
  });
  pocketBaseMocks.authRefresh.mockResolvedValue({ record: { role: "admin" } });
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/send-reminders", () => {
  it("menolak request saat CRON_SECRET tidak dikonfigurasi", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(buildGetRequest("http://example.test/api/send-reminders", {
      authorization: "Bearer cron-secret",
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(coreMocks.runReminders).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "Bearer wrong-secret", "cron-secret"])(
    "menolak Authorization cron yang tidak valid: %j",
    async (authorization) => {
      const res = await GET(buildGetRequest(
        "http://example.test/api/send-reminders",
        { authorization },
      ));

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(coreMocks.runReminders).not.toHaveBeenCalled();
    },
  );

  it("menjalankan reminder dalam mode cron secara default", async () => {
    coreMocks.runReminders.mockResolvedValue({
      status: 503,
      body: { sent: 0, errors: ["Tidak ada channel notifikasi yang aktif"] },
    });

    const res = await GET(buildGetRequest("http://example.test/api/send-reminders", {
      authorization: "Bearer cron-secret",
    }));

    expect(coreMocks.runReminders).toHaveBeenCalledOnce();
    expect(coreMocks.runReminders).toHaveBeenCalledWith("cron");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      sent: 0,
      errors: ["Tidak ada channel notifikasi yang aktif"],
    });
  });

  it("menjalankan reminder dalam mode manual saat query manual=true", async () => {
    const res = await GET(buildGetRequest(
      "http://example.test/api/send-reminders?manual=true",
      { authorization: "Bearer cron-secret" },
    ));

    expect(coreMocks.runReminders).toHaveBeenCalledWith("manual");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2 });
  });

  it("tidak menganggap nilai query manual selain true sebagai mode manual", async () => {
    await GET(buildGetRequest(
      "http://example.test/api/send-reminders?manual=1",
      { authorization: "Bearer cron-secret" },
    ));

    expect(coreMocks.runReminders).toHaveBeenCalledWith("cron");
  });

  it("menolak test mode saat ADMIN_TEST_TOKEN kosong", async () => {
    process.env.ADMIN_TEST_TOKEN = "   ";

    const res = await GET(buildGetRequest(
      "http://example.test/api/send-reminders?test=true",
      { authorization: "Bearer cron-secret", testToken: "admin-test-token" },
    ));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/test mode dinonaktifkan/i);
    expect(coreMocks.runRemindersTest).not.toHaveBeenCalled();
    expect(coreMocks.runReminders).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "wrong-token"])(
    "menolak test mode dengan X-Test-Token tidak valid: %j",
    async (testToken) => {
      const res = await GET(buildGetRequest(
        "http://example.test/api/send-reminders?test=true",
        { authorization: "Bearer cron-secret", testToken },
      ));

      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/x-test-token header tidak valid/i);
      expect(coreMocks.runRemindersTest).not.toHaveBeenCalled();
      expect(coreMocks.runReminders).not.toHaveBeenCalled();
    },
  );

  it("menjalankan test mode hanya dengan kedua token yang valid", async () => {
    coreMocks.runRemindersTest.mockResolvedValue({
      status: 202,
      body: { mode: "test", adminEmail: "sent" },
    });

    const res = await GET(buildGetRequest(
      "http://example.test/api/send-reminders?test=true&manual=true",
      {
        authorization: "Bearer cron-secret",
        testToken: "admin-test-token",
      },
    ));

    expect(coreMocks.runRemindersTest).toHaveBeenCalledOnce();
    expect(coreMocks.runReminders).not.toHaveBeenCalled();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ mode: "test", adminEmail: "sent" });
  });
});

describe("POST /api/send-reminders", () => {
  it.each([undefined, "", "Basic fake-token", "Bearer "])(
    "menolak bearer token pengguna yang kosong/tidak valid: %j",
    async (authorization) => {
      const res = await POST(buildPostRequest({ authorization }));

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized access" });
      expect(pocketBaseMocks.authStoreSave).not.toHaveBeenCalled();
      expect(coreMocks.runReminders).not.toHaveBeenCalled();
    },
  );

  it.each(["user", "investor"])("menolak caller dengan role %s", async (role) => {
    pocketBaseMocks.authRefresh.mockResolvedValue({ record: { role } });

    const res = await POST(buildPostRequest({ authorization: "Bearer user-token" }));

    expect(pocketBaseMocks.authStoreSave).toHaveBeenCalledWith("user-token", null);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/hanya admin/i);
    expect(coreMocks.runReminders).not.toHaveBeenCalled();
  });

  it("mengembalikan generic 500 jika authRefresh gagal", async () => {
    pocketBaseMocks.authRefresh.mockRejectedValue(
      new Error("PocketBase http://internal-host:8090 unavailable"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(buildPostRequest({ authorization: "Bearer expired-token" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Terjadi kesalahan pada server" });
    expect(coreMocks.runReminders).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("menjalankan reminder manual untuk caller admin dan meneruskan hasil core", async () => {
    coreMocks.runReminders.mockResolvedValue({
      status: 502,
      body: { sent: 0, adminEmailStatus: "failed" },
    });

    const res = await POST(buildPostRequest({ authorization: "Bearer admin-token" }));

    expect(pocketBaseMocks.authStoreSave).toHaveBeenCalledWith("admin-token", null);
    expect(pocketBaseMocks.authRefresh).toHaveBeenCalledOnce();
    expect(coreMocks.runReminders).toHaveBeenCalledOnce();
    expect(coreMocks.runReminders).toHaveBeenCalledWith("manual");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ sent: 0, adminEmailStatus: "failed" });
  });

  it("mengembalikan generic 500 jika mesin reminder melempar error", async () => {
    coreMocks.runReminders.mockRejectedValue(new Error("Sensitive SMTP failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(buildPostRequest({ authorization: "Bearer admin-token" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Terjadi kesalahan pada server" });
    expect(JSON.stringify(body)).not.toContain("Sensitive SMTP failure");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
