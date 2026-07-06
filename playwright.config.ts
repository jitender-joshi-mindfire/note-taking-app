import { defineConfig } from "@playwright/test";

const BACKEND_PORT = 3200;
const FRONTEND_PORT = 5273;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
  },
  webServer: [
    {
      name: "backend",
      command: "pnpm --filter @note-taking-app/backend dev",
      url: `http://localhost:${BACKEND_PORT}/api/tags`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(BACKEND_PORT),
        APP_BASE_URL: `http://localhost:${BACKEND_PORT}`,
        DOTENV_CONFIG_PATH: ".env.test",
      },
    },
    {
      name: "frontend",
      command: `pnpm --filter @note-taking-app/frontend dev --port ${FRONTEND_PORT}`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}/api`,
      },
    },
  ],
});
