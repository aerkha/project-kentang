import PocketBase from "pocketbase";
import { getPbBaseUrl } from "./pb-base-url";

// `const PB_URL = getPbBaseUrl()` di-evaluasi saat module load.
// Kalau env invalid, Surface error sedini mungkin (gagal import modul
// lebih baik daripada gagal 100 request kemudian).
const PB_URL = getPbBaseUrl();

const pb = new PocketBase(PB_URL);

// Persist auth across page refreshes (SDK handles via localStorage)
pb.autoCancellation(false);

// SSR-safe accessor for contexts that may be touched during server rendering.
// During SSR we return a throwaway instance so we never share module-scoped
// state (auth, file cache) between requests.
export function getPb(): PocketBase {
  if (typeof window === "undefined") {
    return new PocketBase(PB_URL);
  }
  return pb;
}

// Re-export untuk backward compatibility. Sebaiknya import langsung dari
// `./pb-base-url` di code baru — terutama route handler yang mock
// `pocketbase` (supaya tidak trigger module-side-effects ini).
export { getPbBaseUrl };

export default pb;
