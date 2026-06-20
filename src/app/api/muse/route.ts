import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth"; // Import từ file mới tách

const WORKERS: Record<string, { name: string; url: string; model: string }> = {
  WorkerA: { name: "Llama 3.3 70B (Siêu tốc)", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  WorkerB: { name: "Gemma 2 9B (Google)", url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemma-2-9b-it:free" },
  WorkerC: { name: "Mistral Nemo (Pháp)", url: "https://openrouter.ai/api/v1/chat/completions", model: "mistralai/mistral-nemo:free" },
  WorkerD: { name: "Qwen 2.5 14B (Alibaba)", url: "https://openrouter.ai/api/v1/chat/completions", model: "qwen/qwen-2.5-14b-instruct:free" },
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
  const { action, currentStory, userPrompt, mood, stories } = await req.json();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. Thao tác Lưu trữ dữ liệu lên Google Drive
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

    // 2. Thao tác Tải dữ liệu từ Google Drive
    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      return NextResponse.json({ stories: resContent.data });
    }

    // 3. Quy trình Đa mô hình AI (Master - Workers Router)
    if (action === "generate") {
      const fullPrompt = mood ? `Viết tiếp với văn phong phong cách: [${mood}]. Ý tưởng bổ sung: ${userPrompt || "Viết tiếp một cách tự nhiên."}` : userPrompt;

      const routerPrompt = `You are the Master AI coordinator. Analyze this story context: "${currentStory}" and the prompt: "${fullPrompt}".
      Select EXACTLY 2 workers best suited for this section from:
      - WorkerA: Intense drama, emotional tension, character dialogues.
      - WorkerB: Beautiful scenery descriptions, deep romantic/emotional imagery, slow atmosphere.
      - WorkerC: Suspenseful moments, sudden twists, logical actions, mystery.
      - WorkerD: Rich world-building details, inner thoughts, philosophical depth.
      Return ONLY a JSON array, e.g., ["WorkerA", "WorkerB"]`;

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
      decisionText = decisionText.replace(/```json|```/g, "").trim();
      
      const decision = JSON.parse(decisionText);
      const w1 = decision[0];
      const w2 = decision[1];

      const workerPrompt = `Context: ${currentStory}. Please continue writing the story naturally (about 80-120 words) matching this prompt/mood requirement: "${fullPrompt}".`;
      
      const p1 = callLLM(WORKERS[w1].url, w1 === "WorkerA" ? process.env.GROQ_API_KEY! : process.env.OPENROUTER_API_KEY!, WORKERS[w1].model, [{ role: "user", content: workerPrompt }]);
      const p2 = callLLM(WORKERS[w2].url, w2 === "WorkerA" ? process.env.GROQ_API_KEY! : process.env.OPENROUTER_API_KEY!, WORKERS[w2].model, [{ role: "user", content: workerPrompt }]);
      const [res1, res2] = await Promise.all([p1, p2]);

      const evalPrompt = `Current story context: "${currentStory}"\n\nPrompt/mood instruction: "${fullPrompt}"\n\nSelect and combine the best, most emotional parts of these two continuations into a single, perfectly flowing paragraph:\nContinuation 1 (from ${WORKERS[w1].name}): "${res1}"\nContinuation 2 (from ${WORKERS[w2].name}): "${res2}"\n\nOutput only the finalized story paragraph with no extra dialogue or explanations.`;

      const evalRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }] })
      });
      const evalData = await evalRes.json();
      
      return NextResponse.json({
        text: evalData.candidates[0].content.parts[0].text,
        selectedWorkers: [WORKERS[w1].name, WORKERS[w2].name]
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
