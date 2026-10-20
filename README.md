# 景序电竞三角洲趣味

一个可以免费部署的三角洲趣味单平台。主页用于选择不同玩法，目前首个可用趣味单为“护航大富翁”，支持创建房间、输入房间码加入、固定身份席位、玩家准备、轮流掷骰、护航条款和两圈结算。

未配置 Supabase 时仍可使用“本机试玩”完整体验大富翁，但在线房间需要完成下面的 Supabase 配置。

## 本地运行

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run dev
```

浏览器打开终端显示的地址，通常是 `http://localhost:5173`。

## 第一步：创建免费 Supabase 后端

1. 打开 [Supabase](https://supabase.com/) 并登录。
2. 点击 `New project`，创建一个免费项目，并妥善保存数据库密码。
3. 项目初始化完成后，打开左侧 `SQL Editor`。
4. 点击 `New query`，粘贴 [supabase/schema.sql](./supabase/schema.sql) 的全部内容。
5. 点击 `Run`。看到 `Success` 后，数据表、权限和游戏函数就创建完成了。
6. 打开 `Authentication` → `Providers` → `Anonymous Sign-Ins`，启用匿名登录并保存。

匿名登录只用于区分房间玩家，不会要求玩家填写邮箱和密码。

## 第二步：取得环境变量

在 Supabase 项目中打开 `Project Settings` → `API Keys`，找到：

- `Project URL`
- `Publishable key`（旧版界面可能显示为 `anon public` key）

在项目根目录复制一份 `.env.example`，命名为 `.env.local`，填入真实值：

```env
VITE_SUPABASE_URL=https://你的项目编号.supabase.co
VITE_SUPABASE_ANON_KEY=你的公开匿名密钥
```

不要把 `.env.local` 提交到 Git。Supabase 的 publishable/anon key 可以放在前端，但绝不能把 `service_role` 或 secret key 放进网页或 Vercel。

完成后重新运行：

```powershell
npm run dev
```

大富翁入口显示“在线房间”即代表配置已生效。建议打开一个普通窗口和一个无痕窗口，分别创建和加入同一个房间，测试实时同步。

## 第三步：推送到 GitHub

项目仓库为 [zzw1996123456/JXDJ](https://github.com/zzw1996123456/JXDJ)。后续修改使用：

```powershell
git add .
git commit -m "Describe the update"
git push
```

执行 `git status`，确认 `.env.local` 没有出现在待提交文件中。

## 第四步：免费部署到 Vercel

1. 打开 [Vercel](https://vercel.com/) 并使用 GitHub 登录。
2. 点击 `Add New...` → `Project`。
3. 选择 `JXDJ` 仓库并点击 `Import`。
4. Framework Preset 保持 `Vite`，构建命令保持 `npm run build`，输出目录保持 `dist`。
5. 展开 `Environment Variables`，添加：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. 点击 `Deploy`。

部署完成后会得到类似 `https://你的项目名.vercel.app` 的免费网址。把网址发给其他玩家，他们不需要安装任何软件。

## 当前大富翁规则

- 每间在线房最多 3 人，固定为 1 个老板席和最多 2 个打手席。
- 在线房至少需要 1 名老板和 1 名打手，所有人准备后才能开始；本机试玩允许单人直接体验。
- 20 个身份权益格按老板 12 格、打手 8 格分配，即老板权益 60%、打手权益 40%；另外有 4 个公共流程节点。
- 老板格负责保底、指定物资、行动路线、撤离时机和任务目标；打手格负责装备档位、稳健打法、战术改判、超时与连败补偿。
- 两名打手满编时各占 20% 权益；只有一名打手时独享打手席的 40%。
- 每人初始保障值为 100，触发加码或补偿条款后累加；每完成一圈额外增加 20 保障值。
- 率先走完 2 圈后结束推演并生成本局护航协议。
- 玩家主动退出会从房间移除；房主退出会关闭该房间。
- 掷骰、轮次和保障值均在数据库函数中计算，浏览器不能直接修改游戏结果。

如果 Supabase 项目已经初始化过，更新到本规则后需要再次在 `SQL Editor` 中完整执行 [supabase/schema.sql](./supabase/schema.sql)。脚本可以重复执行，会替换房间与掷骰函数，不需要删除已有项目。

## 常见问题

### 大富翁入口显示“本机试玩”而不是“在线房间”

确认环境变量名称完全一致，并在修改 `.env.local` 后重启开发服务器。Vercel 中修改环境变量后需要重新部署。

### 创建房间时报匿名登录错误

进入 Supabase 的 `Authentication` → `Providers`，确认 `Anonymous Sign-Ins` 已启用。

### 两个窗口被识别成同一个玩家

同一浏览器的普通标签页会共享匿名登录状态。联机测试时请使用不同浏览器，或一个普通窗口加一个无痕窗口。

### 国内访问速度不稳定

Vercel 和 Supabase 的免费节点通常位于境外，适合原型测试，但中国大陆访问质量无法保证。正式面向大量国内用户时，需要迁移到有备案条件的国内云服务。

## 技术栈

- React + TypeScript + Vite
- Supabase Auth、PostgreSQL、Realtime
- Vercel 静态部署
- Lucide 图标

本项目为非官方同人原型，不包含游戏素材、账号托管或真实支付。
