import React from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import type { VoiceAlertItem } from "./voice-controls-helpers";

export interface VoiceAlertRegionProps {
  alerts: readonly VoiceAlertItem[];
  onDismiss: (id: string) => void;
}

export const VoiceAlertRegion: React.FC<VoiceAlertRegionProps> = ({
  alerts,
  onDismiss,
}) => {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const Icon = alert.tone === "error" ? AlertTriangle : Info;
        const toneClass = alert.tone === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-amber-400/40 bg-amber-400/10 text-amber-100";

        return (
          <div
            key={alert.id}
            role={alert.liveMode === "assertive" ? "alert" : "status"}
            aria-live={alert.liveMode}
            className={`rounded-xl border p-3 ${toneClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="text-xs leading-relaxed">
                    {alert.entityId ? `[${alert.entityId}] ` : ""}
                    {alert.message}
                  </p>
                  {alert.detail && (
                    <p className="text-[11px] text-white/70">{alert.detail}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss voice alert"
                onClick={() => onDismiss(alert.id)}
                className="rounded-md p-1 text-white/60 transition hover:bg-black/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
