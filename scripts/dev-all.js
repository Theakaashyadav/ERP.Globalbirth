const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const apiPort = process.env.API_PORT || "3001";

const processes = [
  {
    title: "Attendance API",
    command: "npm run dev:api"
  },
  {
    title: "Employee Frontend",
    command: "npm run dev:employee"
  },
  {
    title: "HR Frontend",
    command: "npm run dev:hr"
  },
  {
    title: "Marketing Manager Frontend",
    command: "npm run dev:marketing"
  }
];

function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

for (const processInfo of processes) {
  const command = [
    "$Host.UI.RawUI.WindowTitle = " + psQuote(processInfo.title),
    "Set-Location " + psQuote(root),
    "$env:API_PORT = " + psQuote(apiPort),
    processInfo.command
  ].join("; ");

  const startCommand = [
    "Start-Process",
    "-FilePath powershell.exe",
    "-ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command'," + psQuote(command) + ")"
  ].join(" ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", startCommand],
    {
      stdio: "inherit",
      windowsHide: false
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("Opened separate terminals:");
console.log("- API logs: http://localhost:" + apiPort);
console.log("- Employee logs: http://localhost:5173");
console.log("- HR logs: http://localhost:5174");
console.log("- Marketing logs: http://localhost:5175");
