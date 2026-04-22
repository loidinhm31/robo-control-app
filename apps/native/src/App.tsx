import { RoboRoverControl } from "@robo-fleet/ui/components/pages";

// Load configuration from environment variables
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || "http://localhost:3030";
const AUTH_USERNAME = import.meta.env.VITE_AUTH_USERNAME || "";
const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || "";

function App() {
  return (
    <RoboRoverControl
      socketUrl={SOCKET_URL}
      auth={AUTH_USERNAME && AUTH_PASSWORD ? { username: AUTH_USERNAME, password: AUTH_PASSWORD } : undefined}
    />
  );
}

export default App;
