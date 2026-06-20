import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth";

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
    // 1. Lưu truyện lên Google Drive
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

    // 2. Tải truyện từ Google Drive
    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      return NextResponse.json({ stories: resContent.data });
    }

    // 3. Quy trình gọi Gemini viết nối tiếp trực tiếp (Blazing Fast & Ultra Reliable)
    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY trên Vercel.");
      }

      const fullPrompt = mood ? `Viết tiếp với văn phong phong cách: [${mood}]. Ý tưởng bổ sung: ${userPrompt || "Viết tiếp một cách tự nhiên."}` : userPrompt;

      // Prompt chuyên biệt tối ưu điểm tiếp nối câu từ mượt mà của Google AI Studio
      const systemPrompt = `You are a creative co-author continuing a story context. 
      Current Story Context: "${currentStory}"
      Prompt/Mood Instruction: "${fullPrompt}"
      
      CRITICAL INSTRUCTION: Continue writing the story seamlessly from the exact last word of the context. 
      Do NOT write any introductory notes, greetings, explanations, or markdown boxes. 
      Do NOT repeat the prompt or previous sentences. 
      Write ONLY the continuation text (about 80-120 words) as if you are the same author writing the very next sentence.`;

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
      return NextResponse.json({
        text: outputText
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Lỗi xử lý nội bộ" }, { status: 500 });
  }
}
