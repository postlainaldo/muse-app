import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Muse - Không gian sáng tác",
    short_name: "Muse",
    description: "Trợ lý sáng tác truyện Co-authoring dựa trên Gemini 3.5 Flash",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0C",
    theme_color: "#0A0A0C",
    icons: [
      {
        src: "https://cdn-icons-png.flaticon.com/512/3850/3850285.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
