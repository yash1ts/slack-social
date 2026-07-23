"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  FileIcon,
  ImagePlus,
  Paperclip,
  Search,
  Smile,
  X,
} from "lucide-react";
import { EmojiPicker } from "./EmojiPicker";

type Channel = { id: string; name: string; memberCount: number | null };

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComposeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [query, setQuery] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (emojiOpen) setEmojiOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, emojiOpen]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setChannelId(null);
    setSelectedChannel(null);
    setChannels([]);
    setText("");
    setFiles((prev) => {
      for (const f of prev) f.previewUrl && URL.revokeObjectURL(f.previewUrl);
      return [];
    });
    setEmojiOpen(false);
    setError(null);
    setSent(false);
    setLoadingChannels(false);
  }, [open]);

  // Debounced search — only fetch when the user types
  useEffect(() => {
    if (!open || channelId) return;
    const q = query.trim().replace(/^#/, "");
    if (!q) {
      setChannels([]);
      setLoadingChannels(false);
      return;
    }

    const seq = ++searchSeq.current;
    setLoadingChannels(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/channels?q=${encodeURIComponent(q)}&limit=20`,
          );
          if (!res.ok) throw new Error("Failed to search channels");
          const data = (await res.json()) as { channels?: Channel[] };
          if (searchSeq.current !== seq) return;
          setChannels(data.channels ?? []);
          setError(null);
        } catch (err) {
          if (searchSeq.current !== seq) return;
          setError(err instanceof Error ? err.message : "Failed to search channels");
          setChannels([]);
        } finally {
          if (searchSeq.current === seq) setLoadingChannels(false);
        }
      })();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [open, query, channelId]);

  useEffect(() => {
    if (!open || !channelId) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open, channelId]);

  const selected = selectedChannel;
  const canPost = Boolean(channelId && (text.trim() || files.length > 0) && !sending);

  function insertEmoji(shortName: string) {
    const token = `:${shortName}:`;
    const el = textareaRef.current;
    if (!el) {
      setText((t) => `${t}${token}`);
      setEmojiOpen(false);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    setText(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function addFiles(list: FileList | null, imagesOnly = false) {
    if (!list?.length) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (imagesOnly && !file.type.startsWith("image/")) continue;
      if (files.length + next.length >= 8) break;
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl,
      });
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canPost || !channelId) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("channelId", channelId);
      form.set("text", text.trim());
      for (const f of files) form.append("files", f.file, f.file.name);

      const res = await fetch("/api/messages", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      setSent(true);
      setText("");
      setFiles((prev) => {
        for (const f of prev) f.previewUrl && URL.revokeObjectURL(f.previewUrl);
        return [];
      });
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSending(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close compose"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New message"
        className="relative z-[81] flex max-h-[88dvh] w-full max-w-[470px] flex-col rounded-t-2xl border border-[var(--border)] border-b-0 bg-[var(--surface)] shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
      >
        <div className="flex shrink-0 flex-col items-center">
          <div className="mt-2 h-1 w-10 rounded-full bg-[#3a3a3a]" />
          <div className="flex w-full items-center justify-between px-4 pb-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-white/5"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 className="text-[15px] font-semibold">New message</h2>
            <button
              type="button"
              disabled={!canPost}
              onClick={() => void submit()}
              className="rounded-full px-2 py-1 text-sm font-semibold text-[#3897f0] disabled:opacity-30"
            >
              {sending ? "…" : "Post"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {sent ? (
            <div className="flex flex-col items-center gap-2 py-16 text-[var(--muted)]">
              <Check size={28} className="text-[#3897f0]" />
              <p className="text-sm">Sent to #{selected?.name}</p>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Channel
                </p>
                {selected ? (
                  <button
                    type="button"
                    onClick={() => {
                      setChannelId(null);
                      setSelectedChannel(null);
                      setQuery("");
                      setChannels([]);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[#0f0f0f] px-3 py-2.5 text-left text-sm"
                  >
                    <span className="font-medium">#{selected.name}</span>
                    <span className="text-xs text-[var(--muted)]">Change</span>
                  </button>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[#0f0f0f] px-3 py-2">
                      <Search size={15} className="shrink-0 text-[var(--muted)]" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search channels…"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                        autoFocus
                      />
                    </div>
                    {!query.trim() ? (
                      <p className="py-6 text-center text-sm text-[var(--muted)]">
                        Type to search channels
                      </p>
                    ) : loadingChannels ? (
                      <p className="py-6 text-center text-sm text-[var(--muted)]">
                        Searching…
                      </p>
                    ) : channels.length === 0 ? (
                      <p className="py-6 text-center text-sm text-[var(--muted)]">
                        No channels found
                      </p>
                    ) : (
                      <ul className="max-h-[36dvh] overflow-y-auto rounded-xl border border-[var(--border)]">
                        {channels.map((c) => (
                          <li key={c.id} className="border-b border-[var(--border)] last:border-b-0">
                            <button
                              type="button"
                              onClick={() => {
                                setChannelId(c.id);
                                setSelectedChannel(c);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-white/5"
                            >
                              <span className="font-medium">#{c.name}</span>
                              {c.memberCount != null ? (
                                <span className="text-xs text-[var(--muted)]">
                                  {c.memberCount}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              {selected ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Message
                    </p>
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={`Message #${selected.name}`}
                      rows={4}
                      disabled={sending}
                      className="w-full resize-none rounded-xl border border-[var(--border)] bg-[#0f0f0f] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[#3897f0]/50"
                    />
                  </div>

                  {files.length > 0 ? (
                    <ul className="space-y-2">
                      {files.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[#0f0f0f] p-2"
                        >
                          {f.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={f.previewUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1c1c1c] text-[var(--muted)]">
                              <FileIcon size={18} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{f.file.name}</p>
                            <p className="text-xs text-[var(--muted)]">
                              {formatBytes(f.file.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove attachment"
                            onClick={() => removeFile(f.id)}
                            className="rounded-full p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                          >
                            <X size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="relative flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Add emoji"
                      onClick={() => setEmojiOpen((v) => !v)}
                      className={`rounded-lg p-2 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)] ${
                        emojiOpen ? "bg-white/5 text-[var(--text)]" : ""
                      }`}
                    >
                      <Smile size={20} />
                    </button>
                    <button
                      type="button"
                      aria-label="Add image"
                      onClick={() => imageInputRef.current?.click()}
                      className="rounded-lg p-2 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                    >
                      <ImagePlus size={20} />
                    </button>
                    <button
                      type="button"
                      aria-label="Add file"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg p-2 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                    >
                      <Paperclip size={20} />
                    </button>
                    <span className="ml-auto text-[11px] text-[var(--muted)]">
                      {files.length}/8 attachments
                    </span>

                    {emojiOpen ? (
                      <div className="absolute bottom-full left-0 z-10 mb-2 w-[min(100%,320px)]">
                        <EmojiPicker onPick={insertEmoji} />
                      </div>
                    ) : null}
                  </div>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files, true);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files, false);
                      e.target.value = "";
                    }}
                  />
                </div>
              ) : null}

              {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
