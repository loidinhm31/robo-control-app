# Robo-Fleet Control — Code Standards

## Project Organization

### Monorepo Structure (Turborepo + pnpm)

```
robo-control-app/
├── apps/
│   ├── web/       (@robo-fleet/web)      — Vite entry point
│   └── native/    (@robo-fleet/native)   — Tauri entry point
├── packages/
│   ├── ui/        (@robo-fleet/ui)       — All components, hooks, services
│   ├── shared/    (@robo-fleet/shared)   — Types, constants (zero dependencies)
│   ├── tsconfig/
│   └── eslint-config/
└── pnpm-workspace.yaml
```

**Conventions:**
- `pnpm install` from root; never `npm install` in subdirectories
- `pnpm turbo run dev --filter=@robo-fleet/web` to run specific packages
- Workspaces auto-resolve internal `@robo-fleet/*` imports

## Component Organization (Atomic Design)

Hierarchy in `src/components/`:

```
atoms/          Single responsibilities (StatCard, BatteryIndicator, StatusBadge)
molecules/      Composite building blocks (SliderControl, CollapsibleSection)
organisms/      Complex interactive components (JointControlPanel, FleetSelector)
features/       Full features (CameraViewer, VoiceControls, LocationMap)
pages/          Full page controllers (RoboRoverControl, URDFVisualizationPage)
```

**Rules:**
- Atoms → pure presentation, no business logic
- Molecules → minimal composition, reusable across features
- Organisms → feature-scoped, can contain state (but prefer lifting to page)
- Features → self-contained features (camera, voice, map, etc.)
- Pages → main controllers, hold Socket.IO connection + main state

**Export pattern:**
```typescript
// components/atoms/index.ts
export { BatteryIndicator } from './BatteryIndicator';
export { StatusBadge } from './StatusBadge';
export type { BatteryIndicatorProps } from './BatteryIndicator';
```

## Naming Conventions

### Components
- **PascalCase** — `RoboRoverControl`, `JointControlPanel`, `CameraViewer`
- **Descriptive** — noun + action if interactive (e.g., `FleetSelector`, not `Fleet`)
- **Compound names** — use full phrases for clarity (avoid abbreviations)

### Props & State
- **camelCase** — `isConnected`, `batteryPercent`, `servoPositions`
- **Boolean prefix** — `is*`, `has*`, `can*`, `should*` (e.g., `isConnected`, `hasError`)
- **Plural for arrays** — `detections`, `rovers`, `joints`

### Files
- **kebab-case** for directories — `components/joint-control-panel/`
- **PascalCase.tsx** for component files — `JointControlPanel.tsx`
- **camelCase.ts** for utilities/types — `types.ts`, `constants.ts`, `helpers.ts`

### Socket.IO Events
- **snake_case** — `rover_command`, `tracked_detections`, `fleet_status`
- Prefix with domain — `rover_*`, `arm_*`, `audio_*`, `voice_*`

## Type System

### Shared Types (`src/types/`)

**Organization by domain:**
- `types/socket.ts` — Socket.IO event maps (ClientToServerEvents, ServerToClientEvents)
- `types/commands.ts` — WebRoverCommand, WebArmCommand, TrackingCommand
- `types/telemetry.ts` — RoverTelemetry, ArmTelemetry, SystemMetrics
- `types/voice.ts` — SpeechTranscription, TTSMessage, AudioFrame
- `types/fleet.ts` — FleetStatus, RoverStatus, RoverHealth
- `types/ui.ts` — UI-specific types (ConnectionState, LogEntry)
- `types/index.ts` — Re-export barrel file

**TypeScript Strict Mode:**
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

**Type naming:**
- Prefix interfaces with `I` — `ISocketService`, `IRoverCommandService` (service types only)
- No prefix for data types — `RoverTelemetry`, `FleetStatus`
- Suffix generics with `<T>` — `ApiResponse<T>`, `PagedResult<T>`

### Component Props

```typescript
interface RoboRoverControlProps {
  // No props yet; main controller is standalone
}

interface CameraViewerProps {
  frameData: Uint8Array | null;
  detections: Detection[];
  onTrack?: (bbox: BoundingBox) => void;
  isLoading?: boolean;
}

interface JointControlPanelProps {
  positions: JointPositions;
  limits: JointLimit[];
  isEnabled?: boolean;
  onPositionChange?: (positions: JointPositions) => void;
}
```

**Conventions:**
- Event handlers as optional `on*` props
- State as required props (no defaults in interface)
- Use single-line unions for simple types: `type Status = 'connected' | 'disconnected' | 'error'`

## State Management

**Pattern: Props Down, Events Up (no external state library)**

```typescript
// Page component holds state
const [roverTelemetry, setRoverTelemetry] = useState<RoverTelemetry | null>(null);
const [isConnected, setIsConnected] = useState(false);

// Pass to children
<CameraViewer
  frameData={cameraFrame}
  isLoading={!isConnected}
  onTrack={handleTrack}
/>

// Update via Socket.IO handlers
useEffect(() => {
  socket.on('rover_core_telemetry', (data) => setRoverTelemetry(data));
}, []);
```

