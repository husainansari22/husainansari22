# Unbound AI

A beautiful, unrestricted AI chat website. Connect any OpenAI-compatible API and chat without artificial limits.

![Unbound AI](https://img.shields.io/badge/AI-Unbound-violet)

## Features

- **No message limits** — send as much as you want
- **Any model** — OpenAI, OpenRouter, Ollama, or any compatible endpoint
- **Custom system prompts** — define exactly how the AI behaves
- **Streaming responses** — real-time token streaming
- **Conversation history** — saved locally in your browser
- **Markdown & code highlighting** — rich formatted responses
- **Mobile responsive** — works on any device

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Settings**, and add your API key.

### Server-side API key (optional)

Set an environment variable so users don't need their own key:

```bash
OPENAI_API_KEY=sk-your-key-here npm run dev
```

## Supported Providers

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| Any compatible API | Your custom URL |

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [React Markdown](https://github.com/remarkjs/react-markdown)
- OpenAI-compatible Chat Completions API

## License

MIT
