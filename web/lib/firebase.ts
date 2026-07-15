"use client";
// Firebase Cloud Messaging (web push). The web config below is public by design
// (the apiKey is an app identifier, not a secret). VAPID_KEY is the Web Push
// public key from Firebase console > Cloud Messaging > Web Push certificates.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, deleteToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyC2QHoUeQqW5CpWKQkyccrD7FcgUttJ-M4",
  authDomain: "simpulx-ffbd1.firebaseapp.com",
  projectId: "simpulx-ffbd1",
  storageBucket: "simpulx-ffbd1.firebasestorage.app",
  messagingSenderId: "96923905702",
  appId: "1:96923905702:web:aa7c2f4fa426153b944e67",
  measurementId: "G-R24N6GGB76",
};

// Web Push public key (Firebase console > Cloud Messaging > Web Push certificates).
export const VAPID_KEY = "BLGCzcY_8ycu0wGlWDeM_xzN0uG-XmXgXQOLwvj3i-XoylXNhdLTKs5l6xJ-SiTycNkpJkKCj0Yh8VxuqalcZt0";

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function getMessagingClient(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported().catch(() => false))) return null;
  return getMessaging(firebaseApp());
}

export { getToken, deleteToken, onMessage };
