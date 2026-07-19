require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createApp } = require("./app");

async function startDevServer() {
  const { createServer } = await import("vite");
  const port = process.env.PORT || 3000;
  const root = path.join(__dirname, "../..");

  const vite = await createServer({
    root,
    server: {
      middlewareMode: true
    },
    appType: "custom"
  });

  const app = createApp({
    vite,
    async renderIndex(req, res) {
      try {
        const template = fs.readFileSync(path.join(root, "index.html"), "utf8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).type("html").send(html);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        res.status(500).send(error.stack);
      }
    }
  });

  app.listen(port, () => {
    console.log("Attendance dev server running on http://localhost:" + port);
  });
}

startDevServer().catch(error => {
  console.error(error);
  process.exit(1);
});
