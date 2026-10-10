# 项目状态 / 断点续做

> 长线项目。**每次开始工作前先读这个文件**，它记录当前进度和下一步。

## 一句话

奥特曼单集评级 App。移动端 Web App（PWA），简约扁平，先做交互模型，功能逐个加。

## 已确认的需求

| 项 | 内容 |
| --- | --- |
| 分级 | 神回 > 佳回 > 良回 > 平回 > 烂回 |
| 神回板块 | 旧平成（迪迦→赛罗）、新生代（赛罗至今） |
| 神回细分 | 神回顶 / 神回佳 / 神回守 |
| 剧集信息 | 简介、年份、演职人员 |
| 单集信息 | 名称、时长、编剧、导演 |
| 功能 | 搜索；按剧集水平排序（平成/新生代分开）；编剧导演查询入口（看某导演的全部单集） |
| 首页 | Radiohead 风格：左封面，右周边/舞台剧/剧照，下方或上方有入口 UI |
| 评分来源 | 70% IMDb + 30% 奥特曼吧讨论贴 |
| 首批范围 | 平成三杰（迪迦 52 / 戴拿 51 / 盖亚 51 = 154 集） |

## 进度

- [x] git 仓库
- [x] 数据源勘探（结果见下）
- [x] IMDb 逐集数据落地（评分/票数/编剧/导演/时长/集名）
- [x] 中文分集标题、官方时长、中文演职员、剧集简介
- [x] 人名映射表（罗马字 ↔ 中文）
- [x] 评级模型 v0.2（百分位分档，每剧各 14 集神回）
- [x] **App 工程脚手架（Vite + React + TS）**
- [x] 首页（Radiohead 风：左封面 / 右照片墙 / 下方信息条入口）
- [x] 剧集库 / 剧集详情 / 单集详情
- [x] 分级榜（含 神回顶/佳/守 三分档，平成与新生代分开）
- [x] 搜索（单集名 / 罗马字 / 剧名 / 编剧导演）
- [x] 编剧导演查询（列表 + 个人全部单集，按剧分组）
- [x] 评级口径页
- [x] 移动端布局体检工具（puppeteer-core，11 条路由 × 两种视口全绿）
- [x] **真实图片素材（154 张分集剧照 + 6 张官方海报）**

- [ ] 接入贴吧社区分（30% 权重）
- [ ] 新生代剧集数据（银河 → 奥美迦）
- [ ] PWA（manifest + service worker + 离线）
- [ ] 用户自己的评分/收藏（需要后端或本地存储）

## 图片素材管线（重要，别再踩坑）

**坑 1：Bilibili PGC 的分集 cover 是整季复用的同一张宣传图。**
实测迪迦 52 集的 `episodes[].cover` MD5 完全相同，`x/web-interface/view` 返回的 `pic` 也一样。
拿它当分集剧照会让所有缩略图长得一模一样。

**解法：走视频快照接口取真实帧。**
```
x/web-interface/view?bvid=<bvid>            → cid
x/player/videoshot?bvid=&cid=&index=1       → image[] 雪碧图（10 列 × 480×270）
```
再用 `tools/crop-stills.py`（Pillow）从雪碧图裁一帧。

**坑 2：修复版有左右黑边。** 原片是 4:3，B 站 HD 修复版是 16:9 带 pillarbox。
`crop-stills.py` 里的 `trim_black()` 逐列看平均亮度自动裁掉黑边，再按 4:3 出 480×360。

产物：`public/img/<series>/ep/<nn>.webp`（154 张，合计约 1.6 MB）

| 脚本 | 作用 |
| --- | --- |
| `tools/fetch-images.mjs` | 下载官方海报 + 方图（B 站图床 `@440w_586h_1c.webp` 后缀压缩，原图 389KB → 8.8KB） |
| `tools/fetch-videoshot.mjs` | 取全部 cid + 雪碧图，下载到 `.cache/videoshot/`（约 86 MB，可删，删了会重下） |
| `tools/crop-stills.py` | 从雪碧图裁帧、去黑边、出 480×360 webp |
| `tools/contact-sheet.py` | 把一批图拼成一张总览图，**一次性检查素材质量**（省 token） |
| `tools/fetch-design.mjs` | 搜罗设计稿类视频封面作候选 |

## 首页设计稿墙（2×2）

官方海报旁边那 4 格是**设计稿**（不是剧照），配置在 `data/curated/designs.json`。
没有配置设计稿的剧集会自动退回用分集剧照填满同样 4 格，所以新增剧集不用改代码。

**坑 3：`fetch-design.mjs` 一开始用序号命名候选文件。**
搜索结果按播放量排序，**每次重跑顺序都会浮动**，序号一变就再也对不上是哪张图，溯源直接丢失。
现在改成用 bvid 命名（`BV1GAu163Edp` → `1GAu163Edp.webp`），manifest 里也记了 bvid/标题/播放量。

**坑 4：B 站视频封面大多是带大标题的推广图。**
搜索出来的 40 张候选里真正干净的设计稿只有 4–6 张。判断流程必须是：
`contact-sheet.py` 出总览图 → **挑出疑似干净的做一张更高分辨率的复选图** → 才敢定稿。
在 170px 的小格子里看不清文字叠加，容易误判（我第一轮就选错了一半）。

