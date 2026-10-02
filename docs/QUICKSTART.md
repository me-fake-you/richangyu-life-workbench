# 开始使用与部署
更新：2026-10-03

## 先选版本

| 目的 | 选择 | 注意 |
| --- | --- | --- |
| 看流程 | [虚构数据互动演示](https://me-fake-you.github.io/richangyu-life-workbench/showcase/) | 不调用真实 AI，不连接私人数据 |
| 看既有网页源码 | 主分支 main | 不包含尚未合并的 AI 升级 |
| 跟进最新 AI 源码 | [PR #7](https://github.com/me-fake-you/richangyu-life-workbench/pull/7) | 上次安装检查失败，暂不建议正式部署 |
| 安装本轮原生安卓 | 尚无本轮新安装包 | PWA 不是 APK |

GitHub Pages 若尚未完成发布，可先查看 `public/tutorial/showcase/index.html` 源码。本演示是独立静态页面，不依赖工作台账户或密钥。

## 本地开发：既有主分支

需要 Node.js 22.13.0 或更高版本，以及 Git 和 npm。命令提供真实仓库地址，不再使用占位仓库。

```sh
git clone https://github.com/me-fake-you/richangyu-life-workbench.git
cd richangyu-life-workbench
npm ci
npm run doctor
npm run dev
```

按照 doctor 输出配置所需环境项和数据服务。检查与构建使用 `npm run validate`。这里提供的是入口，不宣称本轮已经在独立环境重新验证成功。

若 `npm ci` 失败，保留错误信息并提交 Issue；不要用 `npm install` 或忽略错误来假装锁定安装已经通过。PR #7 已知有清单与锁定文件不一致问题，必须先修复。

## 真实自部署

按照[Cloudflare 部署文档](deployment-cloudflare.md)建立独立 Workers、D1 与 R2，应用迁移和身份保护。不要复制任何个人工作台的生产配置、数据或账户标识。

- 生产入口必须有可信身份验证和授权检查，不能依赖浏览器随意填写身份。
- 先在独立环境使用虚构数据；不要直接接入原工作台的生产数据库。
- 密钥留在服务器环境变量或 secret 中，不能出现在客户端、截图、GitHub 或 APK 内。
- 在域名和身份一致的前提下，多个客户端可以访问同一套服务；跨账户隔离必须另行验证。

## AI 开发分支配置

以下是当前开发环境使用的配置形式，不代表公开分支独立部署已通过：

```dotenv
AI_PROVIDER=groq
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=replace-with-your-own-server-side-secret
```

不要提交填入真实值的环境文件。模型可用性和额度以自己账号的[Groq 控制台](https://console.groq.com/docs/rate-limits)为准。暂不启用自动付费兜底；达到额度要明确报错，而不是无提示地换付费服务。

## 安卓不是换一个网页图标

手机浏览器添加到主屏幕是 PWA。真正可安装的安卓还需要应用内登录回流、工作台绑定、返回导航、文件处理、弱网行为、签名包和真机测试。上架还涉及开发者账户与商店审核；Google Play 新应用使用 AAB 发布，不能把普通 APK 下载链接当作已上架。[Android 发布说明](https://developer.android.com/studio/publish)

本轮没有生成安装包、创建商店条目或提交审核。
