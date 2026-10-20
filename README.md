# 景序电竞三角洲趣味

一个可以免费部署的三角洲趣味单平台。主页用于选择不同玩法，目前首个可用趣味单为“护航大富翁”，支持管理员创建房间、自动生成随机棋盘、逐格编辑规则、玩家凭房间码加入、三轮行动和护航条款结算。

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

匿名登录只用于区分普通玩家，不会要求玩家填写邮箱和密码。管理员使用单独的邮箱和密码登录。

### 创建管理员账号

1. 在 Supabase 左侧打开 `Authentication` → `Users`。
2. 点击 `Add user` → `Create new user`。
3. 输入你自己的管理员邮箱和密码，并确认创建。
4. 回到 `SQL Editor`，新建一条查询，粘贴下面的内容。
5. 把示例邮箱替换成刚才创建账号时使用的真实邮箱，然后点击 `Run`。

```sql
insert into public.app_admins(user_id)
select id from auth.users
where email = '你的管理员邮箱'
on conflict (user_id) do nothing;
```

看到 `Success` 后，该账号才能进入网站的“管理员入口”。管理员不占房间的 3 个玩家名额。

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

大富翁入口显示“在线房间”即代表配置已生效。测试时先从“管理员入口”创建房间，再使用普通窗口和无痕窗口分别以玩家身份加入同一个房间。

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
- 只有管理员可以创建、开始和手动结束房间；管理员可以查看每个房间的玩家与完整掷骰记录。
- 在线房至少需要 1 名老板和 1 名打手，所有玩家准备后，管理员才能开始；本机试玩允许单人直接体验。
- 第一轮为 8 格，只允许轻量规则：最多前进或后退 2 格、暂停 1 次、增减 1 次掷骰，并包含概率晋级与直接晋级格。
- 第二轮为 12 格，移动范围扩大到 3 格，暂停与增减掷骰最多 2 次，同样包含概率晋级与直接晋级格。
- 第三轮为 24 格，移动范围扩大到 5 格，包含更多终局条款、暂停和掷骰变化，并且必须保留至少一个结束格。
- 每轮至少保留一个空格。移动格只改变最终位置，不会连续触发目标位置的第二个效果，避免规则循环。
- 管理员可分别设置第一轮和第二轮的晋级判定概率；只有落到“按概率进入下一轮”的格子才会使用该概率。
- 每次落格只结算一种实际效果；暂停、移动、保障值或增减掷骰不会额外触发晋级。
- 每人初始保障值为 100，触发加码或补偿条款后累加。
- 第三轮有人触发结束格时自动结算；管理员也可以手动结束本局。
- 玩家主动退出会从房间移除，但不会关闭管理员创建的房间。
- 掷骰、移动、暂停、额外次数和保障值均在数据库函数中计算，浏览器不能直接修改游戏结果。

## 管理员创建房间流程

1. 进入“管理员入口”，使用已加入白名单的邮箱和密码登录。
2. 输入 1–24 个字符的房间名，再点击“创建”。系统会从三个独立规则池中抽取并随机排布 8、12、24 个格子，每个房间都会保存自己的棋盘。
3. 玩家凭 6 位房间码加入后，在“回合设置”中选择谁先掷骰，并设置每回合连续掷骰 1–5 次。
4. 需要换一套棋盘时点击“重新随机全部三轮”。
5. 需要精调时切换第一轮、第二轮或第三轮，选择某个格子，修改名称、分类、说明、实际效果和效果数值，然后保存。
6. 后端会限制每轮可用效果的范围，并强制每轮保留空格、第三轮保留结束格。
7. 所有玩家准备后点击“开始房间”。开局后棋盘和回合配置会锁定，管理员仍可查看实时记录或手动结束。
8. 不再需要的房间可以在房间详情右上角删除。确认后会同时清理该房间的玩家、棋盘和行动记录，无法恢复。

如果 Supabase 项目已经初始化过，更新到本规则后需要再次在 `SQL Editor` 中完整执行 [supabase/schema.sql](./supabase/schema.sql)。脚本可以重复执行，会更新数据表、权限与游戏函数，不需要删除已有项目。执行完成后，还要按照上面的“创建管理员账号”步骤把管理员加入白名单。

## 常见问题

### 大富翁入口显示“本机试玩”而不是“在线房间”

确认环境变量名称完全一致，并在修改 `.env.local` 后重启开发服务器。Vercel 中修改环境变量后需要重新部署。

### 加入房间时报匿名登录错误

进入 Supabase 的 `Authentication` → `Providers`，确认 `Anonymous Sign-Ins` 已启用。

### 管理员登录后提示“不在管理员白名单”

确认你已经在 `Authentication` → `Users` 创建了邮箱账号，并在 `SQL Editor` 执行过“创建管理员账号”章节中的 SQL。SQL 中的邮箱必须与登录邮箱完全一致。

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
