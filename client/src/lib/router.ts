import { useCallback, useEffect, useState } from "react";

/** Trivial hash-based router — no external deps. */

export type Route =
  | { name: "new" }
  | { name: "list" }
  | { name: "detail"; runId: string };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, "") || "/";
  if (h === "/" || h === "" || h === "/new") return { name: "new" };
  if (h === "/rfqs") return { name: "list" };
  const m = h.match(/^\/rfq\/([^/?#]+)$/);
  if (m && m[1]) return { name: "detail", runId: m[1] };
  return { name: "new" };
}

function readHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

export function useRoute(): Route {
  const [hash, setHash] = useState<string>(readHash);
  useEffect(() => {
    const fn = () => setHash(readHash());
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return parse(hash);
}

/** Navigate by changing the hash. */
export function navigate(path: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = path.startsWith("#") ? path : "#" + path;
}

export function useNavigate(): (path: string) => void {
  return useCallback((p: string) => navigate(p), []);
}

export const routes = {
  newRfq: "/",
  list: "/rfqs",
  detail: (runId: string) => `/rfq/${runId}`,
};
