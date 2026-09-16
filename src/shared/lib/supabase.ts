import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://ynfqpwmzhsmkhltyugow.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InluZnFwd216aHNta2hsdHl1Z293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDY0NjcsImV4cCI6MjEwNTA4MjQ2N30.VIrJI3eIagbYGkpgcNeAG7fNksLQpnYW0MEk83DIt5w";

/** The only Supabase client used by the application. */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's React Native quickstart recommends toggling refresh with the app
// lifecycle. Register this listener once, next to the singleton client.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
