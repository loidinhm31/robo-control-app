# Robo-Fleet Control — Project Overview & PDR

## Product Vision

A responsive, real-time web and desktop control UI for the Robo-Fleet distributed rover system. Enables operators to remotely monitor and control multiple rover units, manage fleet status, and perform complex manipulation tasks via a unified interface.

## Target Users

- **Rover operators** — field personnel or remote pilots controlling individual rover motion, arm, and sensors
- **Fleet managers** — supervisors monitoring multi-robot fleet status and health metrics
- **Developers** — integrating new sensing modalities or control strategies via the Socket.IO event interface

## Core Capabilities

### Rover Control
- **Omnidirectional motion** — X/Y/rotation (θ) commands via joystick or click-and-drag
- **Throttled command emission** — 100ms minimum between updates to avoid overwhelming backend
- **Fleet selection** — switch control context between active rovers
- **Joystick input** — react-joystick-component with analog stick feedback

### Arm Control (6-DOF)
- **Joint slider panel** — real-time position control for 6 servo motors
- **Position validation** — enforce per-joint angle limits (±180°, configurable)
- **Preset positions** — save/load named poses (home, rest, pickup, etc.)
- **Telemetry feedback** — current joint angles, servo load, temperature monitoring

### Sensing & Visualization
- **JPEG video streaming** — live camera feed decoded from Socket.IO binary frames
- **Detection overlays** — Canvas 2D rendering of bounding boxes, class labels, confidence scores
- **Click-to-track** — map pixel click to normalized bbox → emit tracking command
- **Location map** — 2D canvas visualization of rover path/position, zoom/pan controls
- **Wheel integration** — 50ms setInterval integrating wheel angular velocities for odometry

### Fleet Management
- **Multi-rover selector** — switch between rovers, view health (battery %, connectivity, errors)
- **Fleet status dashboard** — aggregated metrics, connection count, alert summary
- **Per-robot telemetry** — battery voltage, temperature, CPU load, network latency

### Voice Control
- **Text-to-speech** — emit TTS commands, receive PCM audio responses, queue + play via Web Audio API
- **Speech recognition** — microphone capture, send audio stream to backend STT service
- **Transcription display** — show recognized commands with confidence and timestamp
- **8kHz low-pass filter** — audio quality optimization for remote environments

### Performance Monitoring
- **Floating metrics panel** — command latency (ms), frames per second, memory usage, CPU load
- **Per-robot metrics** — system metrics keyed by entity_id (rover identifier)
- **Real-time updates** — receive via `performance_metrics` Socket.IO event

## Functional Requirements

| Feature | Requirement | Status |
|---------|-------------|--------|
| Socket.IO connection | Auto-connect on app load, persist token, reconnect on disconnect | ✓ Implemented |
| Rover command emission | Throttle to 100ms intervals, track command ACK count | ✓ Implemented |
| Arm control | 6 sliders (0–360°), per-joint limits, home button | ✓ Implemented |
| Camera feed | Decode JPEG, render on canvas, update at socket frame rate | ✓ Implemented |
| Object detection | Render bbox overlays, support click-to-track | ✓ Implemented |
| Fleet selector | List rovers, show health metrics, switch control context | ✓ Implemented |
| Voice I/O | TTS playback, STT microphone capture, transcription display | ✓ Implemented |
| Metrics panel | Display latency, FPS, memory, CPU — per-robot or global | ✓ Implemented |
| Location map | Render rover path, support zoom/pan, update on telemetry | ✓ Implemented |

## Non-Functional Requirements

| Requirement | Target | Notes |
|-------------|--------|-------|
| Command latency | <100ms (emit-to-ack) | Throttle enforces minimum spacing |
| Audio latency | <500ms (TTS/STT round trip) | Depends on backend network latency |
| UI responsiveness | 60 FPS @ 1920×1080 | Canvas rendering, no layout thrashing |
| Deployment targets | Web (Vite, port 25010) + Desktop (Tauri, port 1420) | Dual build outputs |
| Browser support | Chrome 120+, Firefox 121+, Safari 17+ | ES2020 target, modern DOM APIs |
| Offline capability | Limited to cached camera frames; all commands require connection | No local sync; no offline queue |
| Accessibility | Semantic HTML, keyboard navigation for panels, high contrast mode ready | Not fully WCAG AA yet |
| Theme | Terminal/IDE dark mode with syntax colors, custom glass-morphic UI | No light mode; custom CSS classes |

## Technical Requirements

### Communication
- **Socket.IO 4.8** (client-side) connecting to `orchestra/web_bridge` backend on port 3030
- **Basic HTTP auth** — credentials in VITE_AUTH_USERNAME/PASSWORD
- **Binary frame handling** — Blob → createObjectURL → canvas context.drawImage()
- **Event-driven state** — all state updates via Socket.IO event handlers

