"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

interface StoryBlock {
  id: string;
  type: "user" | "ai";
  text: string;      // Văn bản phóng tác chi tiết
  rawPrompt?: string; // Diễn biến/Ý tưởng thô bạn nhập vào
}

function MuseApp() {
  const { data: session } = useSession();
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [title, setTitle] = useState("Tác phẩm chưa đặt tên");
  const [systemInstructions, setSystemInstructions] = useState("");
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
  const [isSystemCollapsed, setIsSystemCollapsed] = useState(true);

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

  // 1. Tính toán lời chào ngọt ngào dựa theo giờ thực tế
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

  // 2. Bộ đếm thời gian tự động mờ bong bóng chat sau 3 giây nhàn rỗi
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

  // 4. Tự động lưu trữ ngầm khi có bất kỳ thay đổi nào (Mạch truyện hoặc System Instructions)
  useEffect(() => {
    if (!session || blocks.length === 0) return;
    const delayDebounceFn = setTimeout(() => {
      saveToDrive(blocks, systemInstructions);
    }, 1500);
    return () => clearTimeout(delayDebounceFn);
  }, [blocks, systemInstructions, title]);

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
          setBlocks(data.stories[0].blocks || []);
          setTitle(data.stories[0].title || "Tác phẩm chưa đặt tên");
          setSystemInstructions(data.stories[0].systemInstructions || "");
        }
      })
      .catch((err) => console.error(err));
  }

  function saveToDrive(updatedBlocks = blocks, updatedSystem = systemInstructions) {
    if (!session) return;
    setSaving(true);
    const combinedContent = updatedBlocks.map((b) => b.text).join("\n\n");
    const newStoryList = [{ 
      title, 
      content: combinedContent, 
      systemInstructions: updatedSystem, 
      blocks: updatedBlocks 
    }];
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

  // 5. Xử lý bong bóng tự động trượt nép sát lề lân cận
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

  // 6. Tạo gợi ý động dựa trên mạch truyện
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

  // 7. Gọi Gemini 3.5 Flash để biên tập và phóng tác câu chuyện
  function handleGenerate(moodType?: string) {
    if (!userPrompt.trim() && !moodType) return;
    setAiSteps([]);
    setIsStatusMinimized(false);
    setAiStatusVisible(true);
    setLoading(true);
    setIsIdle(false);

    setAiSteps((prev) => [...prev, "⚡ Master AI (Gemini 3.5) đang phân tích bối cảnh..."]);

    const promptToSend = moodType || userPrompt;

    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "generate", 
        title,
        systemInstructions,
        blocks, 
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
          const newBlock: StoryBlock = {
            id: `ai_${Date.now()}`,
            type: "ai",
            text: data.text,
            rawPrompt: promptToSend
          };
          const updatedBlocks = [...blocks, newBlock];
          setBlocks(updatedBlocks);
          setUserPrompt("");
          setAiSteps((prev) => [...prev, "✨ Phóng tác tác phẩm thành công."]);
          
          saveToDrive(updatedBlocks, systemInstructions);
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

  function handleDeleteBlock(id: string) {
    const updatedBlocks = blocks.filter((b) => b.id !== id);
    setBlocks(updatedBlocks);
    saveToDrive(updatedBlocks, systemInstructions);
    handleGetSuggestions(updatedBlocks);
  }

  // Sửa trực tiếp văn bản đã phóng tác nếu cần tinh chỉnh thủ công
  function handleUpdateBlockText(id: string, newText: string) {
    const updatedBlocks = blocks.map((b) => b.id === id ? { ...b, text: newText } : b);
    setBlocks(updatedBlocks);
    saveToDrive(updatedBlocks, systemInstructions);
  }

  // HÀM KẾT XUẤT CHO TỪNG TAB (FLAT JSX PATTERN)
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

    // MẶC ĐỊNH RENDER EDITOR CHUYÊN BIỆT CHO CO-WRITING
    return (
      <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
        
        {/* Tiêu đề truyện */}
        <input 
          type="text" 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          onBlur={() => saveToDrive()}
          className={`w-full bg-transparent text-xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-1 pointer-events-none" : "opacity-100"}`} 
          placeholder="Đặt tên cho tác phẩm..."
        />

        {/* SYSTEM INSTRUCTIONS: Hộp chỉ dẫn bối cảnh/nhân vật kéo gập phong cách Apple */}
        <div className={`bg-[#121214]/80 border border-appleBorder rounded-2xl p-3.5 transition-all duration-700 ${isEditorFocused ? "opacity-5 pointer-events-none" : "opacity-100"}`}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-widest flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Cấu hình nhân vật & bối cảnh (System Instructions)
            </span>
            <button 
              onClick={() => setIsSystemCollapsed(!isSystemCollapsed)} 
              className="p-1 text-zinc-500 hover:text-white transition-colors"
            >
              <svg className={`w-4 h-4 transform transition-transform duration-300 ${isSystemCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          <div className={`transition-all duration-500 overflow-hidden ${isSystemCollapsed ? "max-h-0 opacity-0" : "max-h-60 opacity-100 mt-2"}`}>
            <textarea
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              placeholder="Ví dụ: Bối cảnh quán ốc Quận 8 lúc 8h tối. Thành An (con nhà giàu trọc phú, mỏ nhọn dẩu ra, đi xe G63, tính cách nghênh ngang tự đắc). Tuyền (chị đẹp má lúm mỉm chi dịu dàng)..."
              className="w-full h-32 bg-black/40 border border-appleBorder rounded-xl p-3 text-xs text-zinc-300 placeholder-zinc-700 leading-relaxed focus:outline-none font-serif"
            />
          </div>
        </div>

        {/* DIỄN BIẾN TRUYỆN: Hiển thị mạch truyện phóng tác hoàn mỹ từng phần */}
        <div className="space-y-5">
          {blocks.length === 0 ? (
            <div className="text-center py-20 text-zinc-600 italic text-xs space-y-2">
              <svg className="w-8 h-8 mx-auto text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p>Chưa có diễn biến truyện.<br />Nhập ý tưởng/thoại đầu tiên của bạn vào hộp thoại dưới để bắt đầu.</p>
            </div>
          ) : (
            blocks.map((block) => (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative group p-5 rounded-2xl border border-appleBorder bg-[#121214]/20 hover:border-zinc-800 transition-all duration-300"
              >
                {/* Header khối truyện */}
                <div className="flex justify-between items-center mb-2.5 text-[10px] tracking-wider text-zinc-500 uppercase">
                  <div className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    <span>AI Muse Phóng tác</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteBlock(block.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-rose-400 transition-all duration-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                
                {/* Đoạn truyện hoàn mỹ phóng tác */}
                <textarea
                  value={block.text}
                  onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                  onFocus={() => setIsEditorFocused(true)}
                  onBlur={() => setIsEditorFocused(false)}
                  className="w-full bg-transparent text-[#E5E5EA] text-[15px] leading-relaxed font-serif border-none outline-none focus:ring-0 resize-none h-auto overflow-hidden"
                  rows={Math.max(block.text.split("\n").length, 1)}
                />

                {/* Ý tưởng thô/Lời thoại gốc bạn đã nhập */}
                {block.rawPrompt && (
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center space-x-2 text-[10px] text-zinc-600 italic">
                    <span>💡 Ý tưởng gốc: "{block.rawPrompt}"</span>
                  </div>
                )}
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

  // HÀM RENDER CHO BONG BÓNG CHAT MESSENGER (CHỈNH SỬA MŨI TÊN COLLAPSE HƯỚNG LÊN TRÊN CHUẨN DESIGN)
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
          <svg className="w-4 h-4 text-rose-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            {/* Nút thu nhỏ mũi tên hướng lên trên (collapse) đúng yêu cầu */}
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
            {/* Nút đóng hoàn toàn */}
            <button 
              onClick={(e
