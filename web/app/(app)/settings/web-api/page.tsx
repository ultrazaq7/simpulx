"use client";
// Standalone "Web API" page (external lead sources / forms).
import { Suspense } from "react";
import { WebApiTab } from "../channels/WebApiTab";

export default function WebApiPage() {
  return <Suspense fallback={null}><WebApiTab /></Suspense>;
}
