import React, { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  headerAction?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children,
  icon,
  headerAction,
  headerRight,
  className = "",
  contentClassName = "",
}) => {
  return (
    <div className={`glass-card rounded-3xl p-4 md:p-6 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-lg md:text-xl font-bold text-primary hover:text-primary/80 transition-all cursor-pointer"
        >
          {icon}
          {title}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-primary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-primary" />
          )}
        </button>
        {headerAction || headerRight}
      </div>
      {isExpanded && (
        <div className={contentClassName}>
          {children}
        </div>
      )}
    </div>
  );
};
