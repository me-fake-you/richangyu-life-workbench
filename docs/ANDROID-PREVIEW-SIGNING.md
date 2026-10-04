# 固定安卓预览签名配置

此配置用于让未来预览版持续使用同一独立密钥，减少每次构建换开发签名导致的覆盖安装冲突。从 1.8.7 起，公开发布要求完整的固定预览签名配置。是否实际启用必须查看对应发布说明中的 `persistent` 标记及安装包证书检查结果，不能只凭这份说明认定已启用。

正式 `release.keystore` 不在本轮创建、替换或上传。预览和正式密钥分开保管；私钥与密码不得进入公开仓库、聊天、日志或安装包。公开证书指纹不包含私钥。

## 仓库所有者私下配置

在仓库的 Actions Secrets 中配置以下三项：

- `RICHANGYU_ANDROID_PREVIEW_KEYSTORE_BASE64`：独立预览 keystore 的 Base64 内容。
- `RICHANGYU_ANDROID_PREVIEW_STORE_PASSWORD`：该 keystore 的密码。
- `RICHANGYU_ANDROID_PREVIEW_KEY_PASSWORD`：对应私钥条目的密码。

Base64 只是编码，不是加密。上述内容只能放入受控的加密 Secrets，不得放入普通变量、源码或聊天。密钥生成、备份和私下录入需要所有者完成或另行明确授权。

在 Actions Variables 中设置不含秘密的配置：

- `RICHANGYU_ANDROID_PREVIEW_KEY_ALIAS`：预览密钥别名，缺省为 `preview`。
- `RICHANGYU_ANDROID_PREVIEW_CERT_SHA256`：预览证书 DER 字节的 SHA-256，64 位小写十六进制，不带冒号。

备份密钥与密码至安全位置，限制管理权限。首次切换到新密钥通常无法覆盖之前使用另一开发签名的预览包；先保护已同步数据，不要直接删除旧安装。

## 构建防护

公开发布或手动构建缺少固定签名配置时必须失败，不再发布新的随机签名 APK。PR 检查不读取签名秘密，可使用开发签名执行验证，但不会发布下载版。部分配置缺失必须失败，不能静默使用开发签名。

隐私边界检查在恢复临时密钥之前执行，阻止提交密钥与个人地址。恢复密钥后先校验证书指纹，再编译、执行测试，并核对 APK 的实际签名是否匹配公开指纹。构建结束清理临时预览密钥，产物只包含 APK、校验和、发布说明和测试报告。

公开发布说明写入包名、版本代码、证书指纹与 `persistent` 或 `ephemeral` 模式，不写入密码、私钥内容或本机路径。App 对元数据的匹配只是基本兼容提示；安卓系统仍验证实际下载的安装包。

## 本地配置

仅在可信本机将独立预览密钥放到 `android/app/preview.keystore`，通过环境变量设置同名密码及别名。不要提交该文件，不把密码直接写入脚本或命令历史；正式密钥保持原样。

这是预览构建方案，不代表商店正式签名已准备好。正式上架还需要开发者账号、隐私材料、权限说明与商店要求的安装包和验收。

参考：[Android 官方签名与密钥说明](https://developer.android.com/studio/publish/app-signing)，[GitHub Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。

## Windows 私下准备与备份

仓库提供 `scripts/prepare-android-preview-signing.ps1`，只在得到所有者授权后运行：

```powershell
pwsh -File scripts/prepare-android-preview-signing.ps1
```

脚本在源码目录之外创建独立 RSA 3072 位预览密钥，只允许当前 Windows 用户与系统访问。密码使用当前用户的 Windows DPAPI 加密保存，命令参数和输出不含明文密码或私钥。默认另建一份同机备份；已有密钥不会自动替换，备份冲突时停止。

这份 DPAPI 备份不是跨电脑通用的密码备份，也不能防止整个电脑损坏。所有者仍需私下安排可恢复的离线加密备份，迁移 Windows 账户前先确认密码可恢复。不要把文件上传到公开仓库或聊天。

脚本不自动修改 GitHub 权限。将密钥和密码录入加密 Secrets 需要所有者的明确授权；别名和证书指纹才可录入普通 Variables。不要把三个秘密值误放入 Variables。
