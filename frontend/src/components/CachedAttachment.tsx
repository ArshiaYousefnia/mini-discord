import { useState, useEffect } from "react";
import { get, set } from "idb-keyval"; // Using idb-keyval for IndexedDB storage

type Props = {
  attachment: any;
};

export default function CachedAttachment({ attachment }: Props) {
  const originalUrl = attachment.file_url || attachment.url;
  const fileName = attachment.original_filename || attachment.file_name || "Attachment";
  const fileSizeBytes = attachment.size ?? attachment.file_size ?? 0;
  const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension);
  const isVideo = ["mp4", "webm", "ogg", "mov"].includes(extension);
  const isAudio = ["mp3", "wav", "ogg", "aac", "m4a", "flac"].includes(extension);

  // --- Caching State ---
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 1. Check if we already have this file in IndexedDB on mount
  useEffect(() => {
    let active = true;

    const checkCache = async () => {
      try {
        const cachedBlob = await get(originalUrl);
        if (cachedBlob && active) {
          setBlobUrl(URL.createObjectURL(cachedBlob));
        }
      } catch (err) {
        console.error("Failed to read from IndexedDB", err);
      }
    };

    checkCache();

    return () => {
      active = false;
    };
  }, [originalUrl]);

  // 2. Memory cleanup for Blob URLs
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // 3. Lazy Download Handler (Only triggers when user clicks)
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDownloading(true);
    try {
      const response = await fetch(originalUrl);
      if (!response.ok) throw new Error("Failed to fetch from backend");
      
      const blob = await response.blob();
      
      // Save to cache and generate local URL
      await set(originalUrl, blob);
      setBlobUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error("Error downloading file:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // --- RENDER LOGIC ---

  // STATE A: Uncached (Show Metadata & Download Button)
  if (!blobUrl) {
    return (
      <div
        className="attachment-uncached-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 12px",
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          border: "1px dashed rgba(255, 255, 255, 0.2)",
          borderRadius: "8px",
          maxWidth: "340px",
        }}
      >
        <div style={{ fontSize: "24px", flexShrink: 0 }}>
          {isImage ? "🖼️" : isVideo ? "🎬" : isAudio ? "🎵" : "📄"}
        </div>
        <div style={{ overflow: "hidden", flexGrow: 1 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: "14px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {fileName}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
            {fileSizeBytes > 0 ? `${sizeMB} MB` : "Unknown Size"}
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            backgroundColor: isDownloading ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.2)",
            color: "inherit",
            border: "none",
            borderRadius: "6px",
            cursor: isDownloading ? "not-allowed" : "pointer",
            fontSize: "12px",
            fontWeight: 500,
            transition: "background-color 0.2s",
          }}
        >
          {isDownloading ? "..." : "⬇️ Load"}
        </button>
      </div>
    );
  }

  // STATE B: Cached & Ready to Render (Uses blobUrl)

  if (isImage) {
    return (
      <div
        className="attachment-image-wrapper"
        style={{
          borderRadius: "8px",
          overflow: "hidden",
          maxWidth: "100%",
          maxHeight: "300px",
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}
      >
        <a href={blobUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
          <img
            src={blobUrl}
            alt={fileName}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
            }}
          />
        </a>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="attachment-video-wrapper" style={{ borderRadius: "8px", overflow: "hidden", maxWidth: "100%" }}>
        <video
          controls
          src={blobUrl}
          style={{
            maxWidth: "100%",
            maxHeight: "300px",
            display: "block",
            borderRadius: "8px",
            backgroundColor: "#000",
          }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="attachment-audio-wrapper" style={{ width: "100%", minWidth: "240px", padding: "4px 0" }}>
        <audio controls src={blobUrl} style={{ width: "100%", height: "36px" }}>
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  // Document / Default Download Card (Now uses the local Blob URL)
  return (
    <a
      href={blobUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName} // This triggers an OS download from the cached blob
      className="attachment-document-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "8px",
        textDecoration: "none",
        color: "inherit",
        transition: "background-color 0.2s ease",
      }}
    >
      <div style={{ fontSize: "24px", flexShrink: 0 }}>📄</div>
      <div style={{ overflow: "hidden", flexGrow: 1 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: "14px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fileName}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
          {fileSizeBytes > 0 ? `${sizeMB} MB` : "Document"}
        </div>
      </div>
      <div style={{ fontSize: "18px", flexShrink: 0, opacity: 0.8 }}>⬇️</div>
    </a>
  );
}
