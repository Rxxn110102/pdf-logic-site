// Vercel Edge Function：POST /api/analyze
import { handleAnalyze } from "../lib/core.js";
export const config = { runtime: "edge" };
export default function handler(req) {
  return handleAnalyze(req, process.env);
}
