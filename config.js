// Vercel Edge Function：GET /api/config
import { handleConfig } from "../lib/core.js";
export const config = { runtime: "edge" };
export default function handler() {
  return handleConfig(process.env);
}
