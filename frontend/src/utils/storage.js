// IndexedDB Storage for persisting videos and their crop metadata across page refreshes

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
 * Saves the current list of videos to IndexedDB.
 * Preserves the File objects and crop definitions.
 */
export async function saveVideosToDB(videos) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear existing records to keep exact list and ordering
    await new Promise((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      // Try to save full item with File object
      try {
        const item = {
          id: v.id,
          name: v.name,
          path: v.path,
          file: v.file || null,
          status: v.status || 'Pendente',
          crop: v.crop || null,
          order: i
        };
        store.put(item);
      } catch (e) {
        // Fallback without large File object if quota exceeded
        console.warn('Quota exceeded or file serialisation issue, saving metadata only:', e);
        const itemFallback = {
          id: v.id,
          name: v.name,
          path: v.path,
          file: null,
          status: v.status || 'Pendente',
          crop: v.crop || null,
          order: i
        };
        store.put(itemFallback);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error saving to IndexedDB:', err);
  }
}

/**
 * Loads persisted videos from IndexedDB and recreates blob URLs.
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
        crop: item.crop || null
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
