import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const value = {
    name: "日常屿 · 生活工作台",
    short_name: "日常屿",
    description:
      "记录生活、安排时间、管理财务与兼职，并用 AI 理解长期成长。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f3ed",
    theme_color: "#203d32",
    lang: "zh-CN",
    categories: ["lifestyle", "productivity"],
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      {
        name: "记录生活",
        short_name: "记录",
        description: "快速写下此刻，并添加照片、心情和标签。",
        url: "/?action=record",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
      },
      {
        name: "安排日程",
        short_name: "日程",
        description: "新建课程、工作、学习或旅行安排。",
        url: "/?action=schedule",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
      },
      {
        name: "记录饮食",
        short_name: "饮食",
        description: "上传餐食照片并记录热量与营养。",
        url: "/?action=nutrition",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
      },
      {
        name: "生活收件箱",
        short_name: "收件箱",
        description: "先保存文字、链接或灵感，之后再整理。",
        url: "/?action=inbox",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
      },
    ],
    share_target: {
      action: "/api/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: ["image/*", "audio/*", "application/pdf"],
          },
        ],
      },
    },
  };
  return value as MetadataRoute.Manifest;
}
