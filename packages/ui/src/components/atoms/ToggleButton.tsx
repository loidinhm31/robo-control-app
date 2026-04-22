import React from "react";
import { LucideIcon } from "lucide-react";

export interface ToggleButtonProps {
  isEnabled: boolean;
  onText: string;
  offText: string;
  onIcon: LucideIcon;
  offIcon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  variant?: "cyan" | "orange" | "green" | "red";
}

const variantConfig = {
  cyan: {
    on: "bg-cyan-500 hover:bg-cyan-400",
    off: "bg-cyan-600 hover:bg-cyan-500",
    iconOn: "text-white",
    iconOff: "text-white",
  },
  orange: {
    on: "bg-orange-500 hover:bg-orange-400",
    off: "bg-orange-600 hover:bg-orange-500",
    iconOn: "text-white",
    iconOff: "text-white",
  },
  green: {
    on: "bg-emerald-500 hover:bg-emerald-400",
    off: "bg-emerald-600 hover:bg-emerald-500",
    iconOn: "text-white",
    iconOff: "text-white",
  },
  red: {
    on: "bg-red-500 hover:bg-red-400",
    off: "bg-slate-500 hover:bg-slate-400",
    iconOn: "text-white",
    iconOff: "text-white",
  },
};

export const ToggleButton: React.FC<ToggleButtonProps> = ({
  isEnabled,
  onText,
  offText,
  onIcon: OnIcon,
  offIcon: OffIcon,
  onClick,
  disabled = false,
  className = "",
  variant = "cyan",
}) => {
  const config = variantConfig[variant];
  const bgColor = isEnabled ? config.on : config.off;
  const iconColor = isEnabled ? config.iconOn : config.iconOff;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${bgColor}
        text-white font-bold
        shadow-lg hover:shadow-xl
        transition-all duration-150 cursor-pointer
        rounded-xl px-4 py-2 flex items-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isEnabled ? (
        <>
          <OnIcon className={`w-5 h-5 ${iconColor}`} />
          <span>{onText}</span>
        </>
      ) : (
        <>
          <OffIcon className={`w-5 h-5 ${iconColor}`} />
          <span>{offText}</span>
        </>
      )}
    </button>
  );
};
