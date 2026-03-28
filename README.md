# 📖 ReadmeForge

Paste your project description, get a production-ready GitHub README in seconds. Powered by Claude API.

## Features

- **3 Templates** — Minimal, Standard, Detailed
- **Real-time Streaming** — README appears as it's generated
- **Markdown Preview** — rendered preview + raw markdown tabs
- **Copy & Download** — one-click export
- **Generation History** — revisit past READMEs
- **Rate Limiting** — built-in abuse protection
- **Input Validation** — server-side sanitization

## Setup

```bash
git clone https://github.com/krishnashahane/ReadmeForge.git
cd ReadmeForge
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_api_key_here
```

## Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Stack

- **Backend:** Node.js, Express, Claude API (streaming SSE)
- **Frontend:** Vanilla HTML/CSS/JS, marked.js
- **Security:** express-rate-limit, input sanitization

## License

MIT 
