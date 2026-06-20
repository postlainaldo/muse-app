"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

interface StoryBlock {
  id: string;
  type: "user" | "ai";
  text: string;
}

function MuseApp() {
  const { data: session } = useSession();
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [title, setTitle] = useState("Tác phẩm chưa đặt tên");
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("editor"); // editor | library | settings
  const [storiesList, setStoriesList] = useState<any[]>([]);
  
  // Trạng thái giao diện
  const [greeting, setGreeting] = useState("Chào ngày mới");
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [aiStatusVisible, setAiStatusVisible] = useState(false);
  const [isStatusMinimized, setIsStatusMinimized] = useState(true);
  const [aiSteps, setAiSteps] = useState<string[]>([]);
  const [isIdle, setIsIdle] = useState(false);
  const [bubbleX, setBubbleX] = useState<number | string>("16px");

  // Gợi ý sáng tác động
  const [suggestions, setSuggestions] = useState<string[]>([
    "🌸 Đi sâu vào nội tâm nhân vật",
    "✨ Tạo ra một cuộc gặp gỡ bất ngờ",
    "🎭 Đẩy kịch tính lên cao trào"
  ]);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const bubbleControls = useAnimation();
  const dragConstraintsRef = useRef<HTMLDivElement>(null);

  // 1. Tính toán lời chào ngọt ngào
  useEffect(() => {
    const hr = new Date().getHours();
    const name = "XIENGG XIENGG";
    if (hr >= 4 && hr < 11) {
      setGreeting(`Một buổi sáng dịu lành, ${name}`);
    } else if (hr >= 11 && hr < 14) {
      setGreeting(`Bắt đầu buổi trưa thôi, ${name}`);
    } else if (hr >= 14 && hr < 18) {
      setGreeting(`Một chiều nhẹ nhàng nhé, ${name}`);
    } else {
      setGreeting(`Buổi tối thật bình yên, ${name}`);
    }
  }, []);

  // 2. Tự động mờ bong bóng chat sau 3 giây nhàn rỗi
  useEffect(() => {
    let timer: any;
    if (aiStatusVisible && !loading) {
      timer = setTimeout(() => {
        setIsIdle(true);
      }, 3000);
    } else {
      setIsIdle(false);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [aiStatusVisible, loading]);

  // 3. Tải dữ liệu từ Google Drive sau khi liên kết thành công
  useEffect(() => {
    if (session) {
      loadDataFromDrive();
    }
  }, [session]);

  function loadDataFromDrive() {
    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load" })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.stories && data.stories.length > 0) {
          setStoriesList(data.stories);
          setBlocks(data.stories[0].blocks || [{ id: "b1", type: "user", text: data.stories[0].content || "" }]);
          setTitle(data.stories[0].title || "Tác phẩm chưa đặt tên");
        }
      })
      .catch((err) => console.error(err));
  }

  function saveToDrive(updatedBlocks = blocks) {
    if (!session) return;
    setSaving(true);
    const combinedContent = updatedBlocks.map((b) => b.text).join("\n\n");
    const newStoryList = [{ title, content: combinedContent, blocks: updatedBlocks }];
    setStoriesList(newStoryList);

    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", stories: newStoryList })
    })
      .catch((err) => console.error(err))
      .finally(() => setSaving(false));
  }

  function syncWithDrive() {
    if (!session) {
      signIn("google");
      return;
    }
    saveToDrive();
  }

  function handleDragEnd(event: any, info: any) {
    setIsIdle(false);
    const screenWidth = typeof window !== "undefined" ? window.innerWidth : 375;
    const finalX = info.point.x;
    
    if (finalX < screenWidth / 2) {
      setBubbleX("16px");
      bubbleControls.start({ x: 16, transition: { type: "spring", stiffness: 300, damping: 20 } });
    } else {
      setBubbleX(`${screenWidth - 76}px`);
      bubbleControls.start({ x: screenWidth - 76, transition: { type: "spring", stiffness: 300, damping: 20 } });
    }
  }

  function triggerBubbleActive() {
    setIsIdle(false);
  }

  function handleGetSuggestions(currentBlocks = blocks) {
    setLoadingSuggestions(true);
    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", blocks: currentBlocks })
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
    if (loading) return;
    setAiSteps([]);
    setIsStatusMinimized(false);
    setAiStatusVisible(true);
    setLoading(true);
    setIsIdle(false);

    setAiSteps((prev) => [...prev, "⚡ Trí tuệ nhân tạo đang phân tích ngữ cảnh..."]);

    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", blocks, userPrompt, mood: moodType })
    })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error("Lỗi máy chủ khi xử lý AI.");
        }
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.text) {
          const newBlock: StoryBlock = {
            id: `ai_${Date.now()}`,
            type: "ai",
            text: data.text
          };
          const updatedBlocks = [...blocks, newBlock];
          setBlocks(updatedBlocks);
          setUserPrompt("");
          setAiSteps((prev) => [...prev, "✨ Đăng tải thành công."]);
          
          saveToDrive(updatedBlocks);
          handleGetSuggestions(updatedBlocks);

          setTimeout(() => {
            setIsStatusMinimized(true);
          }, 2000);
        }
      })
      .catch((err) => {
        setAiSteps((prev) => [...prev, `❌ Lỗi: ${err.message || "Gặp sự cố."}`]);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleAddUserBlock() {
    if (!userPrompt.trim()) return;
    const newBlock: StoryBlock = {
      id: `user_${Date.now()}`,
      type: "user",
      text: userPrompt
    };
    const updatedBlocks = [...blocks, newBlock];
    setBlocks(updatedBlocks);
    setUserPrompt("");
    saveToDrive(updatedBlocks);
    handleGetSuggestions(updatedBlocks);
  }

  function handleDeleteBlock(id: string) {
    const updatedBlocks = blocks.filter((b) => b.id !== id);
    setBlocks(updatedBlocks);
    saveToDrive(updatedBlocks);
    handleGetSuggestions(updatedBlocks);
  }

  function handleUpdateBlockText(id: string, newText: string) {
    const updatedBlocks = blocks.map((b) => b.id === id ? { ...b, text: newText } : b);
    setBlocks(updatedBlocks);
    saveToDrive(updatedBlocks);
  }

  // HÀM RENDER ĐỘC LẬP CHO TỪNG TAB (Giải quyết triệt để lỗi biên dịch cấu trúc ba ngôi phức tạp)
  function renderTabContent() {
    if (activeTab === "library") {
      return (
        <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
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
        </motion.div>
      );
    }

    if (activeTab === "settings") {
      return (
        <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
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
        </motion.div>
      );
    }

    // Mặc định trả về Editor Tab
    return (
      <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
        <input 
          type="text" 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          onBlur={() => saveToDrive()}
          className={`w-full bg-transparent text-xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-1 pointer-events-none" : "opacity-100"}`} 
          placeholder="Đặt tên cho tác phẩm..."
        />
        
        <div className="space-y-4">
          {blocks.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">Nhập ý tưởng của bạn ở bên dưới để bắt đầu câu chuyện...</p>
          ) : (
            blocks.map((block) => (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative group p-4 rounded-2xl border transition-all duration-300 ${
                  block.type === "user" 
                    ? "bg-transparent border-appleBorder" 
                    : "bg-[#121214]/60 border-[#F43F5E]/10"
                }`}
              >
                <div className="flex justify-between items-center mb-1.5 text-[10px] tracking-wider text-zinc-500 uppercase">
                  <span>{block.type === "user" ? "✍️ Bạn viết" : "🌸 AI Muse viết"}</span>
                  <button 
                    onClick={() => handleDeleteBlock(block.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-rose-400 transition-all duration-300"
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
                  className="w-full bg-transparent text-zinc-300 text-[14.5px] leading-relaxed font-serif border-none outline-none focus:ring-0 resize-none h-auto min-h-[40px] overflow-hidden"
                  rows={Math.max(block.text.split("\n").length, 1)}
                />
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    );
  }

  // HÀM RENDER CHO GỢI Ý ĐỘNG
  function renderSuggestions() {
    if (isSuggestionsCollapsed) return null;
    return (
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar"
      >
        {suggestions.map((sug, i) => (
          <button 
            key={i} 
            onClick={() => handleGenerate(sug)} 
            className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all hover:border-[#F43F5E]/30"
          >
            {sug}
          </button>
        ))}
      </motion.div>
    );
  }

  // HÀM RENDER CHO BONG BÓNG CHAT MESSENGER
  function renderAIBubble() {
    if (isStatusMinimized) {
      return (
        <div 
          onClick={() => {
            triggerBubbleActive();
            setIsStatusMinimized(false);
          }} 
          className="flex items-center justify-center w-full h-full cursor-pointer"
        >
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <svg className="w-4 h-4 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
      );
    }

    return (
      <div className="space-y-3 pointer-events-auto">
        <div className="flex justify-between items-center pb-2 border-b border-appleBorder">
          <span className="text-[11px] font-semibold text-rose-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
            Trợ lý AI Muse
          </span>
          <div className="flex items-center space-x-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsStatusMinimized(true);
              }} 
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setAiStatusVisible(false);
              }} 
              className="p-1 text-zinc-500 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="space-y-1.5 text-[10px] text-zinc-400 font-mono max-h-[120px] overflow-y-auto leading-relaxed pr-1 no-scrollbar">
          {aiSteps.map((step, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
              {step}
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // KHỐI LỆNH TRẢ VỀ SIÊU PHẲNG (FLAT) - ĐẢM BẢO KHÔNG CÒN LỖI BIÊN DỊCH
  return (
    <div ref={dragConstraintsRef} className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans antialiased overflow-hidden relative">
      
      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0C]/75 border-b border-appleBorder px-6 py-4 flex justify-between items-center transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-2 pointer-events-none" : "opacity-100"}`}>
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

      {/* Main Content (Chạy kết xuất Tab phẳng) */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-52 space-y-5">
        <AnimatePresence mode="wait">
          {renderTabContent()}
        </AnimatePresence>
      </main>

      {/* Floating Prompt Bar & Dynamic Suggestions (Chạy kết xuất phẳng) */}
      {activeTab === "editor" && (
        <div className={`fixed bottom-24 left-0 right-0 px-6 z-40 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100"}`}>
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
                    <svg className={`w-3.5 h-3.5 transform transition-transform duration-300 ${isSuggestionsCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <AnimatePresence>
                {renderSuggestions()}
              </AnimatePresence>
            </div>
            
            {/* Prompt Input Area */}
            <div className="bg-[#121214]/90 border border-appleBorder rounded-2xl p-2 flex items-center space-x-2 backdrop-blur-xl">
              <input
                type="text"
                placeholder="Bạn muốn câu chuyện tiếp theo thế nào..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-white placeholder-zinc-600 px-2"
              
