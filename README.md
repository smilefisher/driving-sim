# 新手驾驶模拟器

一个给零基础新手的 **Web 3D 驾驶教学模拟器**：不是赛车游戏，而是把「上车准备 → 起步 → 直线行驶 → 靠边停车」拆成可检查的小步骤，漏一步车就不动，离合抬过头就熄火。

纯前端静态站点，无后端、无账号、无需数据库，构建产物可以直接丢到任何静态托管。

---

## 课程内容

| 课程 | 内容 | 关键判定 |
| --- | --- | --- |
| 第 1 课 · 上车准备 | 绕车检查 → 上车 → 调座椅 → 调三镜 → 系安全带 | 没做完无法进入下一步 |
| 第 2 课 · 起步 | 踩离合 → 点火 → 挂一挡 → 打左灯 → 松手刹 → **找半联动** → 补油 → 车速到 10km/h 再松完 | 抬过头熄火、不踩离合挂挡打齿 |
| 第 3 课 · 直线行驶与加减挡 | 保持车道、升二挡、升三挡、减速退挡、停稳挂空挡拉手刹 | 压线、拖挡、刹停前不踩离合会熄火 |
| 第 4 课 · 靠边停车 | 打右灯 → 减速 → 靠边 60cm 内 → 停稳 → 空挡手刹 → 熄火解带 | 距路缘超过 60cm 不合格 |
| 综合考核 | 起步 + 直行 + 靠边停车，**无步骤提示** | 100 分制，扣分项逐条列出 |

手动挡（C1）与自动挡（C2）各有一套课程。手动挡专门做了一套**离合半联动**模型，这是新手最容易熄火的地方。

## 操作

| 按键 | 作用 | 按键 | 作用 |
| --- | --- | --- | --- |
| `W` / `↑` | 油门 | `Z` | 踩离合（按住） |
| `S` / `↓` | 刹车 | `X` | 抬离合（按住） |
| `A` `D` / `←` `→` | 方向盘 | `空格` | 手刹 |
| `1`~`5` | 挂挡 | `0` | 空挡 |
| `R` | 倒挡 | `I` | 点火 / 熄火 |
| `Q` / `E` | 左 / 右转向灯 | `B` | 安全带 |
| `F` | 上 / 下车 | `G` | 绕车检查 |
| `M` | 调后视镜 | `[` `]` | 调座椅 |
| `C` | 切换驾驶舱 / 俯视视角 | `H` | 键位说明 |

手机端会自动显示屏幕按键。离合做成「按住踩、按住抬、松手保持」，就是为了能抬到半联动停住。

也可以直接用链接打开某一课：`?gb=manual&lesson=launch`（`lesson` 取 `prep` / `launch` / `straight` / `park` / `exam`）。

## 本地运行

需要 Node 18+。

```bash
pnpm install
pnpm dev        # 开发：esbuild watch + 本地静态服务
pnpm build      # 构建到 dist/
pnpm preview    # 预览 dist/（默认 127.0.0.1:4173）
pnpm test       # 端到端验证：用"虚拟学员"把每一课跑一遍
pnpm typecheck  # TypeScript 类型检查
```

> `pnpm test` 是这个项目最重要的一道保险：它会在 Node 里模拟一个学员按步骤操作，验证每一课**真的能过**，并验证"不踩离合挂挡 / 猛抬离合 / 忘松手刹"这些错误操作**真的会出问题**。改完课程或物理参数，跑一遍它。

## 部署到 Cloudflare Pages

### 方式 A：GitHub 仓库直连 Cloudflare Pages（最简单，推荐）

1. 在 GitHub 新建仓库并推送本项目（见下方「发布到 GitHub」）。
2. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择这个仓库，构建设置填：
   - **Framework preset**：`None`
   - **Build command**：`pnpm build`
   - **Build output directory**：`dist`
   - **环境变量**：`NODE_VERSION` = `20`（如果 Cloudflare 默认 Node 版本过老时加）
4. 保存后每次 push 到 `main` 自动部署，会得到一个 `xxx.pages.dev` 的域名。

小提示：Cloudflare 会读取 `dist/_headers`，那里已经配好了静态资源长缓存和安全响应头。

### 方式 B：GitHub Actions 构建并上传

仓库里已经带了 `.github/workflows/deploy.yml`，推到 `main` 就会自动构建 + 验证 + 部署。需要在 GitHub 仓库里配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare 「My Profile → API Tokens」创建，权限至少 `Cloudflare Pages: Edit` |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 首页右侧的 Account ID |
| Variable（可选） | `CLOUDFLARE_PROJECT_NAME` | Pages 项目名，默认 `driving-sim` |

