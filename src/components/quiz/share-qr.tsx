'use client';

// src/components/quiz/share-qr.tsx
// Floating share card: instant SVG QR code + copy-link, shown after a quiz
// is published so students can open it on mobile by scanning.
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { X, Copy, Link2 } from 'lucide-react';

export function ShareQrCard({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

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
    <div className="quizify-share-card fixed bottom-4 right-4 z-50 w-64 rounded-2xl border border-border bg-card p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <Link2 className="h-3.5 w-3.5" /> Scan to share
        </span>
        <button
          onClick={onClose}
          aria-label="Close share QR"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto w-fit rounded-xl bg-white p-2.5">
        <QRCodeSVG value={url} size={176} level="M" marginSize={0} />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        className="mt-3 w-full h-8 text-xs font-medium border-border/80"
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy link'}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground break-all leading-snug">{url}</p>
    </div>
  );
}
