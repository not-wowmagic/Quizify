'use client';

// Optional Cloudflare Turnstile bot protection. Rendered only when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured; verified server-side via
// TURNSTILE_SECRET_KEY (see src/lib/rate-limit.ts).
import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string | null) => void;
}

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const renderWidget = useCallback(() => {
    if (containerRef.current && window.turnstile && widgetIdRef.current === null) {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    }
  }, [siteKey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div ref={containerRef} />
    </>
  );
}