**Service Factory Pattern (Pattern B, extensible):**

```typescript
// Services can be injected/mocked for testing
interface ISocketService {
  connect(): Promise<void>;
  disconnect(): void;
  on<T>(event: string, callback: (data: T) => void): () => void;
  emit<T>(event: string, data: T): void;
}

class SocketService implements ISocketService { ... }

// DI via module-level singleton
let socketService: ISocketService = new SocketService();
export const setSocketService = (service: ISocketService) => { socketService = service; };
export const getSocketService = () => socketService;
```

## Styling

### Tailwind CSS v4

**Config location:** `src/styles/globals.css` (CSS-first, no JS config file)

**Plugin:** `@tailwindcss/vite` in `vite.config.ts`

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

### Custom Utilities

**Glass-morphic components:**
```css
@layer components {
  .glass-card {
    @apply backdrop-blur-md bg-white/10 border border-white/20 rounded-lg shadow-lg;
  }
  .glass-card-blur {
    @apply backdrop-blur-lg bg-white/5 border border-white/15;
  }
}
```

**Button variants:**
```css
@layer components {
  .btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700; }
  .btn-secondary { @apply bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700; }
  .btn-success { @apply bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700; }
  .btn-danger { @apply bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700; }
}
```

**Status indicators:**
```css
@layer components {
  .status-glow-active { @apply text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]; }
  .status-glow-disconnected { @apply text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.6)]; }
  .status-glow-idle { @apply text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]; }
}
```

### Font Stack

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  --font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

body {
  @apply font-sans;
}

code, pre, .code-display {
  @apply font-mono;
}
```

### Color Palette (Terminal/IDE Theme)

```css
:root {
  /* Backgrounds */
  --color-bg-primary: #0f172a;     /* Dark slate */
  --color-bg-secondary: #1e293b;   /* Medium slate */
  --color-bg-tertiary: #334155;    /* Light slate */

  /* Text */
  --color-text-primary: #f1f5f9;   /* Off-white */
  --color-text-secondary: #cbd5e1; /* Medium gray */
  --color-text-muted: #94a3b8;     /* Dark gray */

  /* Accents */
  --color-accent-blue: #3b82f6;
  --color-accent-cyan: #06b6d4;
  --color-accent-green: #10b981;
  --color-accent-orange: #f97316;
  --color-accent-red: #ef4444;

  /* Semantic */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}
```

**Apply via classes:**
```tsx
<div className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
  <button className="bg-[var(--color-accent-blue)] hover:opacity-80">Action</button>
</div>
```

## Socket.IO Patterns

### Pattern A (Active) — Direct Socket in Components

Use when simplicity is priority (production):

```typescript
import { io, Socket } from 'socket.io-client';

const MyComponent: React.FC = () => {
  const socketRef = useRef<Socket>();

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      auth: {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      },
    });

    socketRef.current.on('connect', () => console.log('Connected'));
    socketRef.current.on('rover_core_telemetry', (data: RoverTelemetry) => {
      // Handle telemetry
    });

    return () => socketRef.current?.disconnect();
  }, []);

  const emitCommand = (cmd: WebRoverCommand) => {
    socketRef.current?.emit('rover_command', cmd);
  };

  return <div>...</div>;
};
```

### Pattern B (Extensible) — Service Abstraction

Use when testing/mocking is priority:

```typescript
// Service interface
export interface ISocketService {
  connect(): Promise<void>;
  disconnect(): void;
  on<T>(event: string, handler: (data: T) => void): () => void;
  emit<T>(event: string, data: T): void;
}

// Service implementation
class SocketService implements ISocketService {
  private socket: Socket | null = null;

  async connect() {
    this.socket = io(SOCKET_URL, { auth: { username, password } });
    return new Promise((resolve) => {
      this.socket?.on('connect', resolve);
    });
  }

  on<T>(event: string, handler: (data: T) => void): () => void {
    this.socket?.on(event, handler);
    return () => this.socket?.off(event, handler);
  }

  emit<T>(event: string, data: T) {
    this.socket?.emit(event, data);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

// DI via module-level singleton
let socketService: ISocketService = new SocketService();
export const setSocketService = (service: ISocketService) => { socketService = service; };
export const getSocketService = () => socketService;

// Usage in component
const socketService = getSocketService();
const unsubscribe = socketService.on<RoverTelemetry>('rover_core_telemetry', (data) => {
  setTelemetry(data);
});
return () => unsubscribe();
```

## Path Aliases

### TypeScript (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@robo-fleet/ui/*": ["../../packages/ui/src/*"],
      "@robo-fleet/shared/*": ["../../packages/shared/src/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

### Vite (`vite.config.ts`)

```typescript
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@robo-fleet/ui': resolve(__dirname, '../../packages/ui/src'),
      '@robo-fleet/shared': resolve(__dirname, '../../packages/shared/src'),
      '@': resolve(__dirname, './src'),
    },
  },
});
```

**Usage:**
```typescript
import { RoboRoverControl } from '@robo-fleet/ui/components/pages';
import type { RoverTelemetry } from '@robo-fleet/shared/types';
import { CameraViewer } from '@/components';
```

## React & TypeScript Best Practices

### Functional Components

```typescript
// ✓ Good
interface MyComponentProps {
  title: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
}

