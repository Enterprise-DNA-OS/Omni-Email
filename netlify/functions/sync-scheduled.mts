import type { Config } from "@netlify/functions";

// Runs every 5 minutes — triggers the background sync function
export default async () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const cronSecret = process.env.SYNC_CRON_SECRET;
  if (!appUrl || !cronSecret) {
    console.log("Missing NEXT_PUBLIC_APP_URL or SYNC_CRON_SECRET");
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/background-sync`, {
      method: "POST",
      headers: { "x-sync-secret": cronSecret },
    });
    console.log(`Sync triggered: ${res.status}`);
  } catch (e) {
    console.error("Sync trigger failed:", e);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *", // Every 5 minutes
};
