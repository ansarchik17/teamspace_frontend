import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "../../chat/components/Icons";
import { TypingDots } from "../../chat/components/TypingDots";

import {
  smartAgentChatStream,
  cancelSmartAgentChatStream,
  SmartAgentApiError,
  listSmartAgentConversations,
  getSmartAgentConversation,
  renameSmartAgentConversation,
  deleteSmartAgentConversation,
  sendSmartAgentFeedback,
} from "../api/client";
import { SmartAgentWidgetRenderer } from "./SmartAgentWidgetRenderer";
import { SmartAgentTable as SmartAgentTableComponent } from "./SmartAgentTable";
import type { SmartAgentChatResponse, SmartAgentWidget, SmartAgentConversationSummary, SmartAgentTable } from "../types";
import { preprocessAndExtractTables, parseSourcesFromText, sanitizeSmartAgentAssistantText, SmartAgentSourceFiles } from "../utils";

interface SmartAgentPanelProps {
  token: string;
}

interface SmartAgentMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  widget?: SmartAgentWidget | null;
  tables?: SmartAgentTable[] | null;
  feedback?: "like" | "dislike" | null;
}

const isStructuredJsonReply = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
};

const stripStructuredReplyTail = (value: string): string => {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const jsonLineIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("[{") || trimmed.startsWith("{") || trimmed.startsWith("[");
  });

  if (jsonLineIndex === -1) {
    return value;
  }

  return lines
    .slice(0, jsonLineIndex)
    .join("\n")
    .trim();
};

const renderInlineMarkdown = (value: string): ReactNode[] => {
  const parts = value.split(/(\*\*[^*]+\*\*)/g);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const renderAssistantText = (text: string): ReactNode => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = (lines[i] ?? "").trim();
        const match = current.match(/^\d+\.\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1]);
        i += 1;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1 my-1">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = (lines[i] ?? "").trim();
        const match = current.match(/^[-*]\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1]);
        i += 1;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1 my-1">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    nodes.push(
      <p key={`p-${i}`} className="my-1">
        {renderInlineMarkdown(line)}
      </p>,
    );
    i += 1;
  }

  return nodes;
};

