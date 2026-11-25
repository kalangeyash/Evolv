"use client";
import * as React from "react";
import { Download, Share } from "lucide-react";
import { isIOS, isSafari, isStandalone } from "@/lib/utils/platform";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Explains how to install EVOLV on this device. iOS has no install prompt,
 * so Safari users get Share → Add to Home Screen instructions; Chromium
 * browsers get a real install button when the browser offers one.
 */
export function InstallGuide() {
  const [standalone, setStandalone] = React.useState(false);
  const [ios, setIos] = React.useState(false);
  const [safari, setSafari] = React.useState(false);
  const [prompt, setPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  React.useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
    setSafari(isSafari());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) return <p className="text-[13.5px] text-muted">EVOLV is running as an installed app on this device.</p>;
  return (
    <div className="space-y-3 text-[13.5px] text-muted">
      {ios ? (
        <p className="flex flex-wrap items-center gap-1">
          In Safari, tap <Share className="inline size-4" aria-label="Share" /> Share, then <strong className="text-text">Add to Home Screen</strong>. EVOLV then opens full-screen and works offline.
        </p>
      ) : prompt ? (
        <Button
          variant="outline"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          <Download /> Install EVOLV
        </Button>
      ) : (
        <p>Use your browser&apos;s menu to install EVOLV or add it to your home screen. Chrome and Edge show an install icon in the address bar.</p>
      )}
      {safari && !standalone ? (
        <Callout tone="warn" title="Safari may delete EVOLV's data if you don't visit for 7 days">
          Safari removes website storage after 7 days without use unless the site is added to the Home Screen (or Dock on Mac). Install EVOLV and keep regular backups.
        </Callout>
      ) : null}
    </div>
  );
}
