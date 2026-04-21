import express from "express";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase body size for multiple file uploads
  app.use(express.json({ limit: '50mb' }));

  // API Route: Python Parser Bridge
  app.post("/api/parse", (req, res) => {
    const { filename, content_hex } = req.body;

    if (!filename || !content_hex) {
      return res.status(400).json({ error: "Missing filename or content" });
    }

    // Call Python script
    const python = spawn("python3", ["parser.py"]);
    let output = "";
    let errorOutput = "";

    python.stdin.write(JSON.stringify({ filename, content_hex }));
    python.stdin.end();

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error(`Python error: ${errorOutput}`);
        return res.status(500).json({ error: "Parser execution failed" });
      }
      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: "Failed to parse result from Python" });
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (Express + Python Bridge)`);
  });
}

startServer();
