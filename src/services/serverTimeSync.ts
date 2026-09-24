/**
 * WINX7 Synchronized Server Time Service
 * Maintains continuous synchronization between client and server/database clocks.
 * Guarantees accurate, drift-free execution for automatic match status transitions.
 */

let serverClockOffset = 0;
let lastSyncTimestamp = 0;
let isSyncing = false;

// Listeners for synchronized ticks
const tickListeners = new Set<(syncedNow: number) => void>();

/**
 * Fetch authoritative server time from the backend API
 */
export async function syncServerTime(): Promise<number> {
  if (isSyncing) return getSynchronizedServerTime();
  isSyncing = true;
  
  const clientSendTime = Date.now();
  try {
    const res = await fetch('/api/time', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const clientReceiveTime = Date.now();
      const roundTripTime = clientReceiveTime - clientSendTime;
      const serverTimestamp = typeof data.serverTimeMs === 'number' ? data.serverTimeMs : new Date(data.serverIso).getTime();
      
      // Calculate offset taking estimated one-way latency into account
      const estimatedServerNow = serverTimestamp + Math.floor(roundTripTime / 2);
      serverClockOffset = estimatedServerNow - clientReceiveTime;
      lastSyncTimestamp = Date.now();
    }
  } catch (err) {
    // If fetch fails (e.g. offline preview), offset remains unchanged
    console.debug('[ServerTimeSync] Notice using current offset:', err);
  } finally {
    isSyncing = false;
  }

  return getSynchronizedServerTime();
}

/**
 * Get the current timestamp in milliseconds synchronized with the server clock
 */
export function getSynchronizedServerTime(): number {
  return Date.now() + serverClockOffset;
}

/**
 * Get the current Date object synchronized with the server clock
 */
export function getSynchronizedServerDate(): Date {
  return new Date(getSynchronizedServerTime());
}

/**
 * Subscribe to synchronized clock ticks (every second)
 */
export function subscribeServerTimeTick(callback: (syncedNow: number) => void): () => void {
  tickListeners.add(callback);
  return () => {
    tickListeners.delete(callback);
  };
}

// Global 1-second ticker dispatching synchronized time
if (typeof window !== 'undefined') {
  // Initial sync immediately on load
  syncServerTime();

  // Re-sync every 30 seconds to adjust for any client clock drift
  setInterval(() => {
    syncServerTime();
  }, 30 * 1000);

  // Dispatch synchronized ticks every second
  setInterval(() => {
    const now = getSynchronizedServerTime();
    tickListeners.forEach(listener => {
      try {
        listener(now);
      } catch (e) {
        console.error('[ServerTimeSync] Listener error:', e);
      }
    });
  }, 1000);
}
