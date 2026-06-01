"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";

// /settings has no content of its own — every section is a real route now.
// Redirect to the first section so the bare URL always resolves.
export default function SettingsIndexPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/general"); }, [router]);
  return (
    <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
      <CircularProgress />
    </Box>
  );
}
