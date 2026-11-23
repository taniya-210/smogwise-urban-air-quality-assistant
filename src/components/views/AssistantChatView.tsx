import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { FallbackNoticeBanner } from '../FallbackNoticeBanner.tsx';
import { sendAssistantMessage } from '../../services/api.ts';
import type { AirQualityData, ChatTurn, HouseholdProfile } from '../../shared/types.ts';

interface AssistantChatViewProps {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
}

const STARTER_QUESTIONS = [
  'Is it safe to take children to the park this afternoon based on today’s air quality?',
  'Should I open windows right now to clear kitchen cooking fumes, or keep them shut?',
  'What type of mask actually filters winter PM2.5 smog during a commute?',
  'How can our housing society reduce winter generator and leaf-burning smoke?',
];

const MAX_MESSAGE_LENGTH = 1200;

export function AssistantChatView({ airQuality, profile }: AssistantChatViewProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [retryingTurnId, setRetryingTurnId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function submitQuestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setValidationError('Please enter a question before sending.');
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`Questions must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
      return;
    }
    if (sending || retryingTurnId) return;

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const priorHistory = messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userTurn]);
    setInput('');
    setValidationError(null);
    setNetworkError(null);
    setSending(true);

    try {
      const response = await sendAssistantMessage({
        message: trimmed,
        history: priorHistory,
        airQuality,
        profile,
      });

      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        generatedBy: response.generatedBy,
        verifiedDataUsed: response.verifiedDataUsed,
        generalGuidanceNote: response.generalGuidanceNote,
        followUpSuggestions: response.followUpSuggestions,
        errorNotice: response.errorNotice,
        errorCategory: response.errorCategory,
        promptForRetry: trimmed,
      };
      setMessages((prev) => [...prev, assistantTurn]);
    } catch (err) {
      setNetworkError(
        err instanceof Error
          ? err.message
          : 'Could not reach the assistant right now. Please try again.'
      );
    } finally {
      setSending(false);
    }
  }

  /**
   * Performs exactly one deliberate retry for a fallback response when clicked by the user.
   * Never creates automatic or background retry loops.
   */
  async function handleRetryFallbackTurn(turnId: string, promptText: string) {
    if (sending || retryingTurnId) return;
    setRetryingTurnId(turnId);
    setNetworkError(null);

    const targetIdx = messages.findIndex((m) => m.id === turnId);
    const historyBeforeTurn =
      targetIdx > 0
        ? messages
            .slice(Math.max(0, targetIdx - 11), targetIdx - 1)
            .map((m) => ({ role: m.role, content: m.content }))
        : [];

    try {
      const response = await sendAssistantMessage({
        message: promptText,
        history: historyBeforeTurn,
        airQuality,
        profile,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === turnId
            ? {
                ...m,
                content: response.reply,
                timestamp: new Date().toISOString(),
                generatedBy: response.generatedBy,
                verifiedDataUsed: response.verifiedDataUsed,
                generalGuidanceNote: response.generalGuidanceNote,
                followUpSuggestions: response.followUpSuggestions,
                errorNotice: response.errorNotice,
                errorCategory: response.errorCategory,
              }
            : m
        )
      );
    } catch (err) {
      setNetworkError(
        err instanceof Error
          ? err.message
          : 'Retry could not reach the assistant right now. Please try again shortly.'
      );
    } finally {
      setRetryingTurnId(null);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitQuestion(input);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">SmogWise AI Assistant</h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Ask location-aware questions about winter smog, indoor air protection, commuting, or community preparedness. Every response separates active measured or modelled data from general guidance.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setNetworkError(null);
              setValidationError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Clear Conversation
          </button>
        )}
      </div>

      {/* Chat Container */}
      <div className="rounded-xl border border-slate-200 bg-white flex flex-col min-h-[520px] max-h-[72vh]">
        {/* Conversation Feed */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
          aria-live="polite"
          aria-label="Assistant conversation history"
        >
          {messages.length === 0 && (
            <div className="py-6 space-y-6 max-w-2xl mx-auto">
              <div className="space-y-2 text-center">
                <h3 className="text-base font-bold text-slate-900">
                  Grounded in {airQuality?.location.name || 'Your Active Location'}
                </h3>
                <p className="text-sm text-slate-600">
                  {airQuality && airQuality.mode !== 'unavailable' && airQuality.current.usAqi !== null
                    ? `Active context: US EPA AQI ${airQuality.current.usAqi} (${
                        airQuality.mode === 'demo'
                          ? 'Illustrative Demo Scenario — Not Live'
                          : airQuality.source.name
                      }).`
                    : 'Live AQI data is currently unavailable — the assistant will note that clearly and provide general evidence-based guidance.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void submitQuestion(q)}
                    className="p-3.5 text-left text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((turn, turnIdx) => {
            const isLatestAssistant =
              turn.role === 'assistant' && turnIdx === messages.length - 1 && !sending && !retryingTurnId;
            return (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-full sm:max-w-3xl rounded-xl px-4 sm:px-5 py-4 space-y-3 ${
                    turn.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-900'
                  }`}
                >
                  {turn.role === 'assistant' && turn.generatedBy === 'fallback' && (
                    <FallbackNoticeBanner
                      compact
                      reason={turn.errorNotice}
                      category={turn.errorCategory}
                      retrying={retryingTurnId === turn.id}
                      onRetry={
                        turn.promptForRetry
                          ? () => void handleRetryFallbackTurn(turn.id, turn.promptForRetry!)
                          : undefined
                      }
                    />
                  )}

                  <div className="text-sm leading-relaxed whitespace-pre-line break-words">
                    {turn.content}
                  </div>

                  {turn.role === 'assistant' && (
                    <div className="pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={`font-semibold ${
                            turn.generatedBy === 'gemini' ? 'text-blue-800' : 'text-amber-900'
                          }`}
                        >
                          {turn.generatedBy === 'gemini'
                            ? 'AI-Generated by Google Gemini'
                            : 'AI FALLBACK MODE · DEMO / TEMPLATE GUIDANCE'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="break-words">
                          <span className="font-semibold text-slate-700">Data grounding:</span>{' '}
                          {turn.verifiedDataUsed && turn.verifiedDataUsed.length > 0
                            ? turn.verifiedDataUsed.slice(0, 4).join(' · ')
                            : 'No live readings used'}
                        </span>
                      </div>
                      {turn.generalGuidanceNote && (
                        <p className="text-slate-500 break-words">
                          <span className="font-semibold text-slate-600">General guidance note:</span>{' '}
                          {turn.generalGuidanceNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {isLatestAssistant &&
                  turn.followUpSuggestions &&
                  turn.followUpSuggestions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2 max-w-full sm:max-w-3xl">
                      {turn.followUpSuggestions.map((suggestion, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => void submitQuestion(suggestion)}
                          className="px-3 py-1.5 text-left text-xs font-medium text-blue-900 bg-blue-50/70 border border-blue-200 rounded-lg hover:bg-blue-100/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            );
          })}

          {(sending || retryingTurnId) && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
              <span>
                {retryingTurnId
                  ? 'Retrying with live Gemini AI...'
                  : 'Evaluating active air quality context and preparing guidance...'}
              </span>
            </div>
          )}

          {networkError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900"
            >
              {networkError}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleFormSubmit}
          className="p-4 border-t border-slate-200 bg-white space-y-2 rounded-b-xl"
          noValidate
        >
          {validationError && (
            <p role="alert" className="text-xs text-red-700">
              {validationError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="assistant-input" className="sr-only">
              Ask SmogWise AI a question
            </label>
            <input
              id="assistant-input"
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-invalid={Boolean(validationError)}
              placeholder="Ask about outdoor timings, indoor filtration, masks, or low-emission commuting..."
              className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={sending || Boolean(retryingTurnId) || input.trim().length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Send
            </button>
          </div>
          {input.length > 900 && (
            <div className="text-right text-[11px] font-mono tabular-nums text-slate-500">
              {input.length} / {MAX_MESSAGE_LENGTH} characters
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
