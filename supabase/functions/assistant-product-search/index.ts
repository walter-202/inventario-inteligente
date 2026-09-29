import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SearchProduct = {
  id: number;
  lexical_score: number;
  exact_match: boolean;
  matched_queries?: string[];
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!accessToken || !url || !anonKey) return json({ error: "configuration_unavailable" }, 503);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

  let body: { mode?: unknown; query?: unknown; queryVariants?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.mode !== "search") return json({ error: "invalid_mode" }, 400);

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 256) : "";
  if (!query) return json({ error: "query_required" }, 400);
  const alternatives = Array.isArray(body.queryVariants)
    ? body.queryVariants
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 4)
    : [];
  const queries = [...new Set([query, ...alternatives])];
  const limitInput = Number(body.limit ?? 10);
  const limit = Number.isInteger(limitInput) ? Math.max(1, Math.min(limitInput, 20)) : 10;

  try {
    const results = await Promise.all(queries.map(async (term) => {
      const { data, error } = await userClient.rpc("assistant_search_products", {
        p_query: term,
        p_match_count: limit,
      });
      if (error) throw error;
      return (data ?? []) as SearchProduct[];
    }));

    const merged = new Map<number, SearchProduct>();
    results.forEach((products, index) => {
      const matchedQuery = queries[index];
      for (const product of products) {
        const existing = merged.get(product.id);
        if (!existing) {
          merged.set(product.id, { ...product, matched_queries: [matchedQuery] });
          continue;
        }
        existing.exact_match ||= product.exact_match;
        existing.lexical_score = Math.max(existing.lexical_score, product.lexical_score);
        if (!existing.matched_queries?.includes(matchedQuery)) existing.matched_queries?.push(matchedQuery);
      }
    });

    const products = [...merged.values()]
      .sort((left, right) => Number(right.exact_match) - Number(left.exact_match)
        || right.lexical_score - left.lexical_score
        || (right.matched_queries?.length ?? 0) - (left.matched_queries?.length ?? 0)
        || left.id - right.id)
      .slice(0, limit);
    return json({ products, searched_queries: queries });
  } catch (error) {
    console.error("assistant-product-search failed", error);
    return json({ error: "assistant_search_unavailable" }, 503);
  }
});