### Deployment
- **Web**: Vite build artifact served as static site (no SSR)
- **Desktop**: Tauri v2 bundle; minimal Rust backend (only IPC, no server logic)
- **Environment config** — via .env file (VITE_SOCKET_IO_URL, auth credentials)

### Frontend Stack
- React 19 (latest stable)
- TypeScript 5.8 (strict mode)
- Tailwind CSS v4 with @tailwindcss/vite plugin
- Component library: Lucide React (icons), shadcn/ui patterns (optional)

### Data & Types
- Pure TypeScript types in `src/types/` (no ORM or schema validation framework)
- Shared constants in `src/constants/` (JOINT_LIMITS, class color maps, helper functions)
- Zero external state management (useState + props-down pattern)

### Build & Package Management
- **pnpm 9.1.0** workspaces (monorepo)
- **Turborepo** pipeline for dev/build/lint
- **ESLint** + **Prettier** for code quality
- **TypeScript** for type safety across all packages

## Integration Points

### Backend Connection
- **Target**: `orchestra/web_bridge` (Rust service running on port 3030)
- **Protocol**: Socket.IO with WebSocket fallback
- **Auth**: Basic credentials (username + password) in .env, transmitted on connection
- **Events**: Typed bidirectional event map (see `src/types/socket.ts`)

### Embedded App (glean-oak-app)
- Robo-Fleet Control can be embedded in `glean-oak-app` via Shadow DOM
- Entry point: `packages/ui/src/embed/` (planned)
- Props: `authTokens`, `basePath`, `onLogoutRequest`, `embedded` flag

## Architecture Patterns

### State Management
**No Redux/Zustand.** All state lives in `RoboRoverControl` page component (useState hooks), flows down as props to child components. Service-based pub/sub (Pattern B) available for extensibility, but not yet wired.

### Socket.IO Patterns
1. **Pattern A** (active) — Direct `useRef<Socket>` + `io()` in `RoboRoverControl`, `CameraViewer`
2. **Pattern B** (ready) — Service abstraction via `ServiceFactory` DI, supports testing/mocking

### Component Design
**Atomic Design** hierarchy:
- **Atoms** — BatteryIndicator, StatusBadge, LoadingSpinner, ValueDisplay, IconBadge, ToggleButton, StatCard
- **Molecules** — CollapsibleSection, SliderControl, ToggleControl, StatPanel, InputWithAction
- **Organisms** — JointControlPanel, FleetSelector, DraggablePanel
- **Features** — CameraViewer, LocationMap, VoiceControls, FloatingMetrics, TranscriptionDisplay
- **Pages** — RoboRoverControl (main controller)

### Styling
Tailwind v4 + custom globals.css:
- Glass-morphic UI (`.glass-card`, `.glass-card-blur`)
- Semantic color utilities (`.btn-primary`, `.status-glow-*`)
- CSS variables for theming (planned for future light mode support)

## Constraints & Trade-Offs

1. **No authentication** — app currently accepts hardcoded credentials; no JWT, SSO, or user management
2. **No persistence** — all state is ephemeral; closing the app loses telemetry history, fleet context, panel layouts
3. **No testing framework** — no Vitest/Jest setup; service abstraction (Pattern B) ready for future tests
4. **Single rover at a time** — can view fleet status, but only control one active rover (selected via FleetSelector)
5. **No undo/redo** — commands are fire-and-forget; no command queue or transaction log
6. **Synchronous prop updates** — 50ms camera frame updates can cause React re-renders; optimization opportunity via memo/callback

## Future Considerations

### High Priority
- **Auth implementation** — JWT tokens, refresh rotation, logout flow
- **Offline queue** — buffer commands when disconnected, retry on reconnection
- **Test suite** — Vitest with ServiceFactory DI pattern for component/hook testing
- **Accessibility** — WCAG AA compliance, keyboard navigation, screen reader support

### Medium Priority
- **Embedded mode** — full integration with glean-oak-app Shadow DOM
- **Light mode** — CSS variables + theme toggle UI
- **Persistence** — localStorage for panel layouts, preset poses, favorite rovers
- **Advanced arm control** — IK solver, Cartesian control, trajectory recording/playback

### Low Priority
- **Multi-rover simultaneous control** — master/detail UI for coordinated swarm commands
- **Telemetry recording** — CSV export of rover path, sensor log
- **Custom dashboard** — drag-drop panel layout builder
- **Plugin system** — custom control widgets via iframe isolation

## Success Metrics

- **Uptime** — >99% during operational hours (no Socket.IO reconnection loops)
- **Command latency** — <100ms emit-to-ack (meets requirement)
- **UI responsiveness** — 60 FPS during camera playback + concurrent telemetry updates
- **User satisfaction** — operators report intuitive control, predictable behavior
- **Code coverage** — >80% for service layer (when tests are added)

## Version History

- **v0.1.0** (2025-03-14) — Initial release with core rover control, arm, camera, fleet, voice, metrics
