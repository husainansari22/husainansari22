export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  systemPrompt:
    "You are a helpful, knowledgeable AI assistant. Answer clearly and thoroughly. You have no artificial topic restrictions — help the user with whatever they ask.",
  temperature: 0.7,
  maxTokens: 4096,
  stream: true,
};

export const MODEL_PRESETS = [
  { label: "GPT-4o Mini", value: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  { label: "GPT-4o", value: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
  { label: "GPT-4 Turbo", value: "gpt-4-turbo", baseUrl: "https://api.openai.com/v1" },
  { label: "Claude 3.5 Sonnet (OpenRouter)", value: "anthropic/claude-3.5-sonnet", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "Llama 3.1 70B (OpenRouter)", value: "meta-llama/llama-3.1-70b-instruct", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "Gemini Flash (OpenRouter)", value: "google/gemini-flash-1.5", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "Local Ollama", value: "llama3.2", baseUrl: "http://localhost:11434/v1" },
  { label: "Custom", value: "custom", baseUrl: "" },
] as const;