const MyComponent: React.FC<MyComponentProps> = ({ title, onClick, children }) => {
  return <button onClick={onClick}>{title} {children}</button>;
};

// ✗ Avoid — implicit return type
const MyComponent = ({ title }: MyComponentProps) => {
  return <button>{title}</button>;
};
```

### Hooks

```typescript
// ✓ Good — explicit dependencies
useEffect(() => {
  socket.on('event', handler);
  return () => socket.off('event', handler);
}, [socket]); // socket is stable ref

// ✗ Avoid — missing dependencies
useEffect(() => {
  setData(calculateData(itemId)); // missing itemId dependency
}, []);

// ✓ Good — useCallback for event handlers
const handleClick = useCallback((e: React.MouseEvent) => {
  emitCommand(commandData);
}, [commandData]); // Memoize to prevent child re-renders

// ✗ Avoid — recreating handler on every render
const handleClick = (e: React.MouseEvent) => {
  emitCommand(commandData);
};
```

### Error Handling

```typescript
// ✓ Good — explicit error type
try {
  await socketService.connect();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Connection failed:', message);
  setError(message);
}

// ✗ Avoid — silent failures
try {
  await socketService.connect();
} catch (error) {
  console.error(error); // No type guard, unclear error
}
```

## Constants & Configuration

### Joint Limits (`constants/index.ts`)

```typescript
export const JOINT_LIMITS = {
  shoulder_pan: { min: -180, max: 180, unit: 'degrees' },
  shoulder_lift: { min: -90, max: 90, unit: 'degrees' },
  elbow_flex: { min: 0, max: 180, unit: 'degrees' },
  // ... more joints
} as const;

export function validateJointPositions(positions: JointPositions): boolean {
  return Object.entries(positions).every(([joint, angle]) => {
    const limit = JOINT_LIMITS[joint as keyof typeof JOINT_LIMITS];
    return angle >= limit.min && angle <= limit.max;
  });
}
```

### Class Color Map

```typescript
export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  person: '#FF6B6B',
  robot: '#4ECDC4',
  obstacle: '#FFE66D',
  target: '#95E1D3',
  unknown: '#A8DADC',
};

export function getClassColor(className: string): string {
  return DEFAULT_CLASS_COLORS[className] || DEFAULT_CLASS_COLORS.unknown;
}
```

## Linting & Formatting

### ESLint Configuration

```javascript
// .eslintrc.cjs
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
```

### Prettier Configuration

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

## Build & Deployment

### Development

```bash
pnpm dev              # Start all dev servers
pnpm dev:web          # Web only (Vite HMR on localhost:25010)
pnpm dev:native       # Tauri only (native window on port 1420)
pnpm check-types      # TypeScript type checking
pnpm lint             # ESLint all packages
```

### Production

```bash
pnpm build            # Optimized builds
# Output:
#   apps/web/dist/        (static SPA)
#   apps/native/dist/     (Tauri bundles)
```

### Environment-Specific Config

Web app reads from `.env`:
```bash
# .env
VITE_SOCKET_IO_URL=https://api.example.com:3030
VITE_AUTH_USERNAME=robot-control
VITE_AUTH_PASSWORD=secure-password
```

## Performance Optimization

### Rendering

```typescript
// ✓ Good — memoize expensive components
const CameraViewer = React.memo(({ frameData, detections }: Props) => {
  return <canvas>...</canvas>;
}, (prev, next) => {
  // Custom comparison: only re-render if data actually changed
  return prev.frameData === next.frameData && prev.detections === next.detections;
});

// ✓ Good — lazy load features
const URDFViewer = React.lazy(() => import('./URDFViewer'));

<Suspense fallback={<LoadingSpinner />}>
  <URDFViewer />
</Suspense>
```

### Canvas Optimization

```typescript
// ✓ Good — reuse canvas context, batch operations
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  const ctx = canvasRef.current?.getContext('2d');
  if (!ctx) return;

  // Batch updates
  ctx.clearRect(0, 0, width, height);
  drawBackground(ctx);
  drawPath(ctx);
  drawDetections(ctx);
}, [frameData, detections]);
```

## Security Considerations

- **Credentials in .env** — Never commit `.env` to Git; use `.env.example` for defaults
- **Auth tokens** — Currently basic username/password; migrate to JWT when implemented
- **CORS headers** — Backend must allow cross-origin WebSocket connections
- **Input validation** — Validate all Socket.IO event data before processing

## Documentation

- Each component should have JSDoc comments for props and return types
- README at root explains monorepo structure and quick start
- CLAUDE.md in root provides architecture & implementation guidance
- docs/ directory contains architecture, PDR, and code standards guides
