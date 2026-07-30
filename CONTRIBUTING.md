# 参与贡献

感谢你愿意帮助完善日常屿。这个项目会处理日记、照片、财务和客户等敏感信息，因此“隐私边界清晰、数据可恢复”与功能本身同样重要。

## 开始之前

1. 先搜索已有 Issue，确认问题尚未被报告。
2. 较大的功能先创建 Feature Request，说明使用场景、数据变化和隐私影响。
3. Fork 仓库并从 `main` 创建短分支，例如 `fix/mobile-timeline`。
4. 不要把真实照片、备份、票据、API 密钥或个人 `.openai/hosting.json` 放进提交。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run doctor
npm run dev
```

提交前运行：

```bash
npm run validate
```

## 代码与数据约定

- TypeScript 保持类型清晰；API 对不可信输入执行校验。
- 数据库变更同步更新 `db/schema.ts` 和 `drizzle/` 迁移。
- 私密记录默认不得进入普通搜索、默认总结、往年今日和通知正文。
- AI 生成结论应保留来源，未经用户确认不得覆盖正式数据。
- 新功能需要说明导入、导出、删除、恢复和多设备冲突时的行为。
- UI 修改同时检查桌面、窄屏手机、键盘操作和空数据状态。

## Pull Request

PR 请聚焦一个主题，并填写模板中的验证、截图和隐私检查。推荐提交信息：

- `feat: add ...`
- `fix: prevent ...`
- `docs: clarify ...`
- `test: cover ...`
- `refactor: simplify ...`

项目维护者可能要求拆分过大的 PR。提交即表示你同意按 MIT License 发布贡献内容。
