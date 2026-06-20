import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth";

// Định cấu hình danh sách mô hình miễn phí hoạt động ổn định nhất trên OpenRouter
const WORKERS: Record<string, { name: string; url: string; model: string }> = {
  WorkerA: { name: "Llama 3.1 8B (Meta)", url: "https://openrouter.ai/api/v1/chat/completions", model: "meta-llama/llama-3.1-8b-instruct:free" },
  WorkerB: { name: "Qwen 2.5 7B (Alibaba)", url: "https://openrouter.ai/api/v1/chat/completions", model: "qwen/qwen-2.5-7b-instruct:free" },
  WorkerC: { name: "Mistral 7B (Pháp)", url: "https://openrouter.ai/api/v1/chat/completions", model: "mistralai/mistral-7b-instruct:free" },
  WorkerD: { name: "Mô hình Tự động (Free Router)", url: "https://openrouter.ai/api/v1/chat/completions", model: "openrouter/free" },
};

async function callLLM(apiUrl: string, apiKey: string, model: string, messages: any[]) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${apiKey}`, 
      "Content-Type": "application/json",
      "HTTP-Referer": "https://muse-app-nine.vercel.app", 
      "X-Title": "Muse App"
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter Error: ${res.status} - ${errText}`);
  }
  
  const data = await res.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error("OpenRouter không trả về kết quả.");
  }
  return data.choices[0].message.content;
}

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  const { action, currentStory, userPrompt, mood, stories } = await req.json();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Chưa ủy quyền Google Drive." }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. Đồng bộ dữ liệu lên Google Drive
    if (action === "save") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      const media = { mimeType: "application/json", body: JSON.stringify(stories) };
      if (files.length > 0) {
        await drive.files.update({ fileId: files[0].id!, media });
      } else {
        await drive.files.create({ requestBody: { name: "muse_data.json", mimeType: "application/json" }, media });
      }
      return NextResponse.json({ success: true });
    }

    // 2. Tải dữ liệu từ Google Drive (Khai báo thêm : any để sửa triệt để lỗi TypeScript)
    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      
      let parsedStories: any = resContent.data; // Ép kiểu any ở đây để không bị báo lỗi undefined[]
      if (typeof parsedStories === "string") {
        try {
          parsedStories = JSON.parse(parsedStories);
        } catch (e) {
          parsedStories = [];
        }
      }
      return NextResponse.json({ stories: parsedStories });
    }

    // 3. Quy trình gọi Gemini 2.5 viết nối tiếp trực tiếp đúng chuẩn Google AI Studio
    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY trên Vercel.");
      }

      const fullPrompt = mood ? `Viết tiếp với văn phong phong cách: [${mood}]. Ý tưởng bổ sung: ${userPrompt || "Viết tiếp một cách tự nhiên."}` : userPrompt;

      // System Prompt chuyên biệt tối ưu cho cả dẫn truyện lẫn thoại nhân vật mạch lạc
      const systemPrompt = `You are a professional creative co-author continuing a story.
      Current Story Context: "${currentStory}"
      Prompt/Mood Instruction: "${fullPrompt}"
      
      CRITICAL NARRATIVE INSTRUCTIONS:
      1. CONTINUATION: Seamlessly write the next part of the story. Do NOT write any introduction, commentary, or greetings.
      2. LENGTH & COMPLETENESS: Write a natural continuation of about 150-250 words. You MUST complete your final sentence. Never cut off mid-sentence.
      3. DIALOGUE IMMERSION: If the user's prompt is a direct speech/dialogue (e.g., written inside quotes or conversational like "Xin chào!", "Cậu là ai?"), treat it as a character dialogue in the scene. Have the other character in the story respond naturally in-character. Use standard Vietnamese double quotes "“...”" for dialogues. Do not break character or explain.`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      });

      if (!geminiRes.ok) {
        const geminiErr = await geminiRes.text();
        throw new Error(`Gemini Error: ${geminiRes.status} - ${geminiErr}`);
      }

      const geminiData = await geminiRes.json();
      if (!geminiData.candidates || geminiData.candidates.length === 0) {
        throw new Error("Gemini API không trả về kết quả.");
      }

      const outputText = geminiData.candidates[0].content.parts[0].text;
      return NextResponse.json({ text: outputText });
    }

    // 4. Tạo gợi ý động bám sát ngữ cảnh thực tế của câu chuyện
    if (action === "suggest") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường.");
      }

      const suggestPrompt = `Dựa trên ngữ cảnh câu chuyện dưới đây, hãy đưa ra đúng 3 gợi ý ngắn (dưới 7 từ mỗi gợi ý) về hướng đi tiếp theo của cốt truyện. Gợi ý cần khơi gợi cảm xúc, kịch tính, lãng mạn hoặc bất ngờ.
      Ngữ cảnh truyện: "${currentStory || "Bắt đầu câu chuyện mới"}"
      
      Trả về kết quả dưới dạng mảng JSON thuần túy như sau, tuyệt đối không viết thêm lời bình:
      ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: suggestPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!geminiRes.ok) {
        throw new Error("Không thể tạo gợi ý.");
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates[0].content.parts[0].text;
      return NextResponse.json({ suggestions: JSON.parse(rawText) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Lỗi xử lý nội bộ" }, { status: 500 });
  }
        }
