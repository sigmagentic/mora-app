"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SlideTextSize = "xl" | "l" | "md";

export interface AboutAppSlide {
  text: string;
  image?: string;
  size?: SlideTextSize;
}

interface AboutAppSlideshowProps {
  open: boolean;
  onClose: () => void;
  slides?: AboutAppSlide[];
}

const textSizeClasses: Record<SlideTextSize, string> = {
  xl: "text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight",
  l: "text-2xl sm:text-3xl md:text-4xl font-bold",
  md: "text-base sm:text-lg md:text-xl font-medium",
};

const DEFAULT_SLIDES: AboutAppSlide[] = [
  {
    text: "AI companies have harvested 99% of all human data.",
    size: "xl",
  },
  {
    text: "You never stood a chance to opt out.",
    size: "l",
  },
  {
    text: "But 1% of human data has never been harvested—and never can be.",
    size: "l",
  },
  {
    text: "It lives only in your mind. It shifts with your emotions, your values, and how you see the world.",
    size: "l",
  },
  {
    text: "That 1% is more valuable than the other 99% combined.",
    size: "xl",
  },
  {
    text: "This is 'human morality' data.",
    size: "xl",
  },
  {
    text: "And MORA helps you own it, protect it, and monetize it.",
    size: "l",
  },
  {
    text: "How? Your data never leaves your control. MORA uses a zero-knowledge design.",
    size: "l",
  },
  {
    text: "Everything is encrypted end-to-end with device-bound, biometrics-backed encryption—and it’s quantum-resistant, so harvest-now-decrypt-later attacks can’t touch it.",
    size: "md",
  },
  {
    text: "No one can see your data. Ever.",
    size: "xl",
  },
  {
    text: "So how does MORA help you benefit from it?",
    size: "l",
  },
  {
    text: "We’re building an engine that runs on encrypted data. It can’t read your answers—but it can aggregate them anonymously to surface collective signals.",
    size: "md",
  },
  {
    text: "Verifiable proofs and prediction markets let the world bet on those signals. Earnings are shared with everyone in the system, so MORA stays self-sustaining.",
    size: "md",
  },
  {
    text: "Over time, MORA will power a live Moral Compass of humanity.",
    size: "l",
  },
  {
    text: "A dataset that can’t be harvested or synthetically generated—and that makes it one of the most valuable datasets in the world.",
    size: "l",
  },
  {
    text: "They took 99%. This 1% is yours.",
    size: "xl",
  },
  {
    text: "Ready to dive in? Let’s get started.",
    size: "xl",
  },
];

export function AboutAppSlideshow({
  open,
  onClose,
  slides = DEFAULT_SLIDES,
}: AboutAppSlideshowProps) {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  const isLast = index === total - 1;
  const isFirst = index === 0;

  const goNext = useCallback(() => {
    if (index < total - 1) setIndex((i) => i + 1);
  }, [index, total]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setIndex(0);
        onClose();
      }
    },
    [onClose]
  );

  const slide = slides[index];
  const size = slide?.size ?? "md";
  const textClass = textSizeClasses[size];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60" />
        <DialogContent
          className="max-w-2xl w-[calc(100%-2rem)] min-h-[420px] sm:min-h-[480px] p-0 gap-0 overflow-hidden border-0 bg-neutral-50/95 dark:bg-neutral-950/95 shadow-2xl rounded-xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={() => handleOpenChange(false)}
        >
          <div className="flex flex-col min-h-[420px] sm:min-h-[480px]">
            {/* Slide area */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:py-14 relative">
              {/* Arrows */}
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirst}
                className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/80 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/80",
                  "disabled:opacity-30 disabled:pointer-events-none"
                )}
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={isLast}
                className={cn(
                  "absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/80 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/80",
                  "disabled:opacity-30 disabled:pointer-events-none"
                )}
                aria-label="Next slide"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Content */}
              <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
                {slide?.image && (
                  <div className="mb-6 rounded-lg overflow-hidden bg-neutral-200/50 dark:bg-neutral-800/50">
                    <img
                      src={slide.image}
                      alt=""
                      className="max-h-48 sm:max-h-56 w-auto object-contain"
                    />
                  </div>
                )}
                <p
                  className={cn(
                    "text-neutral-800 dark:text-neutral-200 text-center leading-tight",
                    textClass
                  )}
                >
                  {slide?.text}
                </p>
              </div>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-1.5 pb-4">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-200",
                    i === index
                      ? "bg-neutral-700 dark:bg-neutral-300 w-6"
                      : "bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500"
                  )}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Close button (last slide or always) */}
            <div className="px-6 pb-6 pt-0">
              {isLast ? (
                <Button
                  onClick={() => handleOpenChange(false)}
                  className="w-full h-11 rounded-lg font-medium bg-neutral-800 hover:bg-neutral-700 dark:bg-neutral-200 dark:hover:bg-neutral-100 dark:text-neutral-900 text-neutral-50"
                >
                  Close and return to app
                </Button>
              ) : (
                <div className="h-11 flex items-center justify-center">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {index + 1} / {total}
                  </span>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
