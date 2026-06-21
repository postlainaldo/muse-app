"use client";

import { useState, useEffect } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

interface StoryBlock {
  id: string;
  type: "user" | "ai";
  text: string;
  timestamp: string;
}

interface Story {
  id: string;
  title: string;
  systemInstructions: string;
  blocks: StoryBlock[];
  updatedAt: string;
}

export default function Page() {
  return (
    <SessionProvider>
      <MuseApp />
    </SessionProvider>
  );
}

function MuseApp() {
  const { data: session } = useSession();
  const [storiesList, setStoriesList] = useState([] as any[]); // Danh sách tất cả truyện tải từ Drive
  const [activeStoryId, setActiveStoryId] = useState("" as any); // ID của truyện đang viết

  // Các State xử lý cục bộ cho truyện đang mở
  const [blocks, setBlocks] = useState([] as StoryBlock[]);
  const [title, setTitle] = useState("Truyện chưa đặt tên");
  const [systemInstructions, setSystemInstructions] = useState("");
  
  // Trạng thái giao diện
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("editor"); 
  const [greeting, setGreeting] = useState("Chào ngày mới");
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isSystemCollapsed, setIsSystemCollapsed] = useState(true);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);

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

  // 2. Tải toàn bộ danh sách truyện từ Google Drive sau khi liên kết thành công
  useEffect(() => {
    if (session) {
      loadDataFromDrive();
    }
  }, [session]);

  // 3. Tự động lưu trữ ngầm lên Google Drive khi có thay đổi (Nội dung, tiêu đề, hoặc bối cảnh nhân vật)
  useEffect(() => {
    if (!session || !isInitialLoaded || !activeStoryId) return;
    
    const delayDebounceFn = setTimeout(() => {
      setSaving(true);
      
      // Cập nhật thông tin truyện đang viết vào danh sách tổng
      const updatedStories = storiesList.map((story) => {
        if (story.id === activeStoryId) {
          const combinedContent = blocks.map((b) => b.text).join("\n\n");
          return {
            ...story,
            title,
            content: combinedContent,
            systemInstructions,
            blocks,
            updatedAt: new Date().toISOString()
          };
        }
        return story;
      });

      setStoriesList(updatedStories);

      fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", stories: updatedStories })
      })
        .catch((err) => console.error(err))
        .finally(() => setSaving(false));
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [blocks, systemInstructions, title, activeStoryId, session, isInitialLoaded]);

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
          // Mặc định nạp câu truyện đầu tiên trong danh sách lên màn hình
          const firstStory = data.stories[0];
          setBlocks(firstStory.blocks || []);
          setTitle(storyTitle(firstStory));
          setSystemInstructions(firstStory.systemInstructions || "");
          setActiveStoryId(firstStory.id); // Đã loại bỏ dòng gọi setBubbleX bị lỗi ở đây
        } else {
          // Nếu Drive trống, tự khởi tạo tác phẩm đầu tiên
          const defaultId = "story_" + Date.now();
          const defaultStory = {
            id: defaultId,
            title: "Tác phẩm đầu tiên",
            systemInstructions: "",
            blocks: [],
            updatedAt: new Date().toISOString()
          };
          setStoriesList([defaultStory]);
          setActiveStoryId(defaultId);
          setTitle("Tác phẩm đầu tiên");
          setBlocks([]);
          setSystemInstructions("");
        }
        setIsInitialLoaded(true);
      })
      .catch((err) => {
        console.error(err);
        setIsInitialLoaded(true);
      });
  }

  function storyTitle(story: any) {
    return story.title || "Tác phẩm chưa đặt tên";
  }

  // TẠO TÁC PHẨM MỚI (Tủ sách Multi-Story)
  function handleCreateNewStory() {
    const newStoryId = "story_" + Date.now();
    const newStory = {
      id: newStoryId,
      title: "Tác phẩm mới",
      systemInstructions: "",
      blocks: [],
      updatedAt: new Date().toISOString()
    };

    const updatedStories = [newStory, ...storiesList];
    setStoriesList(updatedStories);
    setActiveStoryId(newStoryId);

    // Reset lại toàn bộ Editor sang truyện mới trống
    setTitle("Tác phẩm mới");
    setSystemInstructions("");
    setBlocks([]);

    // Chuyển sang tab soạn thảo ngay lập tức
    setActiveTab("editor");

    // Tiến hành lưu lên Google Drive ngay để giữ tệp
    if (session) {
      setSaving(true);
      fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", stories: updatedStories })
      })
        .catch((err) => console.error(err))
        .finally(() => setSaving(false));
    }
  }

  // Chọn tác phẩm từ thư viện để chuyển đổi qua lại
  function handleSelectStory(story: any) {
    setActiveStoryId(story.id);
    setTitle(storyTitle(story));
    setSystemInstructions(story.systemInstructions || "");
    setBlocks(story.blocks || []);
    setActiveTab("editor");
  }

  // Xóa hoàn toàn một tác phẩm khỏi Google Drive
  function handleDeleteStory(storyId: any, event: any) {
    event.stopPropagation(); // Ngăn sự kiện click vào thẻ truyện
    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa hoàn toàn tác phẩm này không?");
    if (!confirmDelete) return;

    const updatedStories = storiesList.filter((s) => s.id !== storyId);
    setStoriesList(updatedStories);

    // Nếu xóa đúng truyện đang mở, chuyển sang truyện khác hoặc reset rỗng
    if (activeStoryId === storyId) {
      if (updatedStories.length > 0) {
        const nextStory = updatedStories[0];
        setActiveStoryId(nextStory.id);
        setTitle(storyTitle(nextStory));
        setSystemInstructions(nextStory.systemInstructions || "");
        setBlocks(nextStory.blocks || []);
      } else {
        setActiveStoryId("");
        setTitle("Chưa có tác phẩm");
        setSystemInstructions("");
        setBlocks([]);
      }
    }
    saveToDrive(updatedStories, systemInstructions);
  }

  function handleUpdateBlockText(id: any, newText: any) {
    const updatedBlocks = blocks.map((b) => b.id === id ? { ...b, text: newText } : b);
    setBlocks(updatedBlocks);
  }

  // Khai báo trước hằng số class phẳng bảo vệ tuyệt đối trình biên dịch
  const headerClass = isEditorFocused
    ? "sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0C]/75 border-b border-appleBorder px-6 py-4 flex justify-between items-center transition-all duration-700 opacity-5 transform -translate-y-2 pointer-events-none"
    : "sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0C]/75 border-b border-appleBorder px-6 py-4 flex justify-between items-center transition-all duration-700 opacity-100";

  const titleInputClass = "w-full bg-transparent text-xl font-semibold font-serif text-white focus:outline-none placeholder-zinc-800 transition-all duration-700 " + (isEditorFocused ? "opacity-5 transform -translate-y-1 pointer-events-none" : "opacity-100");

  const systemInstructionsPanelClass = "bg-[#121214]/80 border border-appleBorder rounded-2xl p-3.5 transition-all duration-700 " + (isEditorFocused ? "opacity-5 pointer-events-none" : "opacity-100");

  const suggestionsContainerClass = "transition-all duration-300 overflow-hidden " + (isSuggestionsCollapsed ? "max-h-0 opacity-0" : "max-h-24 opacity-100 mt-1");

  const promptBarClass = "fixed bottom-24 left-0 right-0 px-6 z-40 transition-all duration-700 " + (isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100");

  const navBarClass = "fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0C]/90 border-t border-appleBorder py-3 flex justify-around backdrop-blur-xl transition-all duration-700 " + (isEditorFocused ? "opacity-5 transform translate-y-2 pointer-events-none" : "opacity-100");

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col font-sans antialiased overflow-hidden relative">
      
      {/* Header */}
      <header className={headerClass}>
        <div>
          <span className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">{greeting}</span>
          <span className="font-serif text-xl font-semibold tracking-wide text-white flex items-center gap-1.5 mt-0.5">
            Muse <span className="text-rose-400 text-xs">♥</span>
          </span>
        </div>
        <button onClick={syncWithDrive} className="p-2 text-zinc-400 hover:text-white transition-colors">
          ☁️
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-60 space-y-5">
        
        {/* TAB THƯ VIỆN (MULTIPLE STORIES SUPPORT) */}
        {activeTab === "library" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-medium text-white">Thư viện tác phẩm</h2>
              <button 
                onClick={handleCreateNewStory}
                className="text-xs bg-rose-500/15 border border-rose-500/20 text-rose-300 rounded-full px-4 py-1.5 active:scale-95 transition-all"
              >
                ➕ Tạo tác phẩm mới
              </button>
            </div>
            {storiesList.length === 0 ? (
              <p className="text-xs text-zinc-500">Chưa có tác phẩm nào được lưu trữ đám mây.</p>
            ) : (
              storiesList.map((story) => (
                <div 
                  key={story.id} 
                  onClick={() => handleSelectStory(story)} 
                  className="p-4 rounded-2xl bg-[#121214] border border-appleBorder cursor-pointer active:scale-98 transition-all flex justify-between items-center"
                >
                  <div className="space-y-1">
                    <p className="text-white font-serif font-medium text-sm">{storyTitle(story)}</p>
                    <p className="text-[10px] text-zinc-500">Cập nhật: {new Date(story.updatedAt).toLocaleDateString("vi-VN")} lúc {new Date(story.updatedAt).toLocaleTimeString("vi-VN", {hour: "2-digit", minute:"2-digit"})}</p>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteStory(story.id, e)}
                    className="p-2 text-zinc-600 hover:text-rose-400 transition-colors"
                  >
                    🗑️
                  </button>
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
              className={titleInputClass}
              placeholder="Đặt tên cho tác phẩm..."
            />

            {/* SYSTEM INSTRUCTIONS */}
            <div className={systemInstructionsPanelClass}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-widest flex items-center gap-1.5">
                  ⚙️ Chỉ dẫn hệ thống (System Instructions)
                </span>
                <button onClick={() => setIsSystemCollapsed(!isSystemCollapsed)} className="p-1 text-zinc-500 hover:text-white transition-colors">
                  {isSystemCollapsed ? "▼" : "▲"}
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
                      <span>{block.type === "user" ? "Ý TƯỞNG GỐC - " + block.timestamp : "AI MUSE PHÓNG TÁC - " + block.timestamp}</span>
                      <button 
                        onClick={() => handleDeleteBlock(block.id)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    <textarea
                      value={block.text}
                      onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                      onFocus={() => setIsEditorFocused(true)}
                      onBlur={() => {
                        setIsEditorFocused(false);
                        saveToDrive();
                      }}
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
        <div className={promptBarClass}>
          <div className="max-w-md mx-auto space-y-2.5">
            
            {/* Suggestions Container */}
            <div className="bg-[#121214]/65 border border-appleBorder rounded-2xl p-2 backdrop-blur-xl">
              <div className="flex justify-between items-center px-1 mb-1 text-[9px] tracking-wider text-zinc-500 uppercase">
                <span>Gợi ý sáng tác động</span>
                <div className="flex items-center space-x-1.5">
                  <button onClick={() => handleGetSuggestions()} className="hover:text-rose-300 transition-colors">
                    🔄 Đổi
                  </button>
                  <button 
                    onClick={() => setIsSuggestionsCollapsed(!isSuggestionsCollapsed)} 
                    className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    {isSuggestionsCollapsed ? "▲" : "▼"}
                  </button>
                </div>
              </div>
              
              <div className={suggestionsContainerClass}>
                <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                  {suggestions.map((sug, i) => (
                    <button 
                      key={i} 
                      onClick={() => handleGenerate(sug)} 
                      className="flex-shrink-0 bg-[#1C1C1E] text-zinc-300 border border-appleBorder text-xs px-3.5 py-1.5 rounded-full hover:border-[#F43F5E]/30"
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
                🚀
              </button>
            </div>
            {saving && <p className="text-center text-[10px] text-zinc-500">Đang lưu giữ lên Drive...</p>}
          </div>
        </div>
      )}

      {/* Navigation Tab Bar */}
      <nav className={navBarClass}>
        <button onClick={() => setActiveTab("editor")} className={activeTab === "editor" ? "text-rose-400 text-[10px]" : "text-zinc-500 text-[10px]"}>
          ✍️ <span className="text-[10px]">Nhà sáng tác</span>
        </button>
        <button onClick={() => setActiveTab("library")} className={activeTab === "library" ? "text-rose-400 text-[10px]" : "text-zinc-500 text-[10px]"}>
          📚 <span className="text-[10px]">Tủ sách</span>
        </button>
        <button onClick={() => setActiveTab("settings")} className={activeTab === "settings" ? "text-rose-400 text-[10px]" : "text-zinc-500 text-[10px]"}>
          ⚙️ <span className="text-[10px]">Cấu hình</span>
        </button>
      </nav>
    </div>
  );
}