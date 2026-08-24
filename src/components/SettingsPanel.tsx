"use client";

import { X, Key, Globe, Cpu, Thermometer, Hash, FileText, Zap } from "lucide-react";
import { ChatSettings, MODEL_PRESETS } from "@/types/chat";

interface SettingsPanelProps {
  settings: ChatSettings;
  onChange: (settings: ChatSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  const update = (patch: Partial<ChatSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const handlePresetChange = (value: string) => {
    const preset = MODEL_PRESETS.find((p) => p.value === value);
    if (!preset) return;
    if (preset.value === "custom") {
      update({ model: settings.model });
      return;
    }
    update({ model: preset.value, baseUrl: preset.baseUrl });
  };

  const currentPreset =
    MODEL_PRESETS.find((p) => p.value === settings.model && p.baseUrl === settings.baseUrl)
      ?.value || "custom";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Settings</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Connect any OpenAI-compatible API. Your keys stay in your browser.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <Field icon={Key} label="API Key">
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="sk-… or leave blank to use server key"
              className="input-field"
            />
          </Field>

          <Field icon={Cpu} label="Model Preset">
            <select
              value={currentPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="input-field"
            >
              {MODEL_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={Globe} label="API Base URL">
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="input-field"
            />
          </Field>

          <Field icon={Hash} label="Model Name">
            <input
              type="text"
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="input-field"
            />
          </Field>

          <Field icon={FileText} label="System Prompt">
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={4}
              className="input-field resize-none"
              placeholder="Define how the AI should behave…"
            />
          </Field>

          <Field
            icon={Thermometer}
            label={`Temperature: ${settings.temperature.toFixed(1)}`}
          >
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-violet-500"
            />
          </Field>

          <Field icon={Hash} label="Max Tokens">
            <input
              type="number"
              min={256}
              max={128000}
              step={256}
              value={settings.maxTokens}
              onChange={(e) => update({ maxTokens: parseInt(e.target.value, 10) || 4096 })}
              className="input-field"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4">
            <input
              type="checkbox"
              checked={settings.stream}
              onChange={(e) => update({ stream: e.target.checked })}
              className="h-4 w-4 rounded accent-violet-500"
            />
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-violet-400" />
              <span className="text-sm text-zinc-200">Stream responses in real time</span>
            </div>
          </label>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-violet-600 py-3 font-medium text-white transition hover:bg-violet-500"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Icon size={14} className="text-violet-400" />
        {label}
      </label>
      {children}
    </div>
  );
}
