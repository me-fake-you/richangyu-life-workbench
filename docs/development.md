# 开发说明

## 常用命令

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run validate
npm run doctor
```

## 目录

- `app/`：页面、组件与 API 路由；
- `worker/`：Cloudflare Worker 入口与定时触发；
- `lib/`：跨模块业务逻辑；
- `db/`：Drizzle schema；
- `drizzle/`：D1 迁移；
- `public/`：PWA、图标和静态资源；
- `scripts/`：环境检查、独立部署和源码发布；
- `tests/`：静态边界与结构验证；
- `examples/demo/`：虚构导入样本。

## 数据库修改

修改 `db/schema.ts` 后运行：

```bash
npm run db:generate
```

检查生成 SQL 是否兼容 D1，并考虑旧数据迁移、回滚策略、导出恢复和隐私查询边界。

## UI 修改

至少检查：

- 无数据、少量数据和长文本；
- 1440px 桌面与 390px 手机宽度；
- 键盘焦点、按钮标签和颜色对比；
- 中文与英文混排是否自然换行；
- 加载、失败、离线与冲突状态；
- 私密记录是否意外进入普通入口。

## 发布前

```bash
npm run validate
npm run release:source
```

源码包脚本要求工作区干净，并扫描个人站点 ID、绝对路径和常见密钥格式。
