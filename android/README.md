# 小票来了 Android v1.0.3

Android WebView 应用，网页资源随安装包一起分发，不依赖预览服务器。开单、打印和票据数据可离线使用；手动检查版本更新时会连接 GitHub Releases。

## 版本

- App 名称：小票来了
- `applicationId`：`com.luminshot.piao`（上架包名，后续更新不要更改）
- `versionName`：1.0.3；`versionCode`：4
- 最低 Android：8.0（API 26）
- 编译 API：37；目标 API：36

## 构建

需要 Android Studio（JDK 17 或更高版本）和 Android SDK Platform 37 / Build-Tools 36；工程采用 AGP 9.5.1 与 Gradle Wrapper 9.6.0。

- 调试包：在本目录运行 `./gradlew :app:assembleDebug`，产物为 `app/build/outputs/apk/debug/app-debug.apk`。
- 上架包：运行 `./build-release.sh`，会从 macOS 钥匙串读取签名并生成已签名 APK 与 AAB，分别位于 `app/build/outputs/apk/release/app-release.apk` 和 `app/build/outputs/bundle/release/app-release.aab`。

发布私钥保存在本机 `~/.android/keystores/com.luminshot.piao-release.p12`，密码存于 macOS 钥匙串服务 `com.luminshot.piao.release-signing`。请安全备份私钥和钥匙串密码；不要把它们提交到代码仓库或发给他人。丢失签名后，不能用同一密钥签发后续 APK。

## 数据与文件

- 首次安装会建立独立的本地数据；网页浏览器中的数据不会自动搬过来。先在网页版“设置”里导出备份，再在 App 中恢复。
- Android 使用系统文件选择器导入 JSON 备份；PNG 和 JSON 导出可选保存位置，PNG 分享会打开系统分享面板。
- 仅用于手动检查 GitHub 版本更新的网络权限；票据数据留在设备本地。系统备份关闭，跨设备迁移请用应用内备份文件。
