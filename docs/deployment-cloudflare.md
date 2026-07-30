# Cloudflare 独立部署

这份指南用于把日常屿部署到你自己的 Cloudflare 账户。生产拓扑为 Worker + D1 + R2。

## 1. 准备

- Node.js 22.13 或更高版本；
- Cloudflare 账户；
- 已安装项目依赖；
- 本机已登录 Wrangler。

```bash
npm install
npx wrangler login
```

复制环境文件：

```bash
cp .env.example .env.local
```

PowerShell：

```powershell
Copy-Item .env.example .env.local
```

## 2. 创建 D1 与 R2

```bash
npx wrangler d1 create life-workbench
npx wrangler r2 bucket create life-workbench-media
```

D1 命令会输出数据库 ID。把它填入 `.env.local`：

```env
D1_DATABASE_ID=这里填写数据库ID
D1_DATABASE_NAME=life-workbench
R2_BUCKET_NAME=life-workbench-media
CLOUDFLARE_WORKER_NAME=life-workbench
```

`.env.local` 已被 Git 忽略，不要上传。

## 3. 可选 AI

不配置 AI 也能使用核心模块。使用 NVIDIA 时，文字和视觉可以是两把密钥：

```env
AI_PROVIDER=nvidia
NVIDIA_TEXT_API_KEY=你的文字密钥
NVIDIA_VISION_API_KEY=你的视觉密钥
```

构建配置不会把密钥写入 `wrangler.self-host.json`。生产密钥必须通过 Wrangler Secret 设置：

```bash
npx wrangler secret put NVIDIA_TEXT_API_KEY
npx wrangler secret put NVIDIA_VISION_API_KEY
```

使用 OpenAI 时：

```bash
npx wrangler secret put OPENAI_API_KEY
```

非密钥模型名来自 `.env.local`，部署脚本会写入 Worker 普通变量。

## 4. 检查并部署

```bash
npm run doctor
npm run deploy:cloudflare
```

这条命令会依次：

1. 构建客户端与 Worker；
2. 根据 `.env.local` 生成 `dist/server/wrangler.self-host.json`；
3. 对远程 D1 应用 `drizzle/` 迁移；
4. 发布 Worker。

也可以逐步执行：

```bash
npm run build
npm run cloudflare:configure
npm run cloudflare:migrate
npx wrangler deploy --config dist/server/wrangler.self-host.json
```

## 5. 必须增加访问控制

独立 Worker 的公开网址默认可能被任何知道地址的人访问。存入真实日记、照片、财务或客户信息前：

1. 在 Cloudflare Zero Trust 中创建 Access Application；
2. 将你的 Worker 自定义域名或 `workers.dev` 地址纳入保护；
3. 只允许自己的邮箱或指定身份提供方；
4. 用未登录的无痕窗口确认页面和 API 都被阻止；
5. 再导入真实数据。

只在前端隐藏菜单不是身份验证。

## 6. 定时任务

构建配置默认包含每 15 分钟一次的 Cron 触发器。自动化规则会判断是否需要生成日报、情报简报或备份。可在 Cloudflare Dashboard 的 Worker Triggers 中确认状态。

## 7. 更新版本

更新代码前先备份 D1/R2，然后：

```bash
git pull
npm install
npm run validate
npm run deploy:cloudflare
```

数据库迁移只会应用尚未执行的版本。重大升级仍应先在测试资源上验证。

## 8. 故障排查

- `npm run doctor`：检查运行环境和必要配置。
- `npx wrangler tail <worker-name>`：查看生产日志，分享时先脱敏。
- D1 找不到：检查 `D1_DATABASE_ID`、账户和数据库名。
- 图片失败：确认 R2 bucket 存在且绑定名为 `MEDIA`。
- AI 失败：确认 provider、模型可用性和对应 secret；不要把密钥粘贴到 Issue。
