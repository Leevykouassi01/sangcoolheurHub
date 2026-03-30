import { useState, useRef, useEffect } from "react";
import { User } from "firebase/auth";
import { MessageSquare, Send, Sparkles, User as UserIcon, Bot, Trash2, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getCareerAdvice } from "../services/geminiService";
import ReactMarkdown from "react-markdown";
import { AdviceMessage } from "../types";

export default function CareerCoach({ user }: { user: User | null }) {
  const [messages, setMessages] = useState<AdviceMessage[]>([
    {
      role: "model",
      text: "Bonjour ! Je suis ton coach de carrière Sangcoolheur. Comment puis-je t'aider aujourd'hui ? Tu peux me poser des questions sur ton CV, préparer un entretien ou demander des conseils sur le marché du travail."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: AdviceMessage = { role: "user", text: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await getCareerAdvice(newMessages);
      setMessages([...newMessages, { role: "model", text: response }]);
    } catch (error) {
      console.error("Failed to get advice", error);
      setMessages([...newMessages, { role: "model", text: "Désolé, j'ai rencontré une erreur. Peux-tu réessayer ?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "model",
        text: "Bonjour ! Je suis ton coach de carrière Sangcoolheur. Comment puis-je t'aider aujourd'hui ?"
      }
    ]);
  };

  const suggestions = [
    "Comment améliorer mon CV ?",
    "Prépare-moi pour un entretien de développeur",
    "Quelles sont les compétences les plus demandées ?",
    "Aide-moi à rédiger une lettre de motivation"
  ];

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-200px)] flex flex-col bg-white rounded-3xl border border-[#1a1a1a]/5 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Coach Carrière IA</h3>
            <p className="text-xs text-[#1a1a1a]/40 font-sans flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Intelligence Artificielle active
            </p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2 text-[#1a1a1a]/40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="Effacer la conversation"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
        {messages.map((msg, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i}
            className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              msg.role === "user" ? "bg-gray-200 text-gray-600" : "bg-brand-blue text-white"
            }`}>
              {msg.role === "user" ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[80%] p-4 rounded-2xl font-sans text-sm leading-relaxed ${
              msg.role === "user" 
                ? "bg-white border border-gray-100 text-[#1a1a1a] shadow-sm" 
                : "bg-brand-blue/5 border border-brand-blue/10 text-[#1a1a1a]/80"
            }`}>
              <div className="prose prose-sm prose-stone max-w-none">
                <ReactMarkdown>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-blue text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-brand-blue/5 p-4 rounded-2xl flex gap-1 items-center">
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-brand-blue rounded-full" />
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-brand-blue rounded-full" />
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-brand-blue rounded-full" />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-gray-100 space-y-4">
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s)}
                className="text-xs font-sans font-semibold px-3 py-1.5 bg-gray-50 text-[#1a1a1a]/60 rounded-full border border-gray-100 hover:border-[#5A5A40]/30 hover:text-[#5A5A40] transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Posez votre question ici..."
              className="w-full pl-4 pr-12 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 font-sans text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-blue text-white rounded-xl disabled:opacity-50 hover:bg-brand-blue/90 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-center text-[#1a1a1a]/30 font-sans flex items-center justify-center gap-1">
          <HelpCircle className="w-3 h-3" />
          L'IA peut faire des erreurs. Vérifiez les informations importantes.
        </p>
      </div>
    </div>
  );
}
