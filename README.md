# ReadmeForge

ReadmeForge generates GitHub README files from a project description using the Anthropic Claude API.

## Features

- Minimal, Standard, and Detailed templates
- Streaming generation with Server-Sent Events
- Live Markdown preview and raw Markdown view
- Copy and download
- Session-scoped generation history
- Server-side validation and request-size limits
- Per-client rate limiting
- Sanitized Markdown preview
- Defensive HTTP security headers

## Requirements

- Node.js 18+
- Anthropic API key

The app defaults to Claude Sonnet 5.5 (claude-sonnet-5-5). Set ANTHROPIC_MODEL to use another supported model.

## Installation

~~~bash
git clone https://github.com/krishnashahane/ReadmeForge.git
cd ReadmeForge
npm ci
~~~

Create .env:

~~~env
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-sonnet-5-5
PORT=3000
~~~

.env is ignored by Git.

## Run

~~~bash
npm start
~~~

Open http://localhost:3000.

Development:

~~~bash
npm run dev
~~~

## How it works

1. The browser sends project details to POST /api/generate.
2. The server validates the request and applies rate limiting.
3. Claude generates the README and the server streams the result through SSE.
4. The browser renders Markdown and sanitizes the resulting DOM before displaying it.
5. Generated READMEs are stored in memory and isolated to the current browser session.

## API

### GET /api/health

Returns service status, API configuration state, uptime, and the current session's history count.

### POST /api/generate

Required: description, at least 10 characters.

Optional: projectName, language, features, license, template, githubUrl.

Templates: minimal, standard, detailed.

The response is an SSE stream with chunk, done, and error events.

### GET /api/history

Lists README metadata for the current session.

### GET /api/history/:id

Returns one README belonging to the current session.

### DELETE /api/history/:id

Deletes one README belonging to the current session.

## Security

- The Anthropic API key remains server-side.
- JSON request bodies are limited to 50 KB.
- Generation is rate-limited to 10 requests per minute per client address.
- History entries are protected by an opaque HttpOnly session cookie.
- Generated Markdown is sanitized before insertion into the DOM.
- Dangerous event-handler attributes and unsupported URL schemes are removed from rendered output.
- Express fingerprinting is disabled and defensive HTTP headers are applied.
- The application does not execute shell commands from user input.

## Data and limitations

History is in-memory only and is lost when the server restarts. There is no database or account system.

ReadmeForge generates documentation from the fields supplied by the user; it does not automatically inspect a Git repository.

## Project structure

~~~text
ReadmeForge/
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── .env.example
├── .gitignore
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
└── server.js
~~~

## License

MIT
