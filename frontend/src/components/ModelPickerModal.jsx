import { X, Check, Zap, Brain, Cpu, Lock, Plus, CheckCircle, Loader2 } from 'lucide-react'
import { disconnectProvider } from '../api/client'

export const PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq',
    tagline: 'Free · Llama 3.3, Mixtral',
    free: true,
    accentCls: 'text-orange-600 bg-orange-50 border-orange-200',
    dotCls: 'bg-orange-500',
    models: [
      { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B', badge: 'Best',     badgeCls: 'bg-orange-100 text-orange-700',  Icon: Brain, desc: 'Most capable free model',        vision: false },
      { id: 'groq/llama-3.1-8b-instant',    name: 'Llama 3.1 8B',  badge: 'Default',  badgeCls: 'bg-green-100 text-green-700',    Icon: Zap,   desc: 'Fast & lightweight — default',   vision: false },
      { id: 'groq/mixtral-8x7b-32768',      name: 'Mixtral 8x7B',  badge: 'Balanced', badgeCls: 'bg-blue-100 text-blue-700',      Icon: Cpu,   desc: 'Balanced speed and quality',     vision: false },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-4o and more',
    accentCls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    dotCls: 'bg-emerald-500',
    iconBg: 'bg-zinc-900',
    iconLabel: 'O',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      badge: 'Smartest', badgeCls: 'bg-emerald-100 text-emerald-700', Icon: Brain, desc: 'Most capable GPT model',     vision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'Fast',     badgeCls: 'bg-green-100 text-green-700',    Icon: Zap,   desc: 'Efficient and affordable',  vision: true },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tagline: 'Claude Opus, Sonnet, Haiku',
    accentCls: 'text-amber-700 bg-amber-50 border-amber-200',
    dotCls: 'bg-amber-500',
    iconBg: 'bg-amber-600',
    iconLabel: 'A',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-8',        name: 'Claude Opus 4',   badge: 'Most Capable', badgeCls: 'bg-amber-100 text-amber-700',  Icon: Brain, desc: 'Best for complex tasks',   vision: true },
      { id: 'claude-sonnet-4-6',      name: 'Claude Sonnet 4', badge: 'Balanced',     badgeCls: 'bg-orange-100 text-orange-700',Icon: Brain, desc: 'Smart and efficient',      vision: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', badge: 'Fast',   badgeCls: 'bg-yellow-100 text-yellow-700', Icon: Zap,   desc: 'Quick and lightweight',  vision: true },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    tagline: 'Local & hosted open-source models',
    accentCls: 'text-violet-700 bg-violet-50 border-violet-200',
    dotCls: 'bg-violet-500',
    iconBg: 'bg-violet-600',
    iconLabel: 'O',
    keyUrl: 'https://ollama.com',
    models: [
      { id: 'ollama/llama3.2',   name: 'Llama 3.2',    badge: 'Fast',      badgeCls: 'bg-violet-100 text-violet-700', Icon: Zap,   desc: 'Meta Llama 3.2 — lightweight & fast', vision: false },
      { id: 'ollama/llama3.1',   name: 'Llama 3.1 8B', badge: 'Balanced',  badgeCls: 'bg-purple-100 text-purple-700', Icon: Brain, desc: 'Meta Llama 3.1 — great reasoning',      vision: false },
      { id: 'ollama/mistral',    name: 'Mistral 7B',   badge: 'Efficient', badgeCls: 'bg-fuchsia-100 text-fuchsia-700', Icon: Cpu, desc: 'Mistral AI — efficient & capable',    vision: false },
      { id: 'ollama/qwen2.5',    name: 'Qwen 2.5 7B',  badge: 'Multilingual', badgeCls: 'bg-pink-100 text-pink-700',  Icon: Cpu,   desc: 'Alibaba Qwen — multilingual support', vision: false },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    tagline: 'Gemini 2.5 Flash',
    accentCls: 'text-blue-700 bg-blue-50 border-blue-200',
    dotCls: 'bg-blue-500',
    iconBg: 'bg-blue-600',
    iconLabel: 'G',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Latest', badgeCls: 'bg-blue-100 text-blue-700', Icon: Zap, desc: 'Fast multimodal — vision + text', vision: true },
    ],
  },
]

// Flat map for external use (ChatWindow model label lookup)
export const MODELS = PROVIDERS.flatMap(p => p.models)

export default function ModelPickerModal({
  selectedModel,
  onSelect,
  onClose,
  connectedProviders,
  platformConfiguredProviders,
  onConnectProvider,
  onDisconnect,
}) {
  const connected = connectedProviders || []
  const platformConfigured = platformConfiguredProviders || ['groq']

  const handleDisconnect = async (e, providerId) => {
    e.stopPropagation()
    try {
      await disconnectProvider(providerId)
      onDisconnect?.(providerId)
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Select Model</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Choose AI model for your conversation</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider groups */}
        <div className="overflow-y-auto flex-1 p-3 space-y-4">
          {PROVIDERS.map(provider => {
            // A provider is accessible if: it's free (Groq), OR the user has connected their own key,
            // OR the platform has a key configured for it. Either path works.
            const isUserConnected = provider.free || connected.includes(provider.id)
            const isPlatformReady = provider.free || platformConfigured.includes(provider.id)
            const isAccessible = isUserConnected || isPlatformReady

            return (
              <div key={provider.id}>
                {/* Provider header */}
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <div className="flex items-center gap-2">
                    {isAccessible ? (
                      <span className={`w-2 h-2 rounded-full ${provider.dotCls}`} />
                    ) : (
                      <Lock className="w-3 h-3 text-zinc-400" />
                    )}
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      {provider.name}
                    </span>
                    <span className="text-[10px] text-zinc-400">{provider.tagline}</span>
                  </div>

                  {!provider.free && !isPlatformReady && (
                    isUserConnected ? (
                      <button
                        onClick={e => handleDisconnect(e, provider.id)}
                        className="text-[10px] text-zinc-400 hover:text-red-500 transition px-2 py-0.5 rounded-md hover:bg-red-50"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => onConnectProvider?.(provider, provider.models[0]?.id)}
                        className="flex items-center gap-1 text-[10px] font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition px-2 py-1 rounded-lg"
                      >
                        <Plus className="w-3 h-3" />
                        Connect
                      </button>
                    )
                  )}
                  {!provider.free && isPlatformReady && !isUserConnected && (
                    <span className="text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">
                      Platform
                    </span>
                  )}
                </div>

                {/* Model list */}
                <div className="space-y-1">
                  {provider.models.map(model => {
                    const isSelected = selectedModel === model.id
                    const locked = !isAccessible

                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          if (locked) {
                            onConnectProvider?.(provider, model.id)
                          } else {
                            onSelect(model.id)
                            onClose()
                          }
                        }}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                          isSelected && !locked
                            ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                            : locked
                              ? 'border-zinc-100 bg-zinc-50 opacity-60 cursor-pointer hover:opacity-80'
                              : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                          locked ? 'bg-zinc-200' : isSelected ? 'bg-orange-500' : 'bg-zinc-100'
                        }`}>
                          {locked
                            ? <Lock className="w-3.5 h-3.5 text-zinc-400" />
                            : <model.Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-zinc-500'}`} />
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-zinc-900 truncate">{model.name}</span>
                            <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${model.badgeCls}`}>
                              {model.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{model.desc}</p>
                        </div>

                        {isSelected && !locked && (
                          <div className="shrink-0 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {locked && (
                          <span className="shrink-0 text-[10px] text-zinc-400 font-medium">Connect →</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
