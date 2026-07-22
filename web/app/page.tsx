"use client";
// "/" on the APP host is a pure dispatcher again: token -> inbox, else -> login.
// The marketing landing lives on the apex (simpulx.com) as static files; a
// second landing here duplicated it and confused what the app host is for.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/inbox" : "/login");
  }, [router]);
  return null;
}
