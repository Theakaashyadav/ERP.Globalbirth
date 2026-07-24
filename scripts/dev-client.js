const path = require("path");

const role = (process.argv[2] || "employee").toLowerCase();
const ports = {
  employee: 5173,
  hr: 5174,
  marketing: 5175
};

if (!ports[role]) {
  console.error("Unknown client role: " + role);
  console.error("Use one of: employee, hr, marketing");
  process.exit(1);
}

process.env.VITE_ATTENDANCE_ROLE = role;
process.env.APP_PORT = String(process.env.APP_PORT || ports[role]);
process.env.API_PORT = String(process.env.API_PORT || 3001);

async function startClient() {
  const { createServer } = await import("vite");
  const root = path.join(__dirname, "..");
  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.js")
  });

  await server.listen();
  console.log(role.toUpperCase() + " frontend running on http://localhost:" + process.env.APP_PORT);
  server.printUrls();
}

startClient().catch(error => {
  console.error(error);
  process.exit(1);
});
