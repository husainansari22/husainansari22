# KelvinOz AI

Uncensored, unrestricted AI coding assistant at **kelvinoz.com**.

## Features

- Access code lock (`@535846.oZ`)
- Uncensored coding assistant — JavaScript, TypeScript, React, Node.js, Python, and more
- OpenAI-compatible API support
- Streaming chat with markdown and code highlighting
- Conversation history saved locally

## Local Development

```bash
npm install
cp .env.example .env.local
# Set OPENAI_API_KEY and ACCESS_CODE in .env.local
npm run dev
```

## Deploy to kelvinoz.com (Hostinger)

```bash
HOSTINGER_API_KEY=your-token npm run deploy
```

This uploads a clean standalone build, replaces old files, and restarts the Node.js server.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ACCESS_CODE` | Login access code (default: `@535846.oZ`) |
| `OPENAI_API_KEY` | AI provider API key |
| `HOSTINGER_API_KEY` | For deploy script only (not used by the website) |