当前 12 张（每剧 4 张）的定位：
- 迪迦：皮套变体 / 头部设定 / 全身线稿 / 计时器细部
- 戴拿：皮套展示 / 头部设定 / 设定资料 / 原型雕塑
- 盖亚：版本对比 / 双人线稿 / 设定画集 / 细节渲染

⚠️ 这些是视频封面，不是原始设定画扫描件，部分带少量标题文字。
作为 App 内的资料展示够用；若要印刷级设定稿，需另找圆谷官方画集的正版图源。


## 怎么跑

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 构建（tsc + vite）
npm run preview    # 预览构建产物
npm run data       # 改完 tier-config.json 后重算分档
npm run check      # 移动端布局体检（需先 preview）
```

## 验证能力（重要）

`tools/visual-check.mjs` 用系统 Chrome 做真实浏览器验证：
- 逐路由检查 `documentElement.scrollWidth > clientWidth`（横向溢出）
- 列出所有越界元素，并跳过 SVG 内部图形与可滚动祖先内的合法溢出
- 逐路由截图到 `.cache/shots/`

**不要再用 `chrome --window-size` + `--force-device-scale-factor` 截图**：那套参数会产生内容被裁切的假象，
看起来像布局 Bug 但其实没有。用 `npm run check`。

## 数据源勘探结论（重要，别再重复试错）

| 源 | 状态 | 说明 |
| --- | --- | --- |
| **IMDb 官方数据集** | ✅ 可用 | `datasets.imdbws.com`。已全部下载到 `.cache/`，抽好的结果是 `data/raw/imdb-heisei3.json` |
| **Bilibili PGC API** | ✅ 可用 | 需先访问首页拿 `buvid3` cookie。给中文分集标题、官方时长、中文演职员名单、剧集简介 |
| 维基百科 | ❌ 不可用 | SNI 层封锁 + DNS 污染（解析到 31.13.73.9）。真实 IP 强连也超时。**用户可开 VPN，开了就能用** |
| Fandom / 萌娘 / 百度百科 | ❌ 403 | 反爬 |
| 豆瓣 | ❌ 不可用 | 跳转 `sec.douban.com` 人机校验 |
| 贴吧 / 微博 | ❌ 不可用 | 需登录 cookie |
| dumps.wikimedia.org | ✅ 可用 | 唯一可达的维基域名（备用，未使用） |

## 防死机规范（必须遵守）

1. **不要重复解压 IMDb 大文件。** `.cache/` 里 `title.akas` 493MB + `name.basics` 297MB + `title.basics` 218MB，streaming gunzip 会吃大量内存。提取结果已落盘为 `data/raw/imdb-heisei3.json`（96KB），**构建流程只读这个小文件**。
2. 所有 Node 脚本必须带 `--max-old-space-size`（已写进 `package.json` scripts）。
3. **重活串行，绝不并行。** 上一轮死机就是同时跑多个大文件解压 + npm install。
4. `data:imdb` 这个 script 只在需要新增剧集时才跑，跑的时候不要做别的事。

## 评级模型 v0.2

配置全在 `data/curated/tier-config.json`，改它就能改全站分档。

- **排序**用 IMDb：贝叶斯票数收缩（先验 25）→ `z = 0.3 × zAbs(时代板块) + 0.7 × zRel(本剧)` → `score = 55 + 12z`
  - `zRel` 权重高，是为了抵消 IMDb 各部投票人群偏差（三部均分 7.28 / 8.48 / 7.74）
- **分档**用百分位（`tierMode: "percentile"`, `tierScope: "series"`）：
  - 每部剧各自取前 27% 为神回 → 每剧 14 集，三剧共 42 集
  - 神回顶 前 5%（每剧 3 集）、神回佳 前 13%、神回守 前 27%
  - 佳回 27~48%、良回 48~72%、平回 72~92%、烂回 末 8%

**为什么分档按剧内百分位**：「神回」本质是剧内概念，一部剧有多少集就有对应比例的神回；若按时代板块混排，戴拿会因均分高吃光名额（实测 25:6）。

## 变更分档口径的方法

改 `data/curated/tier-config.json` 里的 `cumShare`，然后 `npm run data`。

## 关键文件

| 路径 | 说明 |
| --- | --- |
| `data/dist/dataset.json` | **App 唯一数据源**（构建产物，232KB） |
| `data/curated/tier-config.json` | 评级口径配置 |
| `data/curated/name-map.json` | 人名映射（罗马字↔中文），含 confidence 标记 |
| `data/raw/imdb-heisei3.json` | IMDb 提取结果（154 集） |
| `data/raw/bili-*.json` | Bilibili 原始返回 |
| `tools/imdb-extract.mjs` | IMDb 数据集抽取器（重活，少跑） |
| `tools/bili-fetch.mjs` | Bilibili 抓取器 |
| `tools/build-dataset.mjs` | 合并 + 评级（轻活，随便跑） |

## 数据已知问题

- 11 集缺编剧、5 集缺导演（IMDb 本身没有），映射表里 `confidence: low` 的项职能归属可疑
- 戴拿部分集数 IMDb 只有 7~10 票，评分噪声大（已用贝叶斯收缩缓解）
- 贴吧社区分（30% 权重）**尚未接入**，App 需标注「社区评分待补」
- IMDb 时长是 30 分钟（含广告时段），Bilibili 是 24 分钟（正片），App 用 Bilibili 的
