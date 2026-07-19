"use client";
import { useCallback, useEffect, useState } from "react";

// Anonymous favourites for the public listing site: kept in localStorage, keyed
// per org so two client sites never share a shortlist. Deliberately NOT an
// account feature -- asking a browsing buyer to sign up just to save a unit is
// exactly the friction that loses the lead before WhatsApp ever opens.

const key = (org: string) => `simpulx:fav:${org}`;

export function useFavourites(org: string) {
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key(org));
      setFavs(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFavs([]);
    }
  }, [org]);

  const persist = useCallback((next: string[]) => {
    setFavs(next);
    try { window.localStorage.setItem(key(org), JSON.stringify(next)); } catch { /* private mode / quota */ }
  }, [org]);

  const toggle = useCallback((slug: string) => {
    setFavs((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      try { window.localStorage.setItem(key(org), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [org]);

  const isFav = useCallback((slug: string) => favs.includes(slug), [favs]);

  return { favs, toggle, isFav, persist };
}
