# 奥特曼单集评级

> 特摄剧《奥特曼》系列的单集评级 App。移动端 Web App（PWA），简约扁平设计。
> **当前阶段：平成三杰的完整可交互模型已跑通。**

## 🔗 线上地址

**https://ziggystardust928.github.io/ultraman-tier/**

手机浏览器打开 → 菜单里选「添加到主屏幕」。装好后是独立窗口的 App，**离线也能用**。

- 仓库：https://github.com/ziggystardust928/ultraman-tier
- push 到 `main` 会自动触发 GitHub Actions 构建并部署（`.github/workflows/deploy.yml`）

## 现在能做什么

| 功能 | 状态 |
| --- | --- |
| 首页（左封面 / 右剧照墙，下方入口条） | ✅ |
| 剧集库（旧平成 / 新生代分栏） | ✅ |
| 剧集详情（简介、年份、演职人员、分集表） | ✅ |
| 单集详情（剧照头图、名称、时长、编剧、导演、评分明细） | ✅ |
| 分级榜（神回 / 佳回 / 良回 / 平回 / 烂回，带缩略图） | ✅ |
| 神回三分档（神回顶 / 神回佳 / 神回守） | ✅ |
| 搜索（单集 / 剧名 / 编剧 / 导演） | ✅ |
| 编剧导演查询（按人查看全部单集） | ✅ |
| 评级口径页 | ✅ |
| 真实图片素材（154 张分集剧照 + 官方海报 + 12 张设计稿） | ✅ |
| 单集元数据（首播日期 / 登场怪兽 / 收视率） | ✅ |
| PWA（离线可用、可加到主屏） | ✅ |
| 贴吧社区分（30% 权重） | ⬜ 待接入 |
| 新生代剧集（银河 → 奥美迦） | ⬜ 待录入 |

## 数据

**154 集**（迪迦 52 / 戴拿 51 / 盖亚 51），**39 位**编剧导演，逐集都有中文标题、正片时长、编剧、导演、IMDb 评分与票数，以及**一张真实剧照**。

| 来源 | 用到什么 |
| --- | --- |
| [IMDb 官方数据集](https://datasets.imdbws.com/) | 逐集评分、票数、编剧、导演、时长 |
| 哔哩哔哩番剧 PGC API | 官方中文分集标题、正片时长、中文演职员名单、剧集简介、官方海报 |
| 哔哩哔哩视频快照 API | 154 张**真实分集剧照**（从视频帧雪碧图裁出） |
| `data/curated/name-map.json` | IMDb 罗马字 ↔ 中日文姓名映射 |

图片全部本地化（`public/img/`，约 1.6 MB），App 不依赖任何外部图床。

> ⚠️ Bilibili 给整季复用了同一张宣传图当分集封面（实测迪迦 52 集的 MD5 完全相同）。
> 真实剧照是从 `x/player/videoshot` 的视频帧雪碧图里裁出来的，详见 [`docs/STATE.md`](docs/STATE.md)。

贴吧社区分需要登录态，尚未接入；当前分档为 IMDb 单一来源预评，App 内已标注。

## 评级口径

**IMDb 的真实评分决定谁排在前面，「多少集算神回」由可配置的比例决定。**

```
票数收缩 → z = 0.3 × zAbs(时代板块) + 0.7 × zRel(本剧) → score = 55 + 12z   ← 只用来排序
分档    → 每部剧各自取前 27% 为神回（顶 5% / 佳 13% / 守 27%）
```

`zRel` 权重更高，是为了抵消 IMDb 各部投票人群的差异——实测三部剧 IMDb 均分差 1.2 分
（迪迦 7.28 / 戴拿 8.48 / 盖亚 7.74），纯按绝对分会让神回几乎全判给戴拿。

全站分档都读 `data/curated/tier-config.json`，改比例后跑 `npm run data` 即可重算。

## 跑起来

```bash
npm install
npm run dev        # 开发服务器
npm run build      # tsc + vite 构建 + 生成 service worker
npm run serve      # 局域网服务（0.0.0.0:5181），手机可访问
npm run data       # 改完评级口径后重算数据集
npm run check      # 移动端布局体检（需先 serve）
npm run check:pwa  # PWA 体检：SW 注册、预缓存、离线渲染、离线深链接
```

部署到手机见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。**注意**：PWA 的 Service Worker
只在 HTTPS 或 localhost 下才能注册，局域网 HTTP 只能当网页用，装不了 App。

## 目录

```
data/
  curated/   评级口径配置、人名映射表          ← 手改这里
  raw/       IMDb / Bilibili / 快照抓取结果    ← 由 tools 生成
  dist/      dataset.json，App 唯一数据源      ← 由 tools 生成
public/img/  154 张分集剧照 + 官方海报        ← 由 tools 生成
src/
  data/      数据访问层与搜索
  components/ UI 组件 + 封面兜底艺术
  pages/     9 个页面
  styles/    设计令牌 / 布局 / 封面艺术
tools/
  imdb-extract.mjs     IMDb 官方数据集抽取器（重活，少跑）
  bili-fetch.mjs       Bilibili PGC 抓取器
  fetch-images.mjs     下载官方海报
  fetch-videoshot.mjs  取视频帧雪碧图
  crop-stills.py       裁出真实分集剧照（自动去黑边）
  contact-sheet.py     剧照总览图，一次性检查取帧质量
  build-dataset.mjs    合并 + 评级（轻活）
  visual-check.mjs     真实浏览器布局体检 + 截图
docs/STATE.md          断点续做状态、数据源勘探结论、防死机规范
```

## 工程约定

- **先读 [`docs/STATE.md`](docs/STATE.md)**，里面有数据源可用性结论和防死机规范
- 长线项目，一个功能一个提交
- 重活串行，Node 脚本带 `--max-old-space-size`
- UI 改动后用 `npm run check` 做真实浏览器验证
