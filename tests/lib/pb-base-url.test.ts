import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getPbBaseUrl } from "@/lib/pb-base-url";

const original = process.env.NEXT_PUBLIC_PB_URL;

describe("getPbBaseUrl — normalisasi URL PocketBase", () => {
  beforeEach(() => {
    // Env di-reset per test.
    delete process.env.NEXT_PUBLIC_PB_URL;
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_PB_URL;
    } else {
      process.env.NEXT_PUBLIC_PB_URL = original;
    }
  });

  it("strip /_/ suffix (bug utama)", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://103.103.21.206:8090/_/";
    expect(getPbBaseUrl()).toBe("http://103.103.21.206:8090");
  });

  it("strip /api suffix", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://103.103.21.206:8090/api/";
    expect(getPbBaseUrl()).toBe("http://103.103.21.206:8090");
  });

  it("strip trailing slash", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://103.103.21.206:8090/";
    expect(getPbBaseUrl()).toBe("http://103.103.21.206:8090");
  });

  it("strip multiple trailing slashes", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://103.103.21.206:8090///";
    expect(getPbBaseUrl()).toBe("http://103.103.21.206:8090");
  });

  it("strip /_/ dengan nested path dan trailing slash", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://example.com/_/api/";
    expect(getPbBaseUrl()).toBe("http://example.com");
  });

  it("trim whitespace", () => {
    process.env.NEXT_PUBLIC_PB_URL = "  http://x.test:8090/   ";
    expect(getPbBaseUrl()).toBe("http://x.test:8090");
  });

  it("pass through URL yang sudah bersih", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://127.0.0.1:8090";
    expect(getPbBaseUrl()).toBe("http://127.0.0.1:8090");
  });

  it("fallback ke http://127.0.0.1:8090 saat env kosong", () => {
    process.env.NEXT_PUBLIC_PB_URL = "";
    expect(getPbBaseUrl()).toBe("http://127.0.0.1:8090");
  });

  it("fallback saat env undefined", () => {
    delete process.env.NEXT_PUBLIC_PB_URL;
    expect(getPbBaseUrl()).toBe("http://127.0.0.1:8090");
  });

  it("https dipertahankan", () => {
    process.env.NEXT_PUBLIC_PB_URL = "https://pb.example.com/_/";
    expect(getPbBaseUrl()).toBe("https://pb.example.com");
  });

  it("menolak protokol non-http(s) — ftp://", () => {
    process.env.NEXT_PUBLIC_PB_URL = "ftp://x.test/y";
    expect(() => getPbBaseUrl()).toThrow(/NEXT_PUBLIC_PB_URL tidak valid/);
  });

  it("menolak string yang bukan URL", () => {
    process.env.NEXT_PUBLIC_PB_URL = "bukan-url";
    expect(() => getPbBaseUrl()).toThrow(/NEXT_PUBLIC_PB_URL tidak valid/);
  });

  it("mempertahankan port khusus", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://192.168.1.10:8091/api/";
    expect(getPbBaseUrl()).toBe("http://192.168.1.10:8091");
  });
});
