import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpeakUp",
    short_name: "SpeakUp",
    description: "Practice your on-camera hooks and get instant AI feedback.",
    start_url: "/speakup/",
    scope: "/speakup/",
    display: "standalone",
    background_color: "#f4f0e8",
    theme_color: "#e8561c",
    icons: [{ src: "/speakup/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
