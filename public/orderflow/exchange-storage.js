const LEGACY_KEY = "metabear.exchange.v2";
const FALLBACK_KEY = "metabear.exchange.v3.fallback";
let database;

function open() {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("metabear-exchange", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("Storage unavailable"));
  });
  return database;
}

async function transaction(mode, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saves", mode);
    const store = tx.objectStore("saves");
    const request =
      mode === "readonly" ? store.get("current") : store.put(value, "current");
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Save aborted"));
  });
}

export async function readSave() {
  let stored;
  try {
    stored = await transaction("readonly");
  } catch {
    /* Local fallback below. */
  }
  let fallback, legacy;
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) fallback = JSON.parse(raw);
    legacy = localStorage.getItem(LEGACY_KEY);
  } catch {
    /* Restricted storage still permits an in-memory game. */
  }
  return (
    (fallback && (!stored || fallback.savedAt > stored.savedAt)
      ? fallback
      : stored
    )?.raw || legacy
  );
}

export async function writeSave(raw) {
  const value = { raw, savedAt: Date.now() };
  try {
    await transaction("readwrite", value);
  } catch {
    // Small games can still save in browsers where IndexedDB is disabled.
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
    return;
  }
  try {
    localStorage.removeItem(FALLBACK_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* The authoritative write already completed. */
  }
}
