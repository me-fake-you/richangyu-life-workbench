# 2026-10-08 图片依赖安全定向修复

本轮仅改公开开发分支的依赖与检查，不部署私人工作台，不改 Android 功能、版本、签名或已有安装包。

## 已选择的官方修复

- 将 `sharp` 的所有依赖分支固定到 `0.35.5`，替换已有的 `0.35.4`。这是同一 minor 版本内的补丁升级，同时覆盖 Next 和 miniflare。
- 将 vinext 使用的 `image-size` 定向固定为 `2.0.4`；两项无限循环拒绝服务问题的官方最低修复版为 `2.0.3`。
- 保留此前 `@esbuild-kit/core-utils` 的 esbuild 定向修复，不整体降级或迁移 Next、React、vinext、Vite、Cloudflare 或 ESLint。
- 锁文件由 npm 重新解析生成，不手改版本、完整性或下载地址。

依据：[sharp 安全公告](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)、[sharp 0.35.5 发布说明](https://github.com/lovell/sharp/releases/tag/v0.35.5)、[image-size JXL/HEIF 公告](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)、[image-size ICNS 公告](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)。npm 公开注册表同时确认这些正式版本已发布。

## 防回退和兼容检查

- CI 新增 `npm audit --omit=dev --audit-level=high`，生产依赖出现 high 或 critical 时阻止完整检查成功；该命令并不忽略生产风险，也不代表所有开发依赖都安全。
- 新增锁文件最低补丁版本保护，以及实际原生库版本、PNG 缩略图、SVG 解码和异常图片拒绝测试。
- 原有全部测试、类型检查、lint、编码检查、网页构建、源码导出和 CodeQL 均保留。
- 以上只是新增检查范围，不提前宣称执行通过。最终结果以此提交的实际检查记录为准。

## 仍未完成

- [braces 深层嵌套模式导致栈耗尽公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)在 2026-10-08 仍标明无官方修复，npm 最新正式版仍是受影响的 `3.0.3`。
- 不能把框架整体降级、关闭规则、隐藏审计或改包名当作风险修复；其 fast-glob、micromatch、ESLint 和构建插件依赖链仍需后续处理。
- 本轮完整与生产依赖审计的实际数量另行记录；不预先宣称所有告警归零，也不将 CodeQL 成功当作 npm 审计成功。
- 私人站点仍使用此前部署，本轮锁文件整改不会自动更新线上服务。
- PR 合并状态异常、真机验收、独立多人 App 服务与正式商店发布仍是总体交付待办。
