"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  
  // Custom states từ bản cũ
  const [greeting, setGreeting] = useState("Chào ngày mới");
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [aiOverlay, setAiOverlay] = useState(false);
  const [aiSteps, setAiSteps] = useState<string[]>([]);

  // 1. Tính toán lời chào ngọt ngào dựa theo khung giờ thực tế
  useEffect(() => {
    const hr = new Date().getHours();
    const name = "XIENGG XIENGG";
    if (hr >= 4 && hr < 11) setGreeting(`Một buổi sáng dịu lành, ${name}`);
    else if (hr >= 11 && hr < 14) setGreeting(`Bắt đầu buổi trưa thôi, ${name}`);
    else if (hr >= 14 && hr < 18) setGreeting(`Một chiều nhẹ nhàng nhé, ${name}`);
    else setGreeting(`Buổi tối thật bình yên, ${name}`);
  }, []);

  // 2. Đồng bộ Google Drive
  useEffect(() => {
    if (session) {
      loadDataFromDrive();
    }
  }, [session]);

  const loadDataFromDrive = async () => {
    try {
      const res = await fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load" })
      });
      const data = await res.json();
      if (data.stories && data.stories.length > 0) {
        setStoriesList(data.stories);
        setCurrentStory(data.stories[0].content || "");
        setTitle(data.stories[0].title || "Tác phẩm chưa đặt tên");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveToDrive = async (updatedContent = currentStory) => {
    if (!session) return;
    setSaving(true);
    try {
      const newStoryList = [{ title, content: updatedContent }];
      setStoriesList(newStoryList);
      await fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", stories: newStoryList })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // 3. Quy trình gọi AI với hộp thoại hiển thị tiến trình chi tiết
  const handleGenerate = async (moodType?: string) => {
    setAiSteps([]);
    setAiOverlay(true);
    setLoading(true);

    try {
      // Bước 1: Master khởi động
      setAiSteps((prev) => [...prev, "⚡ Master AI (Gemini 1.5) đang phân tích ngữ cảnh..."]);
      await new Promise((r) => setTimeout(r, 600));

      const res = await fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", currentStory, userPrompt, mood: moodType })
      });
      const data = await res.json();

      if (data.selectedWorkers) {
        // Bước 2: Chọn Worker
        setAiSteps((prev) => [
          ...prev,
          `🎯 Đã chọn phối hợp: ${data.selectedWorkers[0]} & ${data.selectedWorkers[1]}`
        ]);
        await new Promise((r) => setTimeout(r, 800));
        
        // Bước 3: Đồng xử lý và gọt giũa
        setAiSteps((prev) => [...prev, "✍️ Đang tích hợp, biên tập và trau chuốt câu chữ..."]);
        await new Promise((r) => setTimeout(r, 600));
      }

      if (data.text) {
        const fullNewStory = currentStory ? `${currentStory}\n\n${data.text}` : data.text;
        setCurrentStory(fullNewStory);
        setUserPrompt("");
        setAiSteps((prev) => [...prev, "✨ Hoàn tất! Đoạn văn đã được viết tiếp mượt mà."]);
        saveToDrive(fullNewStory);
      } else {
        setAiSteps((prev) => [...prev, "❌ Gặp lỗi không mong muốn trong quá trình xử lý."]);
      }
    } catch (err) {
      setAiSteps((prev) => [...prev, "❌ Lỗi kết nối API. Vui lòng kiểm tra lại cấu hình."]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans antialiased">
      
      {/* 4. Top Header tích hợp Focus Mode làm mờ mượt mà */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0C]/75 border-b border-appleBorder px-6 py-4 flex justify-between items-center transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-2 pointer-events-none" : "opacity-100"}`}>
        <div>
          <span className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">{greeting}</span>
          <span className="font-serif text-xl font-semibold tracking-wide text-white flex items-center gap-1.5 mt-0.5">
            Muse <span className="text-rose-400 text-xs">♥</span>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => syncWithDrive()} className="p-2 text-zinc-400 hover:text-white transition-colors relative">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            {session && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>}
          </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-40">
        <AnimatePresence mode="wait">
          {activeTab === "editor" ? (
            <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                onBlur={() => saveToDrive()}
                className={`w-full bg-transparent text-2xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform -translate-y-1 pointer-events-none" : "opacity-100"}`} 
                placeholder="Đặt tên cho tác phẩm..."
              />
              <textarea
                className="w-full min-h-[400px] bg-transparent text-zinc-300 text-[15px] leading-relaxed focus:outline-none resize-none placeholder-zinc-700"
                placeholder="Ghi lại những dòng cảm xúc, ý tưởng của bạn ở đây..."
                value={currentStory}
                onChange={(e) => setCurrentStory(e.target.value)}
                onFocus={() => setIsEditorFocused(true)}
                onBlur={() => {
                  setIsEditorFocused(false);
                  saveToDrive();
                }}
              />
            </motion.div>
          ) : activeTab === "library" ? (
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
          ) : (
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
          )}
        </AnimatePresence>
      </main>

      {/* Floating Prompt Bar & Quick Moods (Focus Mode Compatible) */}
      {activeTab === "editor" && (
        <div className={`fixed bottom-24 left-0 right-0 px-6 z-40 transition-all duration-700 ${isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100"}`}>
          <div className="max-w-md mx-auto space-y-3">
            {/* Quick Moods Scroll Container */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button onClick={() => handleGenerate("lãng mạn")} className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all">🌸 Thêm lãng mạn</button>
              <button onClick={() => handleGenerate("tự nhiên")} className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all">✨ Viết tiếp tự nhiên</button>
              <button onClick={() => handleGenerate("nội tâm")} className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all">💭 Đậm chất nội tâm</button>
              <button onClick={() => handleGenerate("kịch tính")} className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full active:scale-95 transition-all">🎭 Tạo kịch tính</button>
            </div>
            
            {/* Prompt Input Area */}
            <div className="bg-[#121214]/90 border border-appleBorder rounded-2xl p-2 flex items-center space-x-2 backdrop-blur-xl">
              <input
                type="text"
                placeholder="Bạn muốn câu chuyện tiếp theo thế nào..."
                className="flex-1 bg-transparent text-xs focus:outline-none text-white placeholder-zinc-600 px-2"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
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

      {/* 5. Bottom Tab Bar với hiệu ứng Focus-active mờ đi */}
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

      {/* 6. AI Status Overlay (Tái cấu trúc và giải quyết triệt để lỗi khuất màn hình di động) */}
      {aiOverlay && (
        <div className="fixed inset-0 flex items-center justify-center p-6 z-50 backdrop-blur-md bg-black/60">
          <div className="bg-[#1C1C1E] border border-appleBorder rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex justify-between items-center pb-2 border-b border-appleBorder">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                Trợ lý AI Muse
              </span>
              <button onClick={() => setAiOverlay(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 text-[11px] text-zinc-400 font-mono py-2 leading-relaxed">
              {aiSteps.map((step, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
                  {step}
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => setAiOverlay(false)}
              disabled={loading}
              className="w-full bg-[#2C2C2E] disabled:opacity-30 text-zinc-300 text-xs font-medium py-3 rounded-xl active:scale-95 transition-all"
            >
              Đóng hộp thoại
            </button>
          </div>
        </div>
      )}
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
