import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../auth/[...nextauth]/route";

const WORKERS: Record<string, { name: string; url: string; model: string }> = {
  WorkerA: { name: "Llama 3.3 70B", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  WorkerB: { name: "Gemma 2 9B", url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemma-2-9b-it:free" },
  WorkerC: { name: "Mistral Nemo", url: "https://openrouter.ai/api/v1/chat/completions", model: "mistralai/mistral-nemo:free" },
  WorkerD: { name: "Qwen 2.5 14B", url: "https://openrouter.ai/api/v1/chat/completions", model: "qwen/qwen-2.5-14b-instruct:free" },
};

async function callLLM(apiUrl: string, apiKey: string, model: string, messages: any[]) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  const { action, currentStory, userPrompt, stories } = await req.json();

  const getDrive = () => {
    if (!session?.accessToken) throw new Error("Unauthorized");
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: session.accessToken });
    return google.drive({ version: "v3", auth });
  };

  try {
    // 1. Thao tác Lưu trữ dữ liệu lên Google Drive
    if (action === "save") {
      const drive = getDrive();
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

    // 2. Thao tác Tải dữ liệu từ Google Drive
    if (action === "load") {
      const drive = getDrive();
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      return NextResponse.json({ stories: resContent.data });
    }

    // 3. Quy trình Đa mô hình AI (Master - Workers Router)
    if (action === "generate") {
      // 3.1. Master (Gemini 1.5 Flash) quyết định chọn 2 Worker
      const routerPrompt = `You are the Master AI storyteller coordinator. Based on the current story context: "${currentStory}" and prompt/idea: "${userPrompt}", select EXACTLY 2 of the most appropriate workers from the list below:
      - WorkerA: Best for deep human drama, heavy dialogue or intense emotion.
      - WorkerB: Best for highly poetic descriptions, setting details and slow atmospheric imagery.
      - WorkerC: Best for high action scenes, logic-driven plot progression and mysterious turns.
      - WorkerD: Best for complex fantasy elements, expansive historical lore and deep context.
      Return ONLY a pure JSON array containing the selected workers, for example: ["WorkerA", "WorkerB"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: routerPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const geminiData = await geminiRes.json();
      let decisionText = geminiData.candidates[0].content.parts[0].text;
      decisionText = decisionText.replace(/```json|```/g, "").trim(); // Vệ sinh sạch chuỗi JSON phòng hờ định dạng Markdown
      const decision = JSON.parse(decisionText);
      const [w1, w2] = decision as ("WorkerA" | "WorkerB" | "WorkerC" | "WorkerD")[];

      // 3.2. Triển khai xử lý song song trên 2 Worker được chỉ định
      const workerPrompt = `You are a creative co-author. Given the current story: "${currentStory}", continue writing the next paragraph (strictly within 80-120 words) using this user prompt: "${userPrompt}". Keep the flow organic.`;
      
      const p1 = callLLM(WORKERS[w1].url, w1 === "WorkerA" ? process.env.GROQ_API_KEY! : process.env.OPENROUTER_API_KEY!, WORKERS[w1].model, [{ role: "user", content: workerPrompt }]);
      const p2 = callLLM(WORKERS[w2].url, w2 === "WorkerA" ? process.env.GROQ_API_KEY! : process.env.OPENROUTER_API_KEY!, WORKERS[w2].model, [{ role: "user", content: workerPrompt }]);
      
      const [res1, res2] = await Promise.all([p1, p2]);

      // 3.3. Master tổng hợp, thẩm định và gọt giũa đoạn văn trơn tru nhất
      const evalPrompt = `You are the master editor. Examine the current story context: "${currentStory}" and the prompt: "${userPrompt}". 
      Critique and seamlessly combine the best parts of these two continuations into one single, cohesive, highly compelling paragraph:
      Option 1: "${res1}"
      Option 2: "${res2}"
      Respond ONLY with the final edited story continuation paragraph. Do not write any explanations or headers.`;

      const evalRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }] })
      });
      const evalData = await evalRes.json();
      
      return NextResponse.json({
        text: evalData.candidates[0].content.parts[0].text,
        workers: [WORKERS[w1].name, WORKERS[w2].name]
      });
    }

    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
        }
