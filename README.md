# Kelvin API + KelvinOz

Personal **Kelvin API** at **kelvinoz.com** — OpenAI-compatible endpoints you own.
The website talks only to Kelvin API. No NoMask / OpenAI vendor keys on the server.

## Architecture

```
Browser / your apps  →  Kelvin API (/v1)  →  YOUR engine (Ollama, vLLM, LM Studio, …)
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/status` | API status |
| GET | `/v1/models` | Model list |
| POST | `/v1/chat/completions` | Chat (OpenAI-compatible) |
| POST | `/v1/images/generations` | Images (needs your image engine) |

Docs page: https://kelvinoz.com/api.html

## Auth

```bash
Authorization: Bearer YOUR_KELVIN_API_KEY
```

Same-origin website requests are allowed without a key. External scripts/apps need the key.

## Required: your model engine

Hostinger Node cannot run big LLMs. Run Ollama (or similar) on a VPS **you** control:

```bash
# On your VPS
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
# API: http://YOUR_VPS_IP:11434/v1
```

Or: `docker compose -f deploy/docker-compose.engine.yml up -d`

## Deploy

```bash
export HOSTINGER_API_KEY=...
export KELVIN_API_KEY=kelvin_your_secret
export KELVIN_ENGINE_BASE_URL=http://YOUR_VPS_IP:11434/v1
export KELVIN_ENGINE_MODEL=llama3.2
# optional images:
# export KELVIN_IMAGE_ENGINE_URL=http://YOUR_VPS_IP:7860/v1

node scripts/deploy-hostinger.mjs
```

## Environment

| Variable | Description |
|----------|-------------|
| `KELVIN_API_KEY` | Your personal Kelvin API key |
| `KELVIN_ENGINE_BASE_URL` | Your OpenAI-compatible engine base (`…/v1`) |
| `KELVIN_ENGINE_API_KEY` | Optional key for your engine |
| `KELVIN_ENGINE_MODEL` | Default model id |
| `KELVIN_IMAGE_ENGINE_URL` | Optional image engine base (`…/v1`) |
| `HOSTINGER_API_KEY` | Deploy script only |
