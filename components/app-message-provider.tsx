'use client';

import { useEffect, useState } from 'react';

const MESSAGE_TITLE = '즐거운 배드민턴 하세요';

export default function AppMessageProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (value?: unknown) => {
      setMessage(String(value ?? ''));
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  useEffect(() => {
    if (!message) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [message]);

  return (
    <>
      {children}
      {message !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-message-title"
            aria-describedby="app-message-body"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-base" aria-hidden="true">
                🏸
              </span>
              <h2 id="app-message-title" className="text-sm font-black text-indigo-700">
                {MESSAGE_TITLE}
              </h2>
            </div>
            <div className="border-t border-slate-300" aria-hidden="true" />
            <p id="app-message-body" className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-600">
              {message}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setMessage(null)}
              className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