先在 Cloudflare 上建一个名为 `driving-sim`（或你自定义的名字）的 Pages 项目，再启用这个 workflow。两种方式任选其一即可，不要同时用，否则会互相覆盖部署。

### 发布到 GitHub

```bash
cd driving-sim
git init
git add .
git commit -m "feat: 新手驾驶模拟器"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

## 技术实现

### 1. 车辆模型：简化传动链，而不是真实物理引擎

真实物理引擎对"教学"是负担（容易翻车、性能差），所以纵向用的是**扭矩链**模型：

```
轮速rpm = v / (2πR) × 60 × 挡位比 × 主减速比      R = 0.32m，主减 = 4.0
rpm     = 空转rpm − (空转rpm − 轮速rpm) × 结合度    ← 离合抬一半，转速掉一半
驱动力  = 扭矩(rpm, 油门) × 挡位比 × 主减 × 结合度 × 0.92 / R
阻力    = 滚阻 184N + 风阻 0.36v² + 制动力
熄火    = 在挡 且 结合度 > 0.85 且 rpm < 470（持续 0.5 秒宽限）
```

关键点：**完全结合时 rpm 就等于轮速换算值**。所以车速不到 10km/h 就把离合松完，转速会被拖到 0 —— 这正好是真车熄火的原因，教学价值就在这里，而不是弹个提示框。

横向是自行车模型：`yaw = −(v / 轴距) × tan(前轮转角)`。

自动挡用液力变矩器模型：静止挂 D 踩刹车时发动机仍能怠速，不会熄火。

### 2. 教学引擎：每一步就是一个布尔谓词

```ts
interface Step {
  id: string;
  title: string;
  detail: string;
  check(ctx): boolean;        // 完成条件，每帧求值
  hint?(ctx): string;         // 卡住时的实时提示："再抬一点，看到转速下降就停住"
}
```

引擎每帧只求值当前这一步，通过就前进。好处：步骤可以任意细（"踩离合"、"找半联动"、"顶住补油"、"松完"各算一步），加课程只写数据、不改引擎。

### 3. 渲染：程序化低多边形，零美术资源

- three.js 场景全部由代码生成：路面、边线、路缘石、库位、锥桶、树、楼、路灯。
- 驾驶舱：仪表台、会随方向盘转动的方向盘、随挡位动的挡杆、三个会动的踏板。
- **三个后视镜是真的在渲染**：`WebGLRenderTarget` + 三台独立摄像机，内饰和镜面单独放在 `layer 1`，镜内摄像机只渲染 `layer 0`，避免"镜子里出现镜子"的无限递归。
- 车内后视镜挂在风挡上方（真实位置）；左右外后视镜做成驾驶舱视角左右下角的镜面挂件——真实车门镜在 55° 侧后方，正常坐姿根本看不见，但画面仍然来自真实镜位的摄像机。
- 图层分工：世界 `0` / 驾驶舱内饰 `1` / 车外观 `2`，驾驶舱视角隐藏车壳，俯视视角隐藏内饰。

### 4. UI

React 只负责覆盖层（HUD、步骤面板、成绩单、触屏按键），3D 循环完全独立；`Game` 每帧算一个快照，React 以约 14Hz 取一次，避免 React 拖慢渲染。

## 目录结构

```
driving-sim/
├─ index.html                 # 开发入口（构建时由 scripts/build.mjs 生成 dist/index.html）
├─ public/
│  ├─ favicon.svg
│  └─ _headers                # Cloudflare Pages 响应头
├─ scripts/
│  ├─ build.mjs               # esbuild 打包 → dist/
│  ├─ dev.mjs                 # watch + 本地服务
│  ├─ serve.mjs               # 极简静态服务器
│  ├─ test.mjs                # 跑 flowtest
│  └─ flowtest.ts             # 虚拟学员端到端验证
├─ src/
│  ├─ main.tsx
│  ├─ game/
│  │  ├─ car.ts               # 车辆物理 + 离合/挡位状态机
│  │  ├─ carModel.ts          # 车外观 + 驾驶舱内饰
│  │  ├─ world.ts             # 程序化训练场
│  │  ├─ lessons.ts           # 课程数据 + 步骤判定 + 计分
│  │  ├─ game.ts              # 主循环、摄像机、后视镜、输入、规则
│  │  └─ types.ts
│  └─ ui/                     # React HUD / 菜单 / 成绩单 / 触屏控制
└─ .github/workflows/deploy.yml
```

## 已知限制

- 只有 3 个后视镜画面与 `layer 0` 世界，车身不会出现在镜子里（避免了自遮挡问题）。
- 倒车入库、侧方停车、路口通行还没做，首版聚焦"从零到能起步停车"。
- 手机端性能取决于设备，后视镜每帧三次额外渲染，低端机上可能掉帧。
