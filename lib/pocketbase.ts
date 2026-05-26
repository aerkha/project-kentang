import PocketBase from "pocketbase";

const pb = new PocketBase(
  process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090"
);

// Persist auth across page refreshes (SDK handles via localStorage)
pb.autoCancellation(false);

export default pb;
