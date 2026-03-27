# GOODKIDS 公网发布说明

这个项目的正式上线结构是：

- GitHub：托管业务源码
- Vercel：承载前台、后台和 API
- Supabase：持久化队列数据
- Mintlify：单独承载文档站

## 1. GitHub

当前目录还没有 `.git`。如果你本机已经安装 `Git for Windows`，可以在当前项目目录执行：

```powershell
git init
git add .
git commit -m "chore: initial public deployment setup"
git branch -M main
git remote add origin https://github.com/<your-account>/goodkids-lineup-app.git
git push -u origin main
```

如果你本机没有安装 `git`，建议直接用 GitHub Desktop：

1. 在 GitHub 上创建空仓库 `goodkids-lineup-app`
2. 打开 GitHub Desktop
3. 选择 `File -> Add local repository`
4. 先把当前目录创建为本地仓库，再发布到 GitHub

注意：

- 不要提交真实 `.env`
- 当前仓库已经带了 `.gitignore`，会忽略 `.env`、`.vercel/`、日志文件

## 2. Supabase

1. 新建一个 Supabase 项目
2. 打开 SQL Editor
3. 执行 [supabase/schema.sql](./supabase/schema.sql)
4. 记录以下值：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## 3. Vercel

当前项目已经包含 [vercel.json](./vercel.json)，可以直接导入。

在 Vercel 里操作：

1. `New Project`
2. 选择 GitHub 仓库 `goodkids-lineup-app`
3. 导入后配置环境变量：

```text
ADMIN_PASSWORD=<你的后台密码>
SESSION_SECRET=<随机长字符串>
SERVICE_TIME_ZONE=Asia/Shanghai
SUPABASE_URL=<你的 Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<你的 Supabase Service Role Key>
```

4. 点击 Deploy

部署成功后默认地址类似：

- 前台：`https://<project>.vercel.app/`
- 后台：`https://<project>.vercel.app/manage`

后续更新流程：

1. 本地改代码
2. 提交并 push 到 GitHub
3. Vercel 自动重新部署

## 4. Mintlify

当前仓库内已经准备了一个可复用模板目录：[mintlify-docs](./mintlify-docs)

推荐做法：

1. 在 GitHub 新建单独仓库 `goodkids-lineup-docs`
2. 把 [mintlify-docs](./mintlify-docs) 目录里的内容复制到这个新仓库根目录
3. 去 `https://mintlify.com/start`
4. 连接 GitHub，并选择 `goodkids-lineup-docs`
5. 安装 Mintlify GitHub App
6. 完成 onboarding，获得默认地址：

```text
https://<docs-project>.mintlify.app
```

文档站只用于说明和入口跳转，不承载后台，也不要公开 `/manage`

## 5. 推荐域名结构

- 业务站：`app.yourdomain.com`
- 文档站：`docs.yourdomain.com`

如果暂时没有自定义域名，先直接使用：

- `*.vercel.app`
- `*.mintlify.app`
