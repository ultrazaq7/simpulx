"use client";
// Firebase Cloud Messaging (web push). The web config below is public by design
// (the apiKey is an app identifier, not a secret). VAPID_KEY is the Web Push
// public key from Firebase console > Cloud Messaging > Web Push certificates.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, deleteToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBZPxwDLJEzQ3vl25xXoWxpIVTXnxyB49U",
  authDomain: "simpulx-1.firebaseapp.com",
  projectId: "simpulx-1",
  storageBucket: "simpulx-1.firebasestorage.app",
  messagingSenderId: "1077409983428",
  appId: "1:1077409983428:web:9950dd86dfd773dae35291",
  measurementId: "G-F3TEV9FR9Z",
};

// Web Push public key (Firebase console > Cloud Messaging > Web Push certificates).
export const VAPID_KEY = "BLzgR8gfe4XgX9qffaC6PNbUtMArVWJdS55KtLI30S3eNK1ULfKWfzc2xAnpoCvQv-wzWgGRN2jrGbzDvvraDsc";

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function getMessagingClient(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported().catch(() => false))) return null;
  return getMessaging(firebaseApp());
}

export { getToken, deleteToken, onMessage };
