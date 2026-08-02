import { useState, useEffect } from 'react';

export const useFileCache = (url: string | undefined) => {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!url) {
      setIsLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let isMounted = true;

    const loadFile = async () => {
      setIsLoading(true);
      try {
        const cache = await caches.open('chat-media-cache-v1');
        const cachedResponse = await cache.match(url);

        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          objectUrl = URL.createObjectURL(blob);
          if (isMounted) setCachedUrl(objectUrl);
        } else {
          const response = await fetch(url);
          if (response.ok) {
            cache.put(url, response.clone());
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            if (isMounted) setCachedUrl(objectUrl);
          }
        }
      } catch (err) {
        console.error("Cache fetch failed:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadFile();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { cachedUrl, isLoading };
};
