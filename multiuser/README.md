# 日常屿独立多人服务基础

这里包含账号空间和可选内容接口的服务端基础。**不是已经开放注册、可供现有安卓 App 绑定的完整工作台。** 不修改个人工作台、数据库、站点访问范围或签名，也不把旧数据接入多人服务。

## 源码提供的能力

- 可信 Sites 身份网关的稳定账号 ID 决定空间归属；客户端不能选择主人或别人的空间。
- 每个账号最多一个服务器生成的空间，支持查询、创建和改名。
- 独立 `MULTIUSER_DB`；从不回退到个人工作台的 `DB`。
- `/api/content` 可选提供纯文本记录和单次日程；服务器 ID、修订控制、软删除和请求回执参与归属与重试保护。
- 内容列表最多 100 项并报告截断；尚未提供分页。
- HTTPS 同源写入、限长 JSON 和错误脱敏；默认关闭。

## 接口与手机兼容性

| 方法 | 地址 | 范围 |
| --- | --- | --- |
| GET | `/` 或 `/health` | 阶段、配置状态和能力布尔值；不含个人数据 |
| GET | `/api/account/workspace` | 自己的空间；未创建返回 null |
| POST | `/api/account/workspace` | 创建自己的空间，仅可选 name |
| PATCH | `/api/account/workspace` | 修改自己的空间名称 |
| GET | `/api/content` | 当前账号的记录和日程快照 |
| POST | `/api/content` | 当前账号的创建、修订或软删除操作 |

当前没有完整安卓 `/mobile-connect` 和 `/api/mobile` 协议。健康信息明确声明 `nativeBindingReady=false`、`registrationOpen=false`、`fullWorkbenchReady=false`。请勿将此服务当作现有 App 的可用绑定地址。

能力信息按当前配置生成。空间能力需要基础开关、可信网关模式和独立数据库；记录与日程还需内容开关和数据库批处理接口。打卡、营养、财务、AI、附件及备份仍未提供，不能用配置开关把它们标为已完成。

## 启用前提

只有独立站点已验证身份网关、来源身份头不能被访客伪造，并绑定新的独立数据库后，才可设置：

- `MULTIUSER_FOUNDATION_ENABLED=true`
- `MULTIUSER_AUTH_MODE=sites-dispatch`
- `MULTIUSER_CONTENT_ENABLED=true`（仅在需要内容接口时）

这些开关不是身份验证。不要在直接暴露的普通 Worker 上开启请求头信任，不要指向私人数据库。示例配置默认关闭，且禁止直接 workers.dev 发布。

## 检查与剩余交付

历史隔离检查使用内存 SQLite 和 D1 适配器，不写个人数据库；dry-run 构建不部署线上站点。当前源码改动尚未执行新的检查，具体结果需对应实际修订。

下一步仍包括：独立登录与托管、原生兼容协议、主要业务接口、账号删除与附件边界、双账号实测、手机安装和同步，以及经授权的包与商店发布。已有基础不能替代这些完整交付。

[阶段说明与验收边界](../docs/MULTIUSER-FOUNDATION-20261004.md) · [总体目标](../docs/DELIVERY-ROADMAP-20261008.md)
