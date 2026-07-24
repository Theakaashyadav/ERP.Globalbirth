const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

const appPort = Number(process.env.APP_PORT || 5173);
const apiPort = process.env.API_PORT || process.env.PORT || 3001;
const apiTarget = "http://localhost:" + apiPort;

module.exports = defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: appPort,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/attendance-config.js": apiTarget
    }
  }
});
