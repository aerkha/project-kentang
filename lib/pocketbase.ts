import PocketBase from "pocketbase";

const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";

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

export default pb;
