// Cloudflare Pages Function：POST /api/analyze
import { handleAnalyze } from "../../lib/core.js";
export const onRequest = ({ request, env }) => handleAnalyze(request, env);
