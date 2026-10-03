# 原生安卓预览版

版本 `1.8.2-preview`，包名 `com.richangyu.lifeworkbench.preview`。首页、打卡、记录、日程和 AI 确认窗口由 Android 原生界面实现；网页组件仅承载授权会话。

首次打开填写自己的可信 HTTPS 工作台根地址。工程不内置个人服务器、AI 密钥、账号、账本或正式签名；后端需要 `/mobile-connect`、`/api/mobile` 和 `/api/assistant`。授权后读取成功才返回原生页面。

## 构建

准备 JDK 17 与 Android SDK 36，设置 `ANDROID_HOME` 或本地 `local.properties`（不得提交）。

```bash
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug --console=plain
```

Windows 使用 `gradlew.bat`。若中文工作路径导致测试类加载失败，可复制不含签名和网页资产的原生源码至英文隔离目录构建，不删除或跳过检查。APK 输出 `app/build/outputs/apk/debug/app-debug.apk`。公开 CI 独立编译安卓工程，不需要根目录 npm/Capacitor。

最低声明 API 22、编译和目标 API 36，不代表所有设备已实测。

## 验证边界

本地隔离构建通过 9 项单元测试、APK 编译和 Android Debug 签名验证。公开工程及预览发布以独立 CI 结果为准。真机安装、授权、键盘布局、AI 写入、同步和更新均待实测。

预览使用开发签名，CI 和本机签名可能不同，不能保证互相覆盖更新。不要为绕过签名冲突删除未同步数据。正式版需稳定签名、本地保密密码配置及商店账号，不能上传 keystore 或在聊天中填写密码。

图标和启动图暂为生成模板，正式商店素材待替换和验收。Gradle Wrapper 遵循 Apache-2.0；保留模板资源不代表本项目拥有其来源组件商标。