export function SmartAgentPanel({ token }: SmartAgentPanelProps) {
  const [messages, setMessages] = useState<SmartAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<unknown[]>([]);
  const [startFreshOnNextSend, setStartFreshOnNextSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingTextVisible, setStreamingTextVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const generationRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamRequestIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<number | null>(null);

  const [conversations, setConversations] = useState<SmartAgentConversationSummary[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const loadConversations = useCallback(async (showLoading = true) => {
    if (showLoading) setIsConversationsLoading(true);
    try {
      const list = await listSmartAgentConversations(token);
      const sorted = [...list].sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      setConversations(sorted);
      setConversationsError(null);
    } catch (loadError) {
      // Keep the last successful list visible. An unavailable history is not an empty history.
      setConversationsError(
        loadError instanceof SmartAgentApiError
          ? loadError.message
          : "Не удалось загрузить историю диалогов. Попробуйте ещё раз.",
      );
    } finally {
      if (showLoading) setIsConversationsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = async (convId: string) => {
    generationRef.current += 1;
    const requestGeneration = generationRef.current;
    
    setIsSending(true);
    setError(null);
    setStartFreshOnNextSend(false);
    
    try {
      const detail = await getSmartAgentConversation(token, convId);
      if (requestGeneration !== generationRef.current) return;
      
      setActiveConvId(detail.conv_id);
      setSessionId(detail.conv_id);
      setConversationHistory(detail.conversation_history || []);
      
      // Convert history to SmartAgentMessage
      const historyEntries = (detail.conversation_history || [])
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const role = (entry as any).role === "assistant" ? "assistant" : "user";
          const rawText = (entry as any).content || "";
          
          if (!rawText.trim() || ((entry as any).role !== "user" && (entry as any).role !== "assistant")) return null;
          
          let text = role === "assistant" ? sanitizeSmartAgentAssistantText(rawText) : rawText;
          let tables = (entry as any).tables;
          if (role === "assistant") {
            const parsed = preprocessAndExtractTables(text, tables);
            text = parsed.text;
            tables = parsed.tables;
          }
          
          return {
            id: Date.now() + Math.random(),
            role,
            text,
            widget: (() => {
              const rawWidget = (entry as any).widget || (entry as any).metadata;
              if (!rawWidget) return null;
              if (typeof rawWidget === "string") {
                try {
                  return JSON.parse(rawWidget);
                } catch {
                  return null;
                }
              }
              return rawWidget;
            })(),
            tables,
            feedback: (entry as any).feedback || null,
          } as SmartAgentMessage;
        })
        .filter(Boolean) as SmartAgentMessage[];
      
      setMessages(historyEntries);
    } catch (err) {
      if (requestGeneration !== generationRef.current) return;
      setError("Не удалось загрузить историю диалога");
    } finally {
      if (requestGeneration === generationRef.current) {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const appendAssistant = (payload: SmartAgentChatResponse, replaceMessageId?: number) => {
    const normalizedReply = payload.widget
      ? payload.widget.type === "task_created"
        ? "Подтверждено."
        : isStructuredJsonReply(payload.reply)
          ? ""
          : stripStructuredReplyTail(payload.reply)
      : payload.reply;
    const rawText = sanitizeSmartAgentAssistantText(normalizedReply || "Готово.");

    const parsed = preprocessAndExtractTables(rawText, payload.tables);

    setSessionId(payload.session_id || null);
    setActiveConvId(payload.session_id || null);
    setConversationHistory(Array.isArray(payload.conversation_history) ? payload.conversation_history : []);
    const assistantMessage: SmartAgentMessage = {
      id: replaceMessageId ?? Date.now(),
      role: "assistant",
      text: parsed.text,
      widget: payload.widget,
      tables: parsed.tables,
      feedback: null,
    };
    setMessages((prev) => {
      if (replaceMessageId === undefined) return [...prev, assistantMessage];
      return prev.map((message) => (message.id === replaceMessageId ? assistantMessage : message));
    });
  };

  const handleFeedback = async (msgIndex: number, feedback: "like" | "dislike") => {
    if (!sessionId) {
      console.warn("No session_id to submit feedback");
      return;
    }

    try {
      await sendSmartAgentFeedback(token, {
        session_id: sessionId,
        feedback,
      });

      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) {
          next[msgIndex] = {
            ...next[msgIndex],
            feedback,
          };
        }
        return next;
      });
    } catch (err) {
      alert("Не удалось сохранить оценку");
    }
  };

  const resetChat = () => {
    generationRef.current += 1;
    setMessages([]);
    setSessionId(null);
    setActiveConvId(null);
    setConversationHistory([]);
    setStartFreshOnNextSend(true);
    setError(null);
    setIsSending(false);
    setStreamingTextVisible(false);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const send = async (message: string, displayText?: string, options?: { reuseLastUser?: boolean; regenerate?: boolean }) => {
    if (!message.trim() || isSending) {
      return;
    }

    const requestGeneration = generationRef.current;
    const assistantMessageId = Date.now();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamingMessageIdRef.current = assistantMessageId;
    setIsSending(true);
    setStreamingTextVisible(false);
    setError(null);
    setMessages((prev) => [
      ...prev.filter((item) => !(options?.reuseLastUser && item.role === "assistant" && item.id === messages[messages.length - 1]?.id)),
      ...(options?.reuseLastUser ? [] : [{ id: assistantMessageId - 1, role: "user" as const, text: displayText || message.trim() }]),
      { id: assistantMessageId, role: "assistant", text: "", widget: null, feedback: null },
    ]);

    try {
      const response = await smartAgentChatStream(token, {
        message: message.trim(),
        conversation_history: startFreshOnNextSend ? [] : conversationHistory,
        session_id: startFreshOnNextSend ? null : sessionId,
        force_new_session: startFreshOnNextSend,
        regenerate: options?.regenerate ?? false,
      }, {
        onStarted: (requestId) => {
          streamRequestIdRef.current = requestId;
        },
        onDelta: (delta) => {
          if (requestGeneration !== generationRef.current) return;
          if (delta.trim()) setStreamingTextVisible(true);
          setMessages((prev) => prev.map((item) => {
            if (item.id !== assistantMessageId) return item;
            const nextText = sanitizeSmartAgentAssistantText(`${item.text}${delta}`);
            return { ...item, text: nextText };
          }));
        },
      }, controller.signal);

      if (!response) {
        if (requestGeneration === generationRef.current) {
          setMessages((prev) => prev.filter((item) => item.id !== assistantMessageId || item.text.trim()));
        }
        return;
      }

      if (requestGeneration !== generationRef.current) {
        return;
      }

      setStartFreshOnNextSend(false);
      appendAssistant(response, assistantMessageId);
      void loadConversations(false);
    } catch (requestError) {
      if (requestGeneration !== generationRef.current) {
        return;
      }
      if (controller.signal.aborted) {
        setMessages((prev) => prev.map((item) => (
          item.id === assistantMessageId && item.text.trim()
            ? { ...item, text: `${item.text}\n\nГенерация остановлена.` }
            : item
        )).filter((item) => item.id !== assistantMessageId || item.text.trim()));
        return;
      }
      if (requestError instanceof SmartAgentApiError) {
        setError(requestError.message);
      } else {
        setError("Не удалось выполнить действие. Попробуйте ещё раз.");
      }
    } finally {
      if (requestGeneration === generationRef.current) {
        setIsSending(false);
        setStreamingTextVisible(false);
        streamAbortRef.current = null;
        streamRequestIdRef.current = null;
        streamingMessageIdRef.current = null;
      }
    }
  };

  const stopGeneration = () => {
    const requestId = streamRequestIdRef.current;
    if (requestId) {
      void cancelSmartAgentChatStream(token, requestId).catch(() => undefined);
    }
    streamAbortRef.current?.abort();
  };

  const regenerateLastResponse = () => {
    if (isSending) return;
    const lastUserMessage = [...messages].reverse().find((item) => item.role === "user");
    if (!lastUserMessage) return;
    void send(lastUserMessage.text, lastUserMessage.text, { reuseLastUser: true, regenerate: true });
  };

  const onSubmit = async () => {
    if (!input.trim()) {
      return;
    }
    const message = input;
    const lastAssistantWidget = [...messages].reverse().find((item) => item.role === "assistant" && item.widget)?.widget;
    const normalizedMessage =
      lastAssistantWidget?.type === "action_confirmation"
        ? /^(да|д|ок|ага|yes|y)$/i.test(message.trim())
          ? "yes"
          : /^(нет|не|no|n)$/i.test(message.trim())
            ? "no"
            : message
        : message;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await send(normalizedMessage, message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  };

  const autoResize = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  };

  return (
    <div className="mb-4 sm:mb-5 min-h-[calc(100vh-220px)] flex flex-col md:flex-row gap-4">
      {/* Sidebar for chat history */}
      <div className="w-full md:w-64 shrink-0 flex flex-col border border-[#CDDBF2] rounded-2xl bg-white/50 backdrop-blur-sm p-4 shadow-[0_8px_20px_rgba(20,53,112,0.05)]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#CDDBF2]/60">
          <span className="text-xs font-bold text-[#102451] uppercase tracking-wider">История диалогов</span>
          <button
            onClick={() => setShowNewChatConfirm(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#1A7EF0]/10 text-[#1A7EF0] hover:bg-[#1A7EF0]/20 transition-colors text-lg font-bold"
            title="Новый чат"
          >
            +
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 max-h-60 md:max-h-[calc(100vh-320px)] pr-1">
          {isConversationsLoading ? (
            <p className="text-xs text-[#5F6B88]">Загрузка...</p>
          ) : (
            <>
              {conversationsError && (
                <div className="rounded-xl border border-[#F0C7CE] bg-[#FFF5F6] p-3 text-xs text-[#B9364A]">
                  <p>{conversationsError}</p>
                  <button
                    type="button"
                    onClick={() => void loadConversations()}
                    className="mt-2 font-semibold underline underline-offset-2"
                  >
                    Повторить
                  </button>
                </div>
              )}
              {conversations.length === 0 ? (
                !conversationsError && <p className="text-xs text-[#5F6B88]">История пуста</p>
              ) : (
                conversations.map((conv) => {
              const isActive = activeConvId === conv.conv_id;
              return (
                <div
                  key={conv.conv_id}
                  onClick={() => openConversation(conv.conv_id)}
                  className={`group relative p-3 rounded-xl cursor-pointer transition-all border ${
                    isActive
                      ? "bg-[#1A7EF0] text-white border-[#1A7EF0]"
                      : "bg-white/80 border-[#CDDBF2] hover:bg-white text-[#122247]"
                  }`}
                >
                  <p className="text-xs font-bold truncate pr-12">{conv.name || "Новый чат"}</p>
                  <p className={`text-[10px] truncate mt-1 ${isActive ? "text-white/80" : "text-[#5F6B88]"}`}>
                    {sanitizeSmartAgentAssistantText(conv.last_message) || "Без сообщений"}
                  </p>
                  
                  {/* Actions on hover */}
                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newName = prompt("Введите новое название диалога:", conv.name);
                        if (newName?.trim()) {
                          renameSmartAgentConversation(token, conv.conv_id, newName.trim())
                            .then(() => loadConversations(false));
                        }
                      }}
                      className="p-1 rounded bg-black/5 hover:bg-black/10 text-inherit text-[10px]"
                      title="Переименовать"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Удалить этот диалог?")) {
                          deleteSmartAgentConversation(token, conv.conv_id)
                            .then(() => {
                              if (activeConvId === conv.conv_id) resetChat();
                              loadConversations(false);
                            });
                        }
                      }}
                      className="p-1 rounded bg-black/5 hover:bg-black/10 text-red-500 hover:text-red-600 text-[10px]"
                      title="Удалить"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* Main chat window */}
      <div className="flex-1 flex flex-col min-w-0 bg-white/30 rounded-2xl border border-[#CDDBF2] p-4 shadow-[0_8px_20px_rgba(20,53,112,0.05)]">

      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full min-h-80 flex items-start justify-center pt-8 text-center msg-enter">
            <div>
              <div
                className="w-19 h-19 rounded-[1.25rem] mx-auto mb-5 flex items-center justify-center shadow-[0_18px_36px_rgba(17,81,190,0.3)]"
                style={{ background: "linear-gradient(135deg, #0F4CBD 0%, #1A7EF0 100%)" }}
              >
                <img src={`${import.meta.env.BASE_URL}asg-invest-mark.png`} alt="Team AI" className="w-20 h-20 object-contain" />
              </div>
              <h2 className="text-[28px] font-extrabold tracking-tight text-[#0F1B3D] mb-1">Чем вам помочь?</h2>
              <p className="text-[14px] text-[#5F6B88]">Напишите ваш вопрос внизу</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {messages.map((msg, index) => (
              <div key={msg.id} className="msg-enter">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div
                      className="max-w-[78%] rounded-[20px] rounded-tr-lg px-4 py-3 text-[14px] text-white shadow-[0_12px_28px_rgba(16,79,186,0.34)] card-interactive"
                      style={{ background: "linear-gradient(135deg, #1A7EF0 0%, #0E46B7 100%)" }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div
                      className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center mt-0.5 shadow-[0_10px_20px_rgba(17,83,193,0.3)]"
                      style={{ background: "linear-gradient(135deg, #0F4CBD 0%, #1A7EF0 100%)" }}
                    >
                      <img src={`${import.meta.env.BASE_URL}asg-invest-mark.png`} alt="Team AI" className="w-10 h-10 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {msg.text.trim() ? (
                        <div className="glass-card rounded-[20px] rounded-tl-lg px-4 py-3 border border-[#CDDBF2] shadow-[0_8px_20px_rgba(20,53,112,0.11)] max-w-[92%]">
                          <div className="text-[14px] text-[#122247] leading-relaxed wrap-break-word">
                            {(() => {
                              const hasWidget = Boolean(msg.widget);
                              const sourceFiles = !hasWidget ? parseSourcesFromText(msg.text) : [];

                              if (!msg.tables || msg.tables.length === 0) {
                                return (
                                  <div>
                                    {renderAssistantText(msg.text)}
                                    {sourceFiles.length > 0 && <SmartAgentSourceFiles fileNames={sourceFiles} />}
                                  </div>
                                );
                              }

                              const parts = msg.text.split(/(\[table:\d+\])/g);
                              return (
                                <div>
                                  {parts.map((part, index) => {
                                    const match = part.match(/\[table:(\d+)\]/);
                                    if (match) {
                                      const tableIdx = parseInt(match[1], 10);
                                      const tableData = msg.tables?.[tableIdx];
                                      if (tableData) {
                                        return <SmartAgentTableComponent key={`table-${tableIdx}-${index}`} table={tableData} variant="panel" />;
                                      }
                                      return <span key={`fallback-${index}`}>{part}</span>;
                                    } else {
                                      if (!part.trim()) return null;
                                      return <div key={`text-${index}`}>{renderAssistantText(part)}</div>;
                                    }
                                  })}
                                  {sourceFiles.length > 0 && <SmartAgentSourceFiles fileNames={sourceFiles} />}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ) : null}

                      {msg.widget ? (
                        <SmartAgentWidgetRenderer
                          token={token}
                          widget={msg.widget}
                          isSending={isSending}
                          onConfirm={() => {
                            void send("yes", "Подтвердить");
                          }}
                          onCancel={() => {
                            void send("no", "Отменить");
                          }}
                          onSelect={(selectionValue, displayText) => {
                            void send(selectionValue, displayText);
                          }}
                        />
                      ) : null}

                      {/* Feedback buttons */}
                      {msg.role === "assistant" && index === messages.length - 1 && !isSending && (
                        <div className="flex flex-col gap-1.5 mt-2.5 msg-enter">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleFeedback(index, "like")}
                              disabled={msg.feedback !== null && msg.feedback !== undefined}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all text-sm ${
                                msg.feedback === "like"
                                  ? "bg-[#1A7EF0]/15 border-[#1A7EF0] text-[#1A7EF0]"
                                  : msg.feedback === "dislike"
                                  ? "opacity-35 cursor-not-allowed border-[#CDDBF2] text-[#8C9BBB]"
                                  : "bg-white/90 border-[#CDDBF2] hover:bg-white text-[#122247] hover:border-[#1A7EF0] hover:scale-105 active:scale-95"
                              }`}
                              title="Полезно"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => handleFeedback(index, "dislike")}
                              disabled={msg.feedback !== null && msg.feedback !== undefined}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all text-sm ${
                                msg.feedback === "dislike"
                                  ? "bg-[#B9364A]/15 border-[#B9364A] text-[#B9364A]"
                                  : msg.feedback === "like"
                                  ? "opacity-35 cursor-not-allowed border-[#CDDBF2] text-[#8C9BBB]"
                                  : "bg-white/90 border-[#CDDBF2] hover:bg-white text-[#122247] hover:border-[#B9364A] hover:scale-105 active:scale-95"
                              }`}
                              title="Не помогло"
                            >
                              👎
                            </button>
                            <button
                              type="button"
                              onClick={() => regenerateLastResponse()}
                              disabled={isSending}
                              className="h-8 rounded-lg border border-[#CDDBF2] bg-white/90 px-2.5 text-[12px] font-semibold text-[#1A4FAF] transition hover:bg-white disabled:opacity-50"
                              title="Повторить генерацию"
                            >
                              ↻ Повторить
                            </button>
                          </div>
                          {msg.feedback === "dislike" && (
                            <span className="text-[12px] text-[#5F6B88] animate-fade-in font-medium mt-0.5">
                              Спасибо, я попробую ответить точнее.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isSending && !streamingTextVisible && (
              <div className="flex gap-3 mb-4 msg-enter">
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #0F4CBD 0%, #1A7EF0 100%)" }}
                >
                  <img src={`${import.meta.env.BASE_URL}asg-invest-mark.png`} alt="Team AI" className="w-4.5 h-4.5 object-contain" />
                </div>
                <div className="glass-card rounded-[18px] rounded-tl-md border border-[#D7E0F0] shadow-[0_8px_18px_rgba(20,53,112,0.14)]">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-end gap-2 bg-white/88 rounded-3xl px-4 py-2.5 border border-[#CDDBF2] shadow-[0_12px_28px_rgba(18,44,102,0.12)] focus-within:border-[#8FB3F2] focus-within:bg-white transition-all input-glow">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              autoResize();
            }}
            onKeyDown={onKeyDown}
            placeholder="Напишите сообщение..."
            className="flex-1 bg-transparent text-[15px] text-[#0F1B3D] placeholder:text-[#8C9BBB] outline-none leading-relaxed py-0.5 resize-none min-h-6.5 max-h-35"
          />
          {isSending ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="ui-primary-btn btn-pop w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 active:scale-95"
              style={{ background: "linear-gradient(135deg, #D94A5A 0%, #A92338 100%)" }}
              title="Остановить генерацию"
              aria-label="Остановить генерацию"
            >
              <span className="text-[16px] leading-none">■</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={!input.trim()}
              className="ui-primary-btn btn-pop w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #1A7EF0 0%, #0E46B7 100%)" }}
            >
              <Icon.Send />
            </button>
          )}
        </div>
        {error && <p className="text-[12px] text-[#B9364A] mt-2">{error}</p>}
      </div>

      {showNewChatConfirm && (
        <div className="ts-legacy-backdrop fixed inset-0 z-90 bg-[#0A1F4D]/35 flex items-center justify-center p-4">
          <div className="ts-legacy-dialog w-full max-w-115 rounded-2xl border border-[#D7E0F0] bg-white p-4 shadow-[0_24px_56px_rgba(15,42,94,0.22)]">
            <p className="text-[16px] font-bold text-[#102451] mb-2">Начать новый чат?</p>
            <p className="text-[13px] text-[#5F6B88]">
              Если создать новый чат, история текущего диалога будет очищена. Вы точно хотите продолжить?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowNewChatConfirm(false)}
                className="ui-ghost-btn px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#334064]"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  setShowNewChatConfirm(false);
                  resetChat();
                }}
                className="ui-primary-btn px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
              >
                Да, начать
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
