"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface CardChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CardChatProps {
  cardId: string;
  colorTheme?: string;
  isOpen: boolean;
  showHint?: boolean;
  onOpenChange: (open: boolean) => void;
  onMessageCountChange: (count: number) => void;
  onDismissHint: () => void;
}

const USER_BUBBLE: Record<string, string> = {
  blue: "bg-blue-500 text-white",
  emerald: "bg-emerald-500 text-white",
  amber: "bg-amber-500 text-white",
  rose: "bg-rose-500 text-white",
  violet: "bg-violet-500 text-white",
  slate: "bg-stone-700 text-white dark:bg-stone-600",
};

export default function CardChat({
  cardId,
  colorTheme = "slate",
  isOpen,
  showHint = false,
  onOpenChange,
  onMessageCountChange,
  onDismissHint,
}: CardChatProps) {
  const [messages, setMessages] = useState<CardChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<CardChatMessage[] | null>(null);
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [isOpen, messages, isSending]);

  async function sendConversation(nextMessages: CardChatMessage[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/cards/${cardId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, messages: nextMessages }),
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Hmm, I couldn't connect. Try again?");
      }

      const assistantMessage: CardChatMessage = {
        role: "assistant",
        content: typeof data.reply === "string" ? data.reply : "I need a second try on that one.",
      };
      setMessages([...nextMessages, assistantMessage]);
      onMessageCountChange(
        typeof data.messageCount === "number" ? data.messageCount : nextMessages.length + 1
      );
      setPendingMessages(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Hmm, I couldn't connect. Try again?");
      setPendingMessages(nextMessages);
      setMessages(nextMessages);
    } finally {
      setIsSending(false);
    }
  }

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    onOpenChange(true);
    await sendConversation(nextMessages);
  };

  const handleRetry = async () => {
    if (!pendingMessages || isSending) return;
    await sendConversation(pendingMessages);
  };

  const userBubble = USER_BUBBLE[colorTheme] ?? USER_BUBBLE.slate;

  return (
    <div className="mt-4">
      <div className="relative flex items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-stone-700 dark:bg-stone-800/80">
        <div>
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-100">
            Talk to this card
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Ask why, compare ideas, or get a quick follow-up check.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showHint) onDismissHint();
            onOpenChange(!isOpen);
          }}
          className="shrink-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-100 dark:hover:bg-stone-900"
        >
          {isOpen ? "Close Chat" : "Chat with this card"}
          <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-mono text-stone-600 dark:bg-stone-700 dark:text-stone-300">
            C
          </span>
        </button>

        <AnimatePresence>
          {showHint && !isOpen && (
            <motion.button
              type="button"
              onClick={onDismissHint}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute left-4 top-full z-20 mt-2 max-w-xs rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800 shadow-lg dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-200"
            >
              Chat with your cards to understand deeper and level them up faster.
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="mt-3 overflow-hidden rounded-3xl border border-stone-200 bg-white/90 shadow-lg backdrop-blur-sm dark:border-stone-700 dark:bg-stone-800/90"
          >
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-100">Card Tutor</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                Short follow-ups work best here.
              </p>
            </div>

            <div
              ref={scrollRef}
              className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 && !isSending && (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400">
                  Ask for a simpler explanation, a worked example, or a quick check question.
                </div>
              )}

              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        isUser
                          ? userBubble
                          : "bg-stone-100 text-stone-700 dark:bg-stone-700/70 dark:text-stone-100"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl bg-stone-100 px-4 py-3 dark:bg-stone-700/70">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-2 w-2 rounded-full bg-stone-400 animate-pulse dark:bg-stone-300"
                        style={{ animationDelay: `${dot * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-stone-200 px-4 py-4 dark:border-stone-700">
              {error && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:bg-stone-900 dark:text-amber-200 dark:hover:bg-stone-800"
                  >
                    Retry
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-3">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask me anything about this topic..."
                  className="min-h-11 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={isSending || input.trim().length === 0}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-opacity ${
                    isSending || input.trim().length === 0
                      ? "cursor-not-allowed bg-stone-300 opacity-60 dark:bg-stone-700"
                      : userBubble
                  }`}
                >
                  Send
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
