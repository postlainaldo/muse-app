"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

function MuseApp() {
  const { data: session } = useSession();
  const [currentStory, setCurrentStory] = useState("");
  const [title, setTitle] = useState("Truyện chưa đặt tên");
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("editor"); // editor | library
  const [storiesList, setStoriesList] = useState<any[]>([]);

  // Tải dữ liệu từ Google Drive của cá nhân khi đăng nhập thành công
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
        setTitle(data.stories[0].title || "Truyện chưa đặt tên");
      }
    } catch (err) {
      console.error("Lỗi đồng bộ tải dữ liệu:", err);
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
      console.error("Lỗi lưu trữ:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!userPrompt || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", currentStory, userPrompt })
      });
      const data = await res.json();
      if (data.text) {
        const fullNewStory = currentStory ? `${currentStory}\n\n${data.text}` : data.text;
        setCurrentStory(fullNewStory);
        setUserPrompt("");
        saveToDrive(fullNewStory); // Tự động sao lưu lên Drive ngay sau khi sinh câu
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-200 flex flex-col font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/70 border-b border-appleBorder px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-white">Muse</h1>
          <p className="text-[10px] text-neutral-500">Giữ mạch văn của bạn trôi chảy</p>
        </div>
        <div>
          {session ? (
            <button onClick={() => signOut()} className="text-xs text-neutral-400 border border-appleBorder rounded-full px-3 py-1.5 active:scale-95 transition-all">
              Đăng xuất
            </button>
          ) : (
            <button onClick={() => signIn("google")} className="text-xs bg-white text-black font-semibold rounded-full px-4 py-1.5 active:scale-95 transition-all">
              Google Sync
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-36">
        <AnimatePresence mode="wait">
          {activeTab === "editor" ? (
            <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <input 
                type="text" 
                value={title} 
                onChange={(e) => { setTitle(e.target.value); }} 
                onBlur={() => saveToDrive()}
                className="w-full bg-transparent text-2xl font-semibold text-white focus:outline-none placeholder-neutral-700" 
                placeholder="Tiêu đề câu chuyện..."
              />
              <textarea
                className="w-full min-h-[400px] bg-transparent text-neutral-300 text-[16px] leading-relaxed focus:outline-none resize-none placeholder-neutral-800"
                placeholder="Nghĩ một ý tưởng, hoặc bắt đầu một vài từ đầu tiên..."
                value={currentStory}
                onChange={(e) => setCurrentStory(e.target.value)}
                onBlur={() => saveToDrive()}
              />
            </motion.div>
          ) : (
            <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="text-lg font-medium text-white mb-2">Thư viện của bạn</h2>
              {storiesList.length === 0 ? (
                <p className="text-sm text-neutral-500">Chưa có tác phẩm nào được đồng bộ.</p>
              ) : (
                storiesList.map((story, i) => (
                  <div key={i} onClick={() => { setActiveTab("editor"); }} className="p-4 rounded-xl bg-darkAccent border border-appleBorder cursor-pointer active:scale-98 transition-all">
                    <p className="text-white font-medium text-sm">{story.title}</p>
                    <p className="text-xs text-neutral-500 line-clamp-2 mt-1">{story.content || "Chưa có nội dung..."}</p>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Prompt Bar (Editor mode) */}
      {activeTab === "editor" && (
        <div className="fixed bottom-24 left-0 right-0 px-6 z-40">
          <div className="bg-[#121212]/90 border border-appleBorder rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex items-center space-x-2">
            <input
              type="text"
              placeholder="Ý tưởng tiếp theo là gì?"
              className="flex-1 bg-transparent text-sm focus:outline-none text-white placeholder-neutral-600 px-2"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              disabled={loading}
            />
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-neutral-800 text-white rounded-xl p-2.5 hover:bg-neutral-700 disabled:opacity-30 active:scale-95 transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </button>
          </div>
          {saving && <p className="text-center text-[10px] text-neutral-500 mt-2">Đang sao lưu lên Google Drive...</p>}
        </div>
      )}

      {/* Navigation Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-appleBorder py-3 flex justify-around backdrop-blur-md">
        <button onClick={() => setActiveTab("editor")} className={`flex flex-col items-center space-y-1 ${activeTab === "editor" ? "text-white" : "text-neutral-500"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-[10px]">Nhà sáng tác</span>
        </button>
        <button onClick={() => setActiveTab("library")} className={`flex flex-col items-center space-y-1 ${activeTab === "library" ? "text-white" : "text-neutral-500"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
          <span className="text-[10px]">Tủ sách</span>
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
