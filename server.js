const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new Anthropic.default();

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute before trying again." },
});

// ─── In-Memory History (per session, resets on restart) ─────────────────────

const history = new Map(); // id -> { id, projectName, createdAt, readme }
const MAX_HISTORY = 50;

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_LICENSES = ["MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "ISC", "Unlicense"];
const VALID_TEMPLATES = ["standard", "minimal", "detailed"];

function sanitize(str, maxLen = 5000) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

function validateGenerateInput(body) {
  const errors = [];
  if (!body.description || sanitize(body.description).length < 10) {
    errors.push("Description must be at least 10 characters.");
  }
  if (body.license && !VALID_LICENSES.includes(body.license)) {
    errors.push(`Invalid license. Choose from: ${VALID_LICENSES.join(", ")}`);
  }
  if (body.template && !VALID_TEMPLATES.includes(body.template)) {
    errors.push(`Invalid template. Choose from: ${VALID_TEMPLATES.join(", ")}`);
  }
  return errors;
}

// ─── Prompt Templates ───────────────────────────────────────────────────────

function buildPrompt({ projectName, description, language, features, license, template, githubUrl }) {
  const name = sanitize(projectName, 200) || "My Project";
  const desc = sanitize(description);
  const lang = sanitize(language, 200) || "Not specified";
  const feat = sanitize(features, 2000) || "Not specified";
  const lic = VALID_LICENSES.includes(license) ? license : "MIT";
  const ghUrl = sanitize(githubUrl, 500);

  const baseContext = `Project Name: ${name}
Description: ${desc}
Primary Language/Stack: ${lang}
Key Features: ${feat}
License: ${lic}${ghUrl ? `\nGitHub URL: ${ghUrl}` : ""}`;

  const templates = {
    minimal: `Generate a clean, minimal GitHub README.md. Output ONLY raw markdown.

${baseContext}

Include ONLY these sections:
1. Project title + one-line description
2. Installation (2-3 commands max)
3. Usage (one simple example)
4. License line

Keep it under 60 lines. No emojis. No badges. Developers who read this want to get started fast.`,

    standard: `Generate a professional GitHub README.md. Output ONLY raw markdown.

${baseContext}

Include these sections:
1. Project title with a compelling one-liner tagline
2. Badges row (build, license, version — use shields.io format with placeholder URLs)
3. "Features" — bullet points highlighting what makes this project valuable
4. "Quick Start" — prerequisites + installation + first run in under 60 seconds
5. "Usage" — 2-3 practical code examples with comments
6. "Configuration" — key options/env vars in a table (if applicable)
7. "Contributing" — how to contribute (fork, branch, PR flow)
8. "License" — license type with year and author placeholder

Use clear markdown formatting. Add emojis to section headers. Make it scannable and developer-friendly.`,

    detailed: `Generate a comprehensive, production-grade GitHub README.md. Output ONLY raw markdown.

${baseContext}

Include ALL of these sections:
1. Project title + banner description + tagline
2. Badges row (build, coverage, license, version, downloads — shields.io format)
3. "Table of Contents" — linked to all sections
4. "Overview" — what it does, why it exists, who it's for (2-3 paragraphs)
5. "Features" — detailed bullet points grouped by category
6. "Architecture" — high-level system design or tech stack breakdown
7. "Prerequisites" — what you need before installing (versions, tools)
8. "Installation" — step-by-step for multiple methods (npm, docker, source)
9. "Usage" — 3-4 detailed examples covering common use cases
10. "API Reference" — key functions/endpoints in a table (if applicable)
11. "Configuration" — all options/env vars in a detailed table
12. "Testing" — how to run tests
13. "Deployment" — production deployment notes
14. "Roadmap" — upcoming features checklist
15. "Contributing" — detailed guide (setup, standards, PR process)
16. "Troubleshooting / FAQ" — 3-4 common issues
17. "License" — full license section
18. "Acknowledgments" — credits and links

Make it thorough, well-structured, and visually polished with emojis, tables, and collapsible sections where appropriate.`,
  };

  return templates[template] || templates.standard;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    historyCount: history.size,
  });
});

// Stream-generate README via SSE
app.post("/api/generate", generateLimiter, async (req, res) => {
  const errors = validateGenerateInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const template = req.body.template || "standard";
  const prompt = buildPrompt({ ...req.body, template });

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let fullText = "";

  try {
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const chunk = event.delta.text;
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      }
    }

    // Save to history
    const id = crypto.randomUUID();
    const entry = {
      id,
      projectName: sanitize(req.body.projectName, 200) || "Untitled",
      template,
      createdAt: new Date().toISOString(),
      readme: fullText,
    };
    history.set(id, entry);

    // Evict oldest if over limit
    if (history.size > MAX_HISTORY) {
      const oldest = history.keys().next().value;
      history.delete(oldest);
    }

    res.write(`data: ${JSON.stringify({ type: "done", id, projectName: entry.projectName })}\n\n`);
    res.end();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Claude API error:`, err.message);

    const errorMsg = err.status === 401
      ? "Invalid API key. Check your ANTHROPIC_API_KEY."
      : err.status === 429
        ? "Claude API rate limit hit. Please wait and try again."
        : "Failed to generate README. Please try again.";

    res.write(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`);
    res.end();
  }
});

// History list
app.get("/api/history", (req, res) => {
  const items = [...history.values()]
    .reverse()
    .map(({ id, projectName, template, createdAt }) => ({ id, projectName, template, createdAt }));
  res.json(items);
});

// Get single history entry
app.get("/api/history/:id", (req, res) => {
  const entry = history.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Not found" });
  res.json(entry);
});

// Delete history entry
app.delete("/api/history/:id", (req, res) => {
  if (!history.has(req.params.id)) return res.status(404).json({ error: "Not found" });
  history.delete(req.params.id);
  res.json({ ok: true });
});

// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ReadmeForge running at http://localhost:${PORT}\n`);
});
