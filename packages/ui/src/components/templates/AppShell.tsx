/**
 * AppShell - Main application layout template
 * Provides header bar, error boundary, and layout structure
 */

import React from "react";
import { AlertTriangle } from "lucide-react";
import { useConnection, useTelemetry } from "../../hooks";
import { RoverCommandService, SocketService } from "../../services";
import type { SocketAuth } from "../../adapters/factory/interfaces";

export interface AppShellProps {
  children: React.ReactNode;
  socketUrl?: string;
  auth?: SocketAuth;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  socketUrl,
  auth,
}) => {
  const { isConnected, status } = useConnection();
  const { servo } = useTelemetry();

  const handleConnect = () => {
    if (socketUrl) {
      SocketService.connect(socketUrl, auth);
    }
  };

  const handleEmergencyStop = () => {
    RoverCommandService.emergencyStop();
  };

  return (
    <div className="min-h-screen gradient-bg relative scanline-effect">
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header - Terminal-style status bar */}
        <div className="sticky top-0 z-50 glass-card shadow-xl p-2 md:p-3 border-b-2 border-syntax-blue/30">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            {/* Left: Title and Status Indicators */}
            <div className="flex items-center gap-2 md:gap-3 flex-wrap w-full md:w-auto">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-syntax-blue rounded-full animate-pulse"></div>
                <h1 className="text-base md:text-lg font-mono font-bold text-syntax-cyan tracking-tight">
                  robot@fleet-control:~$
                </h1>
              </div>

              {/* Connection Status - Terminal style */}
              <div className="bg-slate-900/80 border border-slate-700 rounded px-2 py-1 flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <div className="w-2 h-2 bg-syntax-green rounded-full status-glow-green"></div>
                    <span className="text-xs font-mono font-semibold text-syntax-green">
                      [ONLINE]
                    </span>
                  </>
                ) : status === "connecting" ? (
                  <>
                    <div className="w-2 h-2 bg-syntax-yellow rounded-full animate-pulse"></div>
                    <span className="text-xs font-mono font-semibold text-syntax-yellow">
                      [CONNECTING]
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-syntax-red rounded-full status-glow-red"></div>
                    <span className="text-xs font-mono font-semibold text-syntax-red">
                      [OFFLINE]
                    </span>
                  </>
                )}
              </div>

              {/* Control Mode - Syntax colored */}
              {servo && (
                <div className="bg-slate-900/80 border border-slate-700 rounded px-2 py-1 flex items-center gap-1.5">
                  {servo.control_mode === "Autonomous" ? (
                    <>
                      <div className="w-2 h-2 bg-syntax-blue rounded-full status-glow-blue"></div>
                      <span className="text-xs font-mono font-semibold text-syntax-blue">
                        [AUTO]
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-syntax-purple rounded-full"></div>
                      <span className="text-xs font-mono font-semibold text-syntax-purple">
                        [MANUAL]
                      </span>
                    </>
                  )}
                  {servo.distance_estimate !== null && (
                    <span className="text-xs text-syntax-cyan font-mono ml-1">
                      {servo.distance_estimate?.toFixed(1)}m
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: Emergency Stop and Connect Button */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {!isConnected && socketUrl && (
                <button
                  onClick={handleConnect}
                  className="btn-info px-4 py-2 rounded text-sm font-mono font-bold whitespace-nowrap"
                >
                  <span>{">"} CONNECT</span>
                </button>
              )}

              {/* Emergency Stop Button - Terminal style */}
              <button
                onClick={handleEmergencyStop}
                disabled={!isConnected}
                className="group relative px-4 md:px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-black text-sm md:text-base shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all duration-150 disabled:opacity-40 disabled:hover:bg-red-600 disabled:shadow-none border-2 border-red-400/50 active:bg-red-700 flex-1 md:flex-none font-mono cursor-pointer"
                style={{
                  animation: isConnected ? "pulse-slow 3s infinite" : "none",
                }}
              >
                <div className="flex items-center gap-2 justify-center">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="tracking-wider">[ STOP ]</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        {children}
      </div>
    </div>
  );
};
