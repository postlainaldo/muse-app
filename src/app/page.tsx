"use client";

import { useState, useEffect } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

interface StoryBlock {
  id: string;
  type: "user" | "ai";
  text: string;
  timestamp: string;
}

export default function Page() {
  return (
    <SessionProvider>
      <MuseContent />
    </SessionProvider>
  );
}

function MuseContent() {
  const { data: session } = useSession();
  const [blocks, setBlocks] = useState([] as StoryBlock[]); // Ép kiểu phẳng không dùng dấu ngoặc nhọn <>
  const [title, setTitle] = useState("Truyện chưa đặt tên");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("editor"); 
  const [storiesList, setStoriesList] = useState([] as any[]);
  const [greeting, setGreeting] = useState("Chào ngày mới");
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isSystemCollapsed, setIsSystemCollapsed] = useState(true);

  // Gợi ý sáng tác động
  const [suggestions, setSuggestions] = useState([
    "🌸 Đi sâu vào nội tâm nhân vật",
    "✨ Tạo ra một cuộc gặp gỡ bất ngờ",
    "🎭 Đẩy kịch tính lên cao trào"
  ] as string[]);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // 1. Tính toán lời chào ngọt ngào
  useEffect(() => {
    const hr = new Date().getHours();
    const name = "XIENGG XIENGG";
    if (hr >= 4 && hr < 11) {
      setGreeting("Một buổi sáng dịu lành, " + name);
    } else if (hr >= 11 && hr < 14) {
      setGreeting("Bắt đầu buổi trưa thôi, " + name);
    } else if (hr >= 14 && hr < 18) {
      setGreeting("Một chiều nhẹ nhàng nhé, " + name);
    } else {
      setGreeting("Buổi tối thật bình yên, " + name);
    }
  }, []);

  // 2. Tải dữ liệu từ Google Drive sau khi liên kết thành công
  useEffect(() => {
    if (session) {
      fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load" })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.stories && data.stories.length > 0) {
            setStoriesList(data.stories);
            setBlocks(data.stories[0].blocks || []);
            setTitle(data.stories[0].title || "Truyện chưa đặt tên");
            setSystemInstructions(data.stories[0].systemInstructions || "");
          }
        })
        .catch((err) => console.error(err));
    }
  }, [session]);

  // 3. Tự động lưu trữ ngầm lên Google Drive (Debounce 1.5 giây sau khi ngừng gõ)
  useEffect(() => {
    if (!session || blocks.length === 0) return;
    const delayDebounceFn = setTimeout(() => {
      setSaving(true);
      const combinedContent = blocks.map((b) => b.text).join("\n\n");
      const newStoryList = [{ 
        title, 
        content: combinedContent, 
        systemInstructions, 
        blocks 
      }];
      setStoriesList(newStoryList);

      fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", stories: newStoryList })
      })
        .catch((err) => console.error(err))
        .finally(() => setSaving(false));
    }, 1500);
    return () => clearTimeout(delayDebounceFn);
  }, [blocks, systemInstructions, title, session]);

  function handleGetSuggestions() {
    setLoadingSuggestions(true);
    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", currentStory: blocks.map((b) => b.text).join("\n\n") })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.suggestions) {
          setSuggestions(data.suggestions);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingSuggestions(false));
  }

  function handleGenerate(moodType?: string) {
    const promptToSend = moodType || userPrompt;
    if (!promptToSend.trim() || loading) return;

    setLoading(true);

    const userBlock: StoryBlock = {
      id: "user_" + Date.now(),
      type: "user",
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    };

    const updatedBlocks = [...blocks, userBlock];
    setBlocks(updatedBlocks);
    setUserPrompt("");

    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "generate", 
        title,
        systemInstructions,
        blocks: updatedBlocks, 
        userPrompt: promptToSend 
      })
    })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error("Lỗi kết nối máy chủ AI.");
        }
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.text) {
          const aiBlock: StoryBlock = {
            id: "ai_" + Date.now(),
            type: "ai",
            text: data.text,
            timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
          };
          const finalBlocks = [...updatedBlocks, aiBlock];
          setBlocks(finalBlocks);
          handleGetSuggestions(finalBlocks);
        }
      })
      .catch((err) => {
        alert("Lỗi: " + (err.message || "Gặp sự cố."));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleDeleteBlock(id: string) {
    const updatedBlocks = blocks.filter((b) => b.id !== id);
    setBlocks(updatedBlocks);
    handleGetSuggestions(updatedBlocks);
  }

  function handleUpdateBlockText(id: string, newText: string) {
    const updatedBlocks = blocks.map((b) => b.id === id ? { ...b, text: newText } : b);
    setBlocks(updatedBlocks);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans antialiased overflow-hidden relative">
      
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0C]/75 border-b border-appleBorder px-6 py-4 flex justify-between items-center">
        <div>
          <span className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">{greeting}</span>
          <span className="font-serif text-xl font-semibold tracking-wide text-white flex items-center gap-1.5 mt-0.5">
            Muse <span className="text-rose-400 text-xs">♥</span>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={syncWithDrive} className="p-2 text-zinc-400 hover:text-white transition-colors relative">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            {session && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-60 space-y-5">
        
        {/* TAB THƯ VIỆN */}
        {activeTab === "library" && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-white mb-2">Thư viện của bạn</h2>
            {storiesList.length === 0 ? (
              <p className="text-xs text-zinc-500">Chưa có tác phẩm nào được lưu trữ đám mây.</p>
            ) : (
              storiesList.map((story, i) => (
                <div key={i} onClick={() => { setActiveTab("editor"); }} className="p-4 rounded-2xl bg-[#121214] border border-appleBorder cursor-pointer active:scale-98 transition-all">
                  <p className="text-white font-serif font-medium text-sm">{story.title}</p>
                  <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{story.content || "Chưa có nội dung..."}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB CÀI ĐẶT */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <h2 className="text-sm font-medium text-white">Cài đặt hệ thống</h2>
            <div className="bg-[#121214] p-5 rounded-2xl border border-appleBorder space-y-3">
              <h3 className="text-xs font-semibold text-rose-300">Sao lưu đám mây Google Drive</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">Đồng bộ tự động tác phẩm của bạn trực tiếp lên bộ nhớ đám mây riêng tư của tài khoản Google cá nhân.</p>
              {session ? (
                <div className="flex flex-col space-y-2">
                  <p className="text-xs text-zinc-400">Đã đồng bộ với: {session.user?.email}</p>
                  <button onClick={() => signOut()} className="w-full bg-zinc-800 text-white text-xs font-medium py-3 rounded-xl">Đăng xuất</button>
                </div>
              ) : (
                <button onClick={() => signIn("google")} className="w-full bg-white text-black text-xs font-semibold py-3 rounded-xl">Liên kết tài khoản Google</button>
              )}
            </div>
          </div>
        )}

        {/* TAB NHÀ SÁNG TÁC */}
        {activeTab === "editor" && (
          <div className="space-y-4">
            
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              onBlur={() => saveToDrive()}
              className="w-full bg-transparent text-xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800"
              placeholder="Đặt tên cho tác phẩm..."
            />

            {/* SYSTEM INSTRUCTIONS */}
            <div className="bg-[#121214]/80 border border-appleBorder rounded-2xl p-3.5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-widest flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Chỉ dẫn hệ thống (System Instructions)
                </span>
                <button onClick={() => setIsSystemCollapsed(!isSystemCollapsed)} className="p-1 text-zinc-500 hover:text-white transition-colors">
                  <svg className={`w-4 h-4 transform transition-transform duration-300 ${isSystemCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              
              {!isSystemCollapsed && (
                <div className="mt-2">
                  <textarea
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    placeholder="Nhập vai các nhân vật tại đây để định hướng AI phóng tác..."
                    className="w-full h-32 bg-black/40 border border-appleBorder rounded-xl p-3 text-xs text-zinc-300 placeholder-zinc-700 leading-relaxed focus:outline-none font-serif"
                  />
                </div>
              )}
            </div>

            {/* AI STUDIO CANVAS */}
            <div className="space-y-6">
              {blocks.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 italic text-xs space-y-2">
                  <p>Mạch truyện của bạn đang trống.<br />Nhập lời thoại hoặc ý tưởng thô đầu tiên của bạn vào hộp thoại dưới để bắt đầu phóng tác.</p>
                </div>
              ) : (
                blocks.map((block) => (
                  <div
                    key={block.id}
                    className={block.type === "user" ? "relative p-5 rounded-2xl border border-white/5 bg-zinc-900/10" : "relative p-5 rounded-2xl border border-appleBorder bg-[#121214]/30"}
                  >
                    <div className="flex justify-between items-center mb-2.5 text-[9px] tracking-wider text-zinc-500 uppercase">
                      <div className="flex items-center space-x-1.5">
                        <span className={block.type === "user" ? "w-1.5 h-1.5 rounded-full bg-zinc-600" : "w-1.5 h-1.5 rounded-full bg-rose-400"}></span>
                        <span>{block.type === "user" ? "Ý TƯỞNG GỐC CỦA BẠN - " + block.timestamp : "AI MUSE PHÓNG TÁC - " + block.timestamp}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteBlock(block.id)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    
                    <textarea
                      value={block.text}
                      onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                      onFocus={() => setIsEditorFocused(true)}
                      onBlur={() => setIsEditorFocused(false)}
                      className="w-full bg-transparent text-[#E5E5EA] text-[15px] leading-relaxed font-serif border-none outline-none focus:ring-0 resize-none h-auto overflow-hidden"
                      rows={Math.max(block.text.split("\n").length, 1)}
                    />
                  </div>
                ))
              )}

              {loading && (
                <div className="p-5 rounded-2xl border border-dashed border-rose-500/10 bg-[#121214]/10 flex items-center space-x-2 text-xs text-rose-300 font-mono">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                  <span>Model is writing...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Prompt Bar */}
      {activeTab === "editor" && (
        <div className="fixed bottom-24 left-0 right-0 px-6 z-40">
          <div className="max-w-md mx-auto space-y-2.5">
            
            {/* Suggestions Container */}
            <div className="bg-[#121214]/65 border border-appleBorder rounded-2xl p-2 backdrop-blur-xl">
              <div className="flex justify-between items-center px-1 mb-1 text-[9px] tracking-wider text-zinc-500 uppercase">
                <span>Gợi ý sáng tác động</span>
                <div className="flex items-center space-x-1.5">
                  <button onClick={() => handleGetSuggestions()} className="hover:text-rose-300 transition-colors">
                    {loadingSuggestions ? "Đang tạo..." : "🔄 Đổi gợi ý"}
                  </button>
                  <button 
                    onClick={() => setIsSuggestionsCollapsed(!isSuggestionsCollapsed)} 
                    className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 transform transition-transform duration-300" style={{ transform: isSuggestionsCollapsed ? "rotate(180deg)" : "rotate(0deg)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {!isSuggestionsCollapsed && (
                <div className="transition-all duration-300 mt-1">
                  <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                    {suggestions.map((sug, i) => (
                      <button 
                        key={i} 
                        onClick={() => handleGenerate(sug)} 
                        className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all hover:border-[#F43F5E]/30"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Prompt Input Area */}
            <div className="bg-[#121214]/90 border border-appleBorder rounded-2xl p-2 flex items-center space-x-2 backdrop-blur-xl">
              <input
                type="text"
                placeholder="Nhập thoại gốc hoặc ý tưởng tiếp theo..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-white placeholder-zinc-600 px-2"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleGenerate();
                  }
                }}
              />
              <button onClick={() => handleGenerate()} className="bg-rose-400 text-black p-3 rounded-full hover:bg-rose-300 transition-all active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            </div>
            {saving && <p className="text-center text-[10px] text-zinc-500">Đang lưu giữ lên Drive...</p>}
          </div>
        </div>
      )}

      {/* Navigation Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0C]/90 border-t border-appleBorder py-3 flex justify-around backdrop-blur-xl">
        <button onClick={() => setActiveTab("editor")} className={activeTab === "editor" ? "flex flex-col items-center space-y-1 text-rose-400" : "flex flex-col items-center space-y-1 text-zinc-500"}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-[10px]">Nhà sáng tác</span>
        </button>
        <button onClick={() => setActiveTab("library")} className={activeTab === "library" ? "flex flex-col items-center space-y-1 text-rose-400" : "flex flex-col items-center space-y-1 text-zinc-500"}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10
