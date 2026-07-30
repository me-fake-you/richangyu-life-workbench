# GitHub 开源发布指南

## 推荐仓库信息

- **仓库名**：`richangyu-life-workbench`
- **描述**：`开源、隐私优先、可自部署的个人生活操作系统：记录、时间表、表格、财务、兼职、情报与长期回顾。`
- **Website**：填写你愿意公开访问的演示站；个人私密站不要填写。
- **Topics**：`life-os`, `personal-dashboard`, `self-hosted`, `pwa`, `cloudflare`, `react`, `typescript`, `d1`, `r2`, `journal`
- **License**：MIT

## 为什么使用全新源码包

当前个人开发仓库的历史中曾包含专用 Sites 项目元数据。即使最新提交已移除，直接公开旧 Git 历史仍可能暴露过去的部署标识。因此第一次公开发布应使用生成的 `outputs/richangyu-life-workbench-v1.4.0-source.zip` 创建全新仓库，不要推送当前 `.git` 历史。

## 上传步骤

1. 运行全部验证并提交最新源码：

   ```bash
   npm run validate
   npm run release:source
   ```

2. 解压 `outputs/richangyu-life-workbench-v1.4.0-source.zip` 到新的空目录。
3. 在 GitHub 创建**空仓库**，不要自动添加 README、License 或 `.gitignore`。
4. 在新目录执行：

   ```bash
   git init
   git add .
   git commit -m "feat: publish Richangyu v1.4.0"
   git branch -M main
   git remote add origin <你的GitHub仓库地址>
   git push -u origin main
   ```

5. 在仓库 Settings 开启 Issues、Discussions、Dependabot alerts 和 Private vulnerability reporting。
6. 检查 Actions 中 CI 与 CodeQL 是否通过。

## 建议的 v1.4.0 Release 文案

标题：

```text
日常屿 v1.4.0：简洁工作台与统一快捷记录
```

摘要：

```text
日常屿 v1.4.0 在长期可靠版基础上，加入简洁/完整工作台、六种场景预设、
五入口手机导航，以及文字、语音、照片统一快捷记录。
一句“午饭鸡肉饭，花了32元，心情不错”可以先预览，再同时写入饮食、财务和生活记录，
执行后仍可立即撤销；生活收件箱也增加了逐条整理模式。
项目继续保留数据健康、恢复演练、安全演示、同步诊断、AI 来源说明、
约三分钟中文讲解、WebVTT 中文字幕和完整中英双语文档。
支持 Cloudflare Worker + D1 + R2 自部署，可选 NVIDIA/OpenAI 模型。
```

Release 附件可上传同一个源码 ZIP。不要上传 `.env.local`、生产数据库、备份或真实照片。

## 首批建议 Issue

- 增加端到端浏览器测试；
- 提供一套可一键重置的公开演示模式；
- 增加可选的客户端加密层设计；
- 改善表格大数据量虚拟滚动；
- 提供一套只含虚构内容的在线演示实例；
- 评估 Android/iOS 原生壳的维护成本；
- 增加更多导入格式和迁移助手。
