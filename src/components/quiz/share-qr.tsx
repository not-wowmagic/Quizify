'use client';

// src/components/quiz/share-qr.tsx
// Floating share card: instant SVG QR code + copy-link, shown after a quiz
// is published so students can open it on mobile by scanning.
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { X, Copy, Link2 } from 'lucide-react';

export function ShareQrCard({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusable = () =>
      dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        : [];
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Link Copied', description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Share Link Ready', description: url });
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-qr-title"
      className="quizify-share-card fixed bottom-4 right-4 z-50 w-64 rounded-2xl border border-border bg-card p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 id="share-qr-title" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Scan to share
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close share QR"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mx-auto w-fit rounded-xl bg-white p-2.5">
        <QRCodeSVG value={url} size={176} level="M" marginSize={0} />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        className="mt-3 h-11 w-full text-xs font-medium border-border/80"
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copied!' : 'Copy link'}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground break-all leading-snug">{url}</p>
    </div>
  );
}
