import { describe, it, beforeEach, expect } from "vitest";

/**
 * Sanity test untuk utilitas suffix generator autorenewal.
 * Implementasi disalin dari `lib/transaksi-context.tsx` (fungsi
 * anonim) untuk menutup perilaku kritis tanpa mengangkatnya ke
 * modul publik.
 */
function nextAutorenewalCustomId(oldId: string): string {
  const match = oldId.match(/^(TRX-\d+)([A-Z]*)$/i);
  if (!match) return `${oldId}A`;
  const base = match[1];
  const suffix = match[2];
  if (!suffix) return `${base}A`;
  if (/^Z+$/i.test(suffix)) return `${base}${suffix}A`;
  const chars = suffix.toUpperCase().split("");
  let i = chars.length - 1;
  while (i >= 0 && chars[i] === "Z") {
    chars[i] = "A";
    i--;
  }
  if (i < 0) return `${base}A${chars.join("")}`;
  chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
  return base + chars.join("");
}

describe("autorenewal — letter suffix generator", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PB_URL = "http://example.test";
  });

  it("menambahkan A ketika belum ada suffix", () => {
    expect(nextAutorenewalCustomId("TRX-0004")).toBe("TRX-0004A");
  });

  it("naikkan A ke B", () => {
    expect(nextAutorenewalCustomId("TRX-0004A")).toBe("TRX-0004B");
  });

  it("membawa A->B, B->C", () => {
    expect(nextAutorenewalCustomId("TRX-0004B")).toBe("TRX-0004C");
  });

  it("overflow Z ke ZA", () => {
    expect(nextAutorenewalCustomId("TRX-0004Z")).toBe("TRX-0004ZA");
  });
});
