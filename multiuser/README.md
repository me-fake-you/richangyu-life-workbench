# 日常屿独立多人服务基础

这是独立多人版的第一阶段，只提供账号自己的空间资料服务。它不是完整工作台，不接受现有安卓 App 的绑定，不包含记录、打卡、日程、AI、附件或备份接口，也没有开放公众注册。

现有个人工作台、数据库、站点访问范围和 1.8.7 安卓预览包均不由这里修改。本模块不得接在旧工作台后面作为不受控的路由回退。

## 已实现的范围

- 从可信 Sites 身份网关接收稳定账号 ID，不用邮箱、设备 ID 或客户端字段决定归属。
- 每个账号最多一个空间，空间 ID 由服务器生成，创建可安全重复调用。
- 查询与改名始终使用当前账号的参数绑定，不接受指定他人账号或空间 ID。
- 写入要求同源 HTTPS、有限大小的 JSON；异常不返回数据库细节或账号标识。
- 使用独立的 `MULTIUSER_DB` 绑定，不退回个人工作台的 `DB`。
- 默认关闭，未知接口直接拒绝，不沿用单用户记录、AI 或备份接口。

## API

| 方法 | 地址 | 范围 |
| --- | --- | --- |
| GET | `/health` | 仅声明基础阶段，公众注册与完整工作台均未就绪 |
| GET | `/api/account/workspace` | 当前账号自己的空间，未创建时返回 null |
| POST | `/api/account/workspace` | 创建自己的空间，只接受可选 name |
| PATCH | `/api/account/workspace` | 修改自己的空间名称，只接受 name |

接口的能力信息会明确将记录、打卡、日程、AI、附件和备份标为未实现。拿到一个空间 ID 不代表已获得完整工作台。

## 启用前提

只有新的独立站点完成可信身份网关部署、确认来源身份头不能由访客伪造，并绑定新的独立数据库后，才能设置 `MULTIUSER_FOUNDATION_ENABLED=true` 和 `MULTIUSER_AUTH_MODE=sites-dispatch`。

这两个配置开关本身不是身份验证。不要在直接暴露的普通 Worker 上开启身份头信任，不要由客户端传入配置，也不要指向个人数据库。其他托管方式必须先实现并验证自己的服务端身份验证，不能只相信请求中的账号头。

仓库示例配置不包含账号、数据库 ID、个人网址或密钥，默认关闭且禁用直接 workers.dev 发布。本轮不注册新站点，不修改当前私人站点权限。

## 检查与构建

```powershell
node --test tests/multiuser-workspace-isolation.test.mjs
node node_modules/wrangler/bin/wrangler.js deploy --config multiuser/wrangler.jsonc --dry-run --outdir outputs/multiuser-foundation
```

检查使用内存 SQLite 执行真实 SQL，通过 D1 方法适配器验证空间归属，不写入个人数据库。构建为 dry-run，不部署线上站点。具体通过情况以当次结果或 GitHub Actions 为准。

[阶段说明和后续验收](../docs/MULTIUSER-FOUNDATION-20261004.md)


## Isolated content foundation (2026-10-08)

An opt-in `/api/content` endpoint now provides plain records and one-off schedules.
It remains disabled unless `MULTIUSER_CONTENT_ENABLED=true`, alongside the existing
verified Sites identity gateway and separate database requirements. Do not enable
it on an ordinary publicly reachable Worker that accepts spoofable identity headers.

Ownership is resolved by joining the authenticated stable subject to its workspace.
Clients cannot select an owner or workspace. Creates use server-generated IDs;
updates and soft deletes require the observed revision. Request receipts make
retries idempotent. Lists return at most 100 items and report truncation.

This is not a publicly launched multiuser App. Nutrition, check-ins, finance, AI,
attachments, backup, public registration, pagination and the native multiuser
login experience are not implemented here. The private single-user site is unchanged.
