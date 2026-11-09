// IndexedDB Storage for persisting videos metadata and crop definitions across app restarts

const DB_NAME = 'star_store';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves video metadata and crop definitions to IndexedDB.
 * NOTE: Does NOT store heavy raw File/Blob objects to prevent disk I/O freezes
 * and WebKit/WebView crashes when editing crops with multiple large videos.
 */
export async function saveVideosToDB(videos) {
  if (!videos) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Get current keys to cleanly remove any items that were deleted
    const existingKeys = await new Promise((resolve) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(new Set(req.result));
      req.onerror = () => resolve(new Set());
    });

    const activeIds = new Set();
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (!v || v.id == null) continue;
      activeIds.add(v.id);

      // Lightweight metadata only (~150 bytes per item vs 2GB binary file)
      const item = {
        id: v.id,
        name: v.name || '',
        path: v.path || v.name || '',
        status: v.status || 'Pendente',
        crop: v.crop || null,
        width: v.width || null,
        height: v.height || null,
        order: i
      };

      store.put(item);
    }

    // Remove deleted keys without needing a disruptive store.clear()
    for (const oldKey of existingKeys) {
      if (!activeIds.has(oldKey)) {
        store.delete(oldKey);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error saving metadata to IndexedDB:', err);
  }
}

/**
 * Loads persisted video metadata from IndexedDB.
 */
export async function loadVideosFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const items = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return items.map(item => {
      let blobUrl = null;
      if (item.file) {
        try {
          blobUrl = URL.createObjectURL(item.file);
        } catch (e) {
          console.warn('Failed to recreate blob URL:', e);
        }
      }
      return {
        id: item.id,
        name: item.name,
        path: item.path,
        file: item.file || null,
        blobUrl,
        status: item.status || 'Pendente',
        crop: item.crop || null,
        width: item.width || null,
        height: item.height || null
      };
    });
  } catch (err) {
    console.warn('Error loading from IndexedDB:', err);
    return [];
  }
}

/**
 * Clears all saved videos from IndexedDB.
 */
export async function clearVideosFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (err) {
    console.warn('Error clearing IndexedDB:', err);
  }
}
