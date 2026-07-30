import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./advanced.css";
import "./finance.css";
import "./intelligence.css";
import "./search.css";
import "./photo.css";
import "./backup.css";
import "./review.css";
import "./guide.css";
import "./reliability.css";
import { PwaProvider } from "./pwa-client";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6f4aa8",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "日常屿 · 生活工作台",
    description:
      "把生活记录、时间管理、财务兼职、知识情报、求职机会和历史总结连接在一起的个人生活工作台。",
    icons: {
      icon: [
        { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/app-icon-192.png",
      apple: "/apple-touch-icon.png",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "日常屿",
    },
    openGraph: {
      title: "日常屿 · 生活工作台",
      description: "安排生活，理解信息，抓住机会，看见成长。",
      type: "website",
      locale: "zh_CN",
      images: [{ url: `${origin}/og.png`, width: 1792, height: 896 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "日常屿 · 生活工作台",
      description: "安排生活，理解信息，抓住机会，看见成长。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
