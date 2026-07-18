import { useEffect, useRef, useState } from "react";
import { searchMessages, MIN_SEARCH_QUERY_LENGTH } from "../services/chatService";
import type { Message } from "../types/chat";
import "../styles/chat-search.css";

const DEBOUNCE_MS = 350;
const SNIPPET_RADIUS = 42; // characters shown on each side of the match

interface Props {
  conversationId: string;
  onClose: () => void;
  onResultClick: (message: Message) => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` around the (case-insensitive) matches of `query` and
 * wraps each match in a <mark>, so we highlight without ever using
 * dangerouslySetInnerHTML on user-generated content.
 */
function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegExp(query.trim())})`, "gi");
  // With a capturing group, String.split keeps the matched substrings in
  // the output array at the odd indices, alternating with the non-matching
  // text around them - so index parity alone tells us which parts to
  // highlight (no need for a stateful regex.test() call here).
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="search-result-highlight">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function buildSnippet(content: string, query: string): string {
  const needle = query.trim().toLowerCase();
  const haystack = content.toLowerCase();
  const matchIndex = haystack.indexOf(needle);

  if (matchIndex === -1) {
    return content.length > SNIPPET_RADIUS * 2
      ? `${content.slice(0, SNIPPET_RADIUS * 2)}…`
      : content;
  }

  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(content.length, matchIndex + needle.length + SNIPPET_RADIUS);

  let snippet = content.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;

  return snippet;
}

function formatResultTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return `${date.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

export default function MessageSearchPanel({ conversationId, onClose, onResultClick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<number | null>(null);
  // Guards against a slow, stale request overwriting the results of a
  // faster, more recent one.
  const latestQueryRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the panel whenever the conversation changes.
  useEffect(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
  }, [conversationId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();

    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      latestQueryRef.current = trimmed;
      try {
        const matches = await searchMessages(conversationId, trimmed);
        // Only apply the results if this is still the latest query typed.
        if (latestQueryRef.current === trimmed) {
          setResults(matches);
          setHasSearched(true);
        }
      } catch (err) {
        console.error("Message search failed:", err);
        if (latestQueryRef.current === trimmed) {
          setResults([]);
          setHasSearched(true);
        }
      } finally {
        if (latestQueryRef.current === trimmed) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, conversationId]);

  const trimmedQuery = query.trim();
  const belowMinLength = trimmedQuery.length > 0 && trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH;
  const showEmptyState =
    !loading && hasSearched && trimmedQuery.length >= MIN_SEARCH_QUERY_LENGTH && results.length === 0;

  return (
    <div className="message-search-panel slideInRight">
      <div className="message-search-header">
        <button className="back-button" onClick={onClose} type="button">
          ← Close
        </button>
        <h3>Search Messages</h3>
      </div>

      <div className="message-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Search in this chat..."
          className="message-search-input"
          maxLength={500}
        />
        {loading && <span className="message-search-spinner" aria-label="Searching" />}
      </div>

      <div className="message-search-results">
        {belowMinLength && (
          <div className="message-search-hint">
            Type at least {MIN_SEARCH_QUERY_LENGTH} characters to search
          </div>
        )}

        {showEmptyState && (
          <div className="message-search-empty">
            No results found for "{trimmedQuery}"
          </div>
        )}

        {!loading &&
          results.map((message) => (
            <button
              type="button"
              key={message.id}
              className="message-search-result-row"
              onClick={() => onResultClick(message)}
            >
              <div className="message-search-result-top">
                <span className="message-search-result-sender">
                  {message.sender_display_name || message.sender_username}
                </span>
                <span className="message-search-result-time">
                  {formatResultTimestamp(message.created_at)}
                </span>
              </div>
              <div className="message-search-result-snippet">
                <HighlightedSnippet
                  text={buildSnippet(message.content ?? "", trimmedQuery)}
                  query={trimmedQuery}
                />
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
