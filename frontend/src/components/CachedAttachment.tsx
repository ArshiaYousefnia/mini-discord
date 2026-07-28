import { useFileCache } from "../hooks/useFileCache";

type Props = {
  attachment: any;
};

export default function CachedAttachment({ attachment }: Props) {
  const originalUrl = attachment.file_url || attachment.url;
  
  // Fetch from cache, fallback to original URL if cache is loading or fails
  const { cachedUrl } = useFileCache(originalUrl);
  const activeUrl = cachedUrl || originalUrl;

  const fileName = attachment.original_filename || attachment.file_name || "Attachment";
  const fileSizeBytes = attachment.size ?? attachment.file_size ?? 0;
  const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension);
  const isVideo = ["mp4", "webm", "ogg", "mov"].includes(extension);
  const isAudio = ["mp3", "wav", "ogg", "aac", "m4a", "flac"].includes(extension);

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
        <a href={activeUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
          <img
            src={activeUrl}
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
          src={activeUrl} // <-- Uses cached URL here
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
        <audio controls src={activeUrl} style={{ width: "100%", height: "36px" }}>
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  // Document / Default Download Card
  return (
    <a
      href={activeUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName}
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
