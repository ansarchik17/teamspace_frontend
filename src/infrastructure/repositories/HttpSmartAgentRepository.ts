import { authorizedFetch } from '../http/authorizedFetch';
import { HttpError } from '../http/HttpError';
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore';
import type { SmartAgentChatRequest, SmartAgentChatResponse, SmartAgentConversationSummary, SmartAgentConversationDetail, SmartAgentFeedbackRequest, SmartAgentFeedbackResponse } from '../../presentation/pages/alemai/smart-agent/types';

export interface SmartAgentStreamHandlers {
  onStarted?: (requestId: string) => void;
  onDelta?: (text: string) => void;
}

export class HttpSmartAgentRepository {
  private readonly sessionStore: AuthSessionStore;

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore;
  }

  async chat(payload: SmartAgentChatRequest): Promise<SmartAgentChatResponse> {
    const url = '/api/tools/smart-agent/chat';
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: payload.message,
        session_id: payload.session_id,
        force_new_session: payload.force_new_session,
        conversation_history: payload.conversation_history || [],
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Smart Agent request failed with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as SmartAgentChatResponse;
  }

  async chatStream(
    payload: SmartAgentChatRequest,
    handlers: SmartAgentStreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<SmartAgentChatResponse | null> {
    const response = await authorizedFetch(this.sessionStore, '/api/tools/smart-agent/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: payload.message,
        session_id: payload.session_id,
        force_new_session: payload.force_new_session,
        regenerate: payload.regenerate,
        conversation_history: payload.conversation_history || [],
      }),
      signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.detail || data?.error || `Smart Agent stream failed with status ${response.status}`,
        response.status,
        data?.error?.code,
      );
    }

    if (!response.body) {
      throw new Error('Поток ответа Smart Agent недоступен.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    const consumeEvent = (rawEvent: string): SmartAgentChatResponse | null | undefined => {
      const lines = rawEvent.split(/\r?\n/);
      let eventName = currentEvent;
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }

      currentEvent = 'message';
      if (!data) return undefined;

      const eventData = JSON.parse(data) as Record<string, unknown>;
      if (eventName === 'started') {
        const requestId = typeof eventData.request_id === 'string' ? eventData.request_id : '';
        if (requestId) handlers.onStarted?.(requestId);
        return undefined;
      }

      if (eventName === 'delta') {
        if (typeof eventData.text === 'string') handlers.onDelta?.(eventData.text);
        return undefined;
      }

      if (eventName === 'cancelled') return null;
      if (eventName === 'error') {
        throw new Error(String(eventData.detail || 'Не удалось выполнить потоковую генерацию.'));
      }

      if (eventName === 'completed') {
        const responseData = typeof eventData.response === 'string'
          ? (() => {
              try {
                return JSON.parse(eventData.response) as unknown;
              } catch {
                return null;
              }
            })()
          : eventData.response;

        if (responseData && typeof responseData === 'object') {
          return responseData as SmartAgentChatResponse;
        }
      }

      return undefined;
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const parsed = consumeEvent(buffer.slice(0, separatorIndex));
        buffer = buffer.slice(separatorIndex + 2);
        if (parsed !== undefined) {
          await reader.cancel();
          return parsed;
        }
        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) {
        if (buffer.trim()) {
          const parsed = consumeEvent(buffer);
          if (parsed !== undefined) return parsed;
        }
        break;
      }
    }

    return null;
  }

  async cancelChatStream(requestId: string): Promise<{ cancelled: boolean }> {
    const response = await authorizedFetch(
      this.sessionStore,
      `/api/tools/smart-agent/chat/stream/${encodeURIComponent(requestId)}/cancel`,
      { method: 'POST' },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Failed to cancel Smart Agent stream with status ${response.status}`,
        response.status,
        data?.error?.code,
      );
    }

    return (await response.json()) as { cancelled: boolean };
  }

  async listConversations(): Promise<SmartAgentConversationSummary[]> {
    const url = '/api/tools/smart-agent/conversations';
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'GET',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Failed to list conversations with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as SmartAgentConversationSummary[];
  }

  async getConversation(convId: string): Promise<SmartAgentConversationDetail> {
    const url = `/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`;
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'GET',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Failed to get conversation with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as SmartAgentConversationDetail;
  }

  async renameConversation(convId: string, name: string): Promise<SmartAgentConversationDetail> {
    const url = `/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`;
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Failed to rename conversation with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as SmartAgentConversationDetail;
  }

  async deleteConversation(convId: string): Promise<{ deleted: boolean }> {
    const url = `/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`;
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Failed to delete conversation with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as { deleted: boolean };
  }

  async sendFeedback(payload: SmartAgentFeedbackRequest): Promise<SmartAgentFeedbackResponse> {
    const url = '/api/tools/smart-agent/feedback';
    
    const response = await authorizedFetch(this.sessionStore, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new HttpError(
        data?.error?.message || data?.error || `Feedback request failed with status ${response.status}`,
        response.status,
        data?.error?.code
      );
    }

    return (await response.json()) as SmartAgentFeedbackResponse;
  }
}
