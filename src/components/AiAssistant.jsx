import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

function MessageBody({ text }) {
  return text.split('\n').map((line, j) => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return (
        <div key={j} className="font-semibold mt-1">
          {line.slice(2, -2)}
        </div>
      )
    }
    if (line.match(/^\d+\. /) || line.startsWith('• ')) {
      return (
        <div key={j} className="ml-2">
          {line}
        </div>
      )
    }
    return line ? (
      <div key={j}>{line}</div>
    ) : (
      <div key={j} className="h-1" />
    )
  })
}

export default function AiAssistant({ messages, onSend }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="px-4 py-3 shrink-0 border-b border-slate-100">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-sm bg-brand-acc2 text-[#1a1a00]">
          ✨ AI Assistant
        </div>
        <div className="text-xs mt-1.5 text-slate-400">
          Quote check mode · ask anything
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center mr-1.5 mt-0.5 bg-brand-acc2 text-[10px]">
                ✨
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-main text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              }`}
            >
              <MessageBody text={msg.text} />
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 shrink-0 border-t border-slate-100">
        <div className="rounded-xl p-2.5 flex gap-2 items-end border-[1.5px] border-slate-200">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask me a question if you need help..."
            rows={2}
            className="flex-1 text-xs resize-none outline-none bg-transparent leading-relaxed text-slate-800 min-h-10"
          />
          <button
            type="button"
            onClick={handleSend}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-acc3 text-brand-main hover:opacity-90 active:scale-95 transition-all"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2.2} />
            Send ✓
          </button>
        </div>
      </div>
    </div>
  )
}
