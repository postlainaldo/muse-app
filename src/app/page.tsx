"use client";

import { useState, useEffect } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

function MuseApp() {
  const { data: session } = useSession();
  const [currentStory, setCurrentStory] = useState("");
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
  const [aiSteps, setAiSteps] = useState<string[]>([]);

  // Lịch sử khôi phục (Dùng để thu hồi đoạn văn AI viết tiếp)
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  // Gợi ý sáng tác động
  const [suggestions, setSuggestions] = useState<string[]>([
    "🌸 Đi sâu vào nội tâm nhân vật",
    "✨ Tạo ra một cuộc gặp gỡ bất ngờ",
    "🎭 Đẩy kịch tính lên cao trào"
  ]);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

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

  // 2. Tải dữ liệu từ Google Drive sau khi liên kết thành công
  useEffect(() => {
    if (session) {
      loadDataFromDrive();
    }
  }, [session]);

  // 3. TỰ ĐỘNG SAO LƯU NGẦM (Debounce Auto-Save) sau 1.5 giây dừng gõ phím (Ngăn chặn triệt để lỗi F5 mất chữ)
  useEffect(() => {
    if (!session || !currentStory) return;
    const delayDebounceFn = setTimeout(() => {
      saveToDrive(currentStory);
    }, 1500);
    return () => clearTimeout(delayDebounceFn);
  }, [currentStory, title]);

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
          setCurrentStory(data.stories[0].content || "");
          setTitle(data.stories[0].title || "Tác phẩm chưa đặt tên");
        }
      })
      .catch((err) => console.error(err));
  }

  function saveToDrive(updatedContent = currentStory) {
    if (!session) return;
    setSaving(true);
    const newStoryList = [{ title, content: updatedContent }];
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

  function handleGetSuggestions(storyText = currentStory) {
    setLoadingSuggestions(true);
    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", currentStory: storyText })
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

  // 4. Gọi Gemini viết nối tiếp
  function handleGenerate(moodType?: string) {
    if (loading) return;
    setAiSteps([]);
    setAiStatusVisible(true);
    setLoading(true);

    setAiSteps((prev) => [...prev, "⚡ Trí tuệ nhân tạo đang phân tích ngữ cảnh..."]);

    fetch("/api/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", currentStory, userPrompt, mood: moodType })
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
          // Lưu trạng thái trước khi AI viết vào lịch sử khôi phục
          setHistoryStack((prev) => [...prev, currentStory]);

          const spacer = currentStory.endsWith(" ") || data.text.startsWith(" ") ? "" : " ";
          const fullNewStory = currentStory ? `${currentStory}${spacer}${data.text}` : data.text;
          
          setCurrentStory(fullNewStory);
          setUserPrompt("");
          setAiSteps((prev) => [...prev, "✨ Sáng tác thành công."]);
          
          saveToDrive(fullNewStory);
          handleGetSuggestions(fullNewStory);

          setTimeout(() => {
            setAiStatusVisible(false);
          }, 3000);
        }
      })
      .catch((err) => {
        setAiSteps((prev) => [...prev, `❌ Lỗi: ${err.message || "Gặp sự cố."}`]);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // Thu hồi đoạn văn AI vừa mới viết tiếp (Undo)
  function handleUndoAI() {
    if (historyStack.length === 0) return;
    const previousState = historyStack[historyStack.length - 1];
    setCurrentStory(previousState);
    setHistoryStack((prev) => prev.slice(0, -1)); // Loại bỏ khỏi stack
    saveToDrive(previousState);
    handleGetSuggestions(previousState);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans antialiased overflow-hidden relative">
      
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-64 space-y-5">
        
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
            
            {/* Widget Thông báo tiến trình AI Minimalist đặt ngay đầu trang soạn thảo */}
            {aiStatusVisible && (
              <div className="bg-[#1C1C1E] border border-appleBorder rounded-2xl p-4 space-y-2 transition-all duration-300">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                    Trợ lý AI Muse
                  </span>
                  <button onClick={() => setAiStatusVisible(false)} className="text-zinc-500 hover:text-white text-xs">Đóng</button>
                </div>
                <div className="space-y-1 text-xs text-zinc-400 font-mono">
                  {aiSteps.map((step, idx) => (
                    <div key={idx}>{step}</div>
                  ))}
                </div>
              </div>
            )}

            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              onBlur={() => saveToDrive()}
              className={`w-full bg-transparent text-xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-1 pointer-events-none" : "opacity-100"}`} 
              placeholder="Đặt tên cho tác phẩm..."
            />
            
            {/* Ô soạn thảo độc nhất mượt mà */}
            <textarea
              value={currentStory}
              onChange={(e) => {
                setCurrentStory(e.target.value);
                setHistoryStack([]); // Xóa stack khôi phục khi người dùng chủ động sửa tay
              }}
              onFocus={() => setIsEditorFocused(true)}
              onBlur={() => {
                setIsEditorFocused(false);
                saveToDrive();
              }}
              className="w-full min-h-[400px] bg-transparent text-zinc-300 text-[15px] leading-relaxed font-serif border-none outline-none focus:ring-0 resize-none h-auto"
              placeholder="Ghi lại những dòng cảm xúc, ý tưởng của bạn ở đây..."
            />
          </div>
        )}
      </main>

      {/* Floating Prompt Bar & Suggestions Container (Sử dụng CSS phẳng an toàn tuyệt đối) */}
      {activeTab === "editor" && (
        <div className={`fixed bottom-24 left-0 right-0 px-6 z-40 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100"}`}>
          <div className="max-w-md mx-auto space-y-2.5">
            
            {/* Cấu trúc Suggestions phẳng tinh tế */}
            <div className="bg-[#121214]/65 border border-appleBorder rounded-2xl p-2 backdrop-blur-xl">
              <div className="flex justify-between items-center px-1 mb-1 text-[9px] tracking-wider text-zinc-500 uppercase">
                <div className="flex items-center space-x-2">
                  <span>Gợi ý sáng tác động</span>
                  {/* Nút Hoàn tác thu hồi đoạn AI viết xuất hiện thông minh khi có lịch sử */}
                  {historyStack.length > 0 && (
                    <button 
                      onClick={handleUndoAI}
                      className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-md hover:bg-rose-500/20 transition-all"
                    >
                      ↩️ Thu hồi đoạn AI viết
                    </button>
                  )}
                </div>
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
              
              <div className={`transition-all duration-300 overflow-hidden ${isSuggestionsCollapsed ? "max-h-0 opacity-0" : "max-h-24 opacity-100 mt-1"}`}>
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
            </div>
            
            {/* Prompt Input Area */}
            <div className="bg-[#121214]/90 border border-appleBorder rounded-2xl p-2 flex items-center space-x-2 backdrop-blur-xl">
              <input
                type="text"
                placeholder="Bạn muốn câu chuyện tiếp theo thế nào..."
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
      <nav className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0C]/90 border-t border-appleBorder py-3 flex justify-around backdrop-blur-xl transition-all duration-700 ${isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100"}`}>
        <button onClick={() => setActiveTab("editor")} className={`flex flex-col items-center space-y-1 ${activeTab === "editor" ? "text-rose-400" : "text-zinc-500"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-[10px]">Nhà sáng tác</span>
        </button>
        <button onClick={() => setActiveTab("library")} className={`flex flex-col items-center space-y-1 ${activeTab === "library" ? "text-rose-400" : "text-zinc-500"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
          <span className="text-[10px]">Tủ sách</span>
        </button>
        <button onClick={() => setActiveTab("settings")} className={`flex flex-col items-center space-y-1 ${activeTab === "settings" ? "text-rose-400" : "text-zinc-500"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-[10px]">Cấu hình</span>
        </button>
      </nav>
    </div>
  );
}

export default function Page() {
  return (
    <SessionProvider>
      <MuseApp />
    </SessionProvider>
  );
}
