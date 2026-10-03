import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function MobileConnectPage() {
  const user = await requireChatGPTUser("/mobile-connect");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f2e8", color: "#1e312c", padding: 24 }}>
      <section style={{ maxWidth: 420, background: "white", borderRadius: 28, padding: 32, boxShadow: "0 18px 60px rgba(35,54,47,.12)", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 22, display: "grid", placeItems: "center", margin: "0 auto 20px", background: "#dce9df", fontSize: 30 }}>✓</div>
        <h1 style={{ margin: "0 0 10px", fontSize: 26 }}>手机 App 已绑定</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: "#607069" }}>{user.displayName}，正在返回原生工作台。以后打开 App 会直接进入首页。</p>
      </section>
    </main>
  );
}
