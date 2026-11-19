// Cloudflare Pages Function：GET /api/config
import { handleConfig } from "../../lib/core.js";
export const onRequest = ({ env }) => handleConfig(env);
