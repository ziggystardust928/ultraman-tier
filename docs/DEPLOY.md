# 部署：让手机真正用上

> 当前状态：本机已起服务，监听 `0.0.0.0:5181`。
> 局域网地址 **http://192.168.1.4:5181/**

## ⚠️ 先看这条：HTTP 和 HTTPS 的区别

PWA 的 Service Worker **只在安全上下文里注册**（HTTPS，或 localhost）。这直接决定手机上能不能"装"：

| 访问方式 | 能打开网页 | 能离线用 | 能加到主屏当 App |
| --- | --- | --- | --- |
| `http://192.168.1.4:5181`（局域网 HTTP） | ✅ | ❌ 浏览器拒绝注册 SW | ⚠️ iOS 可以（走 apple-touch-icon），安卓不行 |
| `https://xxx.pages.dev`（静态托管 HTTPS） | ✅ | ✅ | ✅ 完整 PWA |

**想要真正的"App"体验，必须走 HTTPS。** 局域网 HTTP 只能算"能用网页"。

---

## 方案 A：局域网访问（最快，但只有网页）

### 1. 放行防火墙（需要管理员）

我当前不是管理员，加不了规则（已实测被拒）。请用**管理员身份**打开 PowerShell，跑一次：

```powershell
New-NetFirewallRule -DisplayName "Ultraman Tier (LAN 5181)" `
  -Direction Inbound -Protocol TCP -LocalPort 5181 -Action Allow -Profile Private
```

删掉规则：

```powershell
Remove-NetFirewallRule -DisplayName "Ultraman Tier (LAN 5181)"
```

### 2. 确保服务在跑

```bash
npm run build
npm run serve          # = vite preview --host 0.0.0.0 --port 5181
```

### 3. 手机打开

手机连**同一个 Wi-Fi**，浏览器访问：

```
http://192.168.1.4:5181/
```

> 本机有两个 IP：`192.168.1.4`（以太网，DHCP）和 `172.19.83.237`（以太网 2，手动）。
> 手机走家里路由器就用 `192.168.1.4`。IP 变了用 `ipconfig` 重新查。

---

## 方案 B：静态托管（推荐，有完整 PWA）

这个 App 是**纯静态**的，而且用 HashRouter + 相对路径 base，
**部署到任何静态托管都不需要额外配置，也不需要 URL 重写规则**——
包括子路径（比如 GitHub Pages 的 `/repo-name/`）。

### 产物

`npm run build` 之后，把 **`dist/` 整个目录**传上去就行。

已经打包好一份可直接拖拽上传的 zip：`dist.zip`（在仓库根目录）。

### 常见托管

| 平台 | 操作 | 备注 |
| --- | --- | --- |
| **Cloudflare Pages** | 拖 `dist` 目录上传 | 免费 HTTPS，国内访问相对稳 |
| **Netlify** | 拖拽 `dist` 到 app.netlify.com/drop | 需登录 |
| **Vercel** | `npx vercel deploy --prod dist` | 需登录 |
| **GitHub Pages** | 推仓库 → Settings → Pages → 选分支+目录 | 子路径也能用，因为 base 是相对的 |

### 上传后

手机打开 `https://<你的域名>/`，浏览器菜单里选「添加到主屏幕」。
之后它就是一个独立窗口的 App，**离线也能开**（应用外壳和封面已预缓存，
看过的分集剧照也会缓存下来）。

---

## 方案 C：只想临时给手机看（不装 PWA）

用隧道工具，装一个就行：

```bash
npx cloudflared tunnel --url http://127.0.0.1:5181
```

它会给出一个 `https://xxx.trycloudflare.com` 地址，**是 HTTPS，所以 PWA 也能用**。
缺点是每次重启地址都变。

---

## 缓存策略（PWA 内部实现）

由 `tools/gen-sw.mjs` 在构建后生成 `dist/sw.js`：

- **预缓存 27 项**：HTML / JS / CSS / 图标 / manifest / 官方海报 / 设计稿
  → 离线时应用能完整打开
- **运行时缓存**：`img/*/ep/*` 的 154 张分集剧照按需缓存
  → 避免首次安装就下 1.6 MB（大部分用户不会翻完所有剧集）
- **版本号**：所有文件路径+大小的哈希。内容一变版本就变，旧缓存自动清理
- 页面导航用「网络优先 + 离线回退到缓存外壳」，其余用「缓存优先」

验证脚本：`npm run check:pwa`（真实浏览器里测 SW 注册、预缓存、离线渲染、离线深链接）
