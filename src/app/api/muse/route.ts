import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth";

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  const { action, title, systemInstructions, blocks, userPrompt, mood, stories } = await req.json();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Chưa ủy quyền Google Drive." }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. Lưu đồng bộ tất cả cấu hình truyện (gồm cả System Instructions) lên Drive
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

    // 2. Tải toàn bộ cấu hình truyện từ Drive về
    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      
      let parsedStories: any = resContent.data;
      if (typeof parsedStories === "string") {
        try {
          parsedStories = JSON.parse(parsedStories);
        } catch (e) {
          parsedStories = [];
        }
      }
      return NextResponse.json({ stories: parsedStories });
    }

    // 3. Quy trình gọi mô hình GEMINI 3.5 FLASH độc nhất để phóng tác cốt truyện
    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY.");
      }

      // Gộp ngữ cảnh từ các khối truyện trước để AI giữ đúng mạch truyện
      const historyContext = blocks && Array.isArray(blocks)
        ? blocks.map((b: any) => `${b.type === "user" ? "Diễn biến cũ" : "Truyện hoàn chỉnh"}: ${b.text}`).join("\n\n")
        : "Bắt đầu chương truyện mới.";

      const fullPrompt = mood ? `Sáng tác với văn phong: [${mood}]. Ý tưởng mới: ${userPrompt}` : userPrompt;

      // System Prompt chuyên biệt ép AI học cách viết cực kỳ chi tiết, giàu hình ảnh của bạn gái bạn
      const systemPrompt = `You are a professional Vietnamese creative co-author (Muse ♥). 
      Your task is to take a short, simple plot event or dialogue prompt entered by the user, and EXPAND/REWRITE it into a rich, highly detailed, vivid, and emotionally deep literary narrative block (around 200-350 words).

      SYSTEM INSTRUCTIONS (Character profiles, setting, relationships, interaction rules):
      "${systemInstructions || "Chưa có chỉ dẫn bối cảnh."}"

      PREVIOUS STORY HISTORY:
      ${historyContext}

      NEW EVENT TO EXPAND & REWRITE:
      "${fullPrompt}"

      CRITICAL WRITING RULES:
      1. STYLE: Mimic the style of premium, vivid, southern/modern Vietnamese regional vernacular and atmospheric writing. Use precise physical gestures (e.g. vén lọn tóc, rung đùi bần bật), sensory details (wind, smell, lighting), and realistic internal thoughts of the characters.
      2. DIALOGUES: Enclose character dialogues strictly in double quotes (e.g., “Cậu An, đừng rung đùi.”).
      3. IMMERSION: Write only the expanded story block. Never include notes, greetings, commentaries, or explanations. The final sentence must be fully completed. Never cut off mid-sentence.`;

      // Sử dụng chính xác gemini-3.5-flash theo yêu cầu của bạn
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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
      const outputText = geminiData.candidates[0].content.parts[0].text;
      return NextResponse.json({ text: outputText });
    }

    // 4. Phân tích bối cảnh truyện để tự động cập nhật gợi ý động
    if (action === "suggest") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường.");
      }

      const historyContext = blocks && Array.isArray(blocks)
        ? blocks.map((b: any) => b.text).join("\n\n")
        : "";

      const suggestPrompt = `Dựa trên diễn biến truyện hiện tại dưới đây, hãy đưa ra đúng 3 gợi ý ngắn gọn (dưới 7 từ mỗi gợi ý) về hướng đi tiếp theo của cốt truyện. Gợi ý cần khơi gợi cảm xúc, kịch tính, lãng mạn hoặc bất ngờ.
      Ngữ cảnh truyện: "${historyContext || "Bắt đầu câu chuyện mới"}"
      
      Trả về kết quả dưới dạng mảng JSON thuần túy như sau, tuyệt đối không viết thêm lời bình:
      ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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
