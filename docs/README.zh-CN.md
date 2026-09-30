# pi-web-home

[English](../README.md) · **简体中文**

一个为 [pi](https://github.com/earendil-works/pi-coding-agent) 编码代理打造的 Web 界面。打开浏览器、添加项目目录，即可与 pi 对话——桌面电脑或家庭局域网内的其他设备（如手机）都能直接使用，全程无需打开终端。

```sh
npx pi-web-home    # 在 http://<服务器IP>:8319 提供界面
```

| 深色主题 | 浅色主题 |
| :---: | :---: |
| ![深色主题下的主界面](https://cdn.jsdelivr.net/gh/woxihejinghao/pi-web@main/docs/images/overview-dark.png) | ![浅色主题下的主界面](https://cdn.jsdelivr.net/gh/woxihejinghao/pi-web@main/docs/images/overview-light.png) |

## 功能

#### 项目与会话

- **一个目录 = 一个项目**：通过内置文件选择器添加任意本地目录，每个项目独立管理自己的会话。
- **多会话**：支持重命名、删除、按会话选择模型。
- **会话 fork 与话题树**：从任意消息分叉出新的工作线，不丢失原有上下文。
- **斜杠命令与技能补全**：pi 的命令、提示词模板与技能随输入自动补全。

#### 对话

- **实时流式输出**，支持 Markdown 与代码语法高亮。
- **图片输入**：粘贴或附加图片到提示词中。
- **打断追加（steer / follow-up）**：任务运行中随时转向或排队追加指令，无需等待。
- **实时性能指标状态栏**：轮次、步数、模型耗时、工具耗时、首字延迟（TTFT）与输出速率（tok/s），对齐 DeepSeek-Harness 风格，点击查看完整明细。
- **随时中断**正在运行的轮次。

#### 工作区侧栏

- **文件树**与项目目录内文件的快速预览。
- **Git 面板**：不离开界面即可暂存、提交、推送、还原、切换分支；工作区变更自动刷新。
- **任务清单跟踪**与**内嵌浏览器**。

#### 设置

- **提供方与模型**：管理 API Key 与模型条目，可直接从提供方拉取模型列表。
- **MCP 服务器**：添加、编辑、启停、重启 MCP 服务器。
- **插件**：查看与管理已安装的 pi 扩展。
- **外观**：深色 / 浅色 / 跟随系统主题、字号、对话显示与发送行为；界面支持中英文切换。

**性能指标**（源自 [pi-turn-metrics](https://github.com/leon-zym/pi-turn-metrics)）

- `轮次 · 步数`：会话的交互轮次与代理执行步数。
- `模型耗时 · 工具耗时`：分开显示，一眼分辨等待生成还是等待命令执行。
- `TTFT · tok/s`：平均首字延迟与解码吞吐速率。

## 环境要求

- Node.js `>= 22.19.0`
- 已安装 [pi](https://github.com/earendil-works/pi-coding-agent)，并配置至少一个模型提供方
- pnpm（仅从源码构建时需要）

## 部署

### 方式一：免安装运行

```sh
npx pi-web-home
```

### 方式二：全局安装

```sh
npm install -g pi-web-home
pi-web-home
```

### 方式三：systemd 系统服务（推荐，局域网常驻）

从源码构建并全局安装：

```sh
git clone https://github.com/wooxi/pi-web-home
cd pi-web-home
pnpm install && pnpm build && npm link
```

写入 `/etc/systemd/system/pi-web-home.service`：

```ini
[Unit]
Description=pi-web-home — pi coding agent web UI (home LAN)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=PI_WEB_HOME_OPEN=0
ExecStart=/usr/bin/pi-web-home
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now pi-web-home
```

服务开机自启、崩溃自动重启，不随终端关闭。

### 方式四：作为 pi 插件使用

```sh
pi install npm:pi-web-home
```

然后，在 pi 会话中：

```text
/web            # 启动界面（自动打开浏览器）
/web --no-open  # 启动但不打开浏览器
/web status     # 是否在运行？
/web stop       # 停止
```

## 配置项

所有环境变量均可选：

| 变量 | 默认值 | 说明 |
| :-- | :-- | :-- |
| `PI_WEB_HOME_PORT` | `8319` | HTTP 端口 |
| `PI_WEB_HOME_HOST` | `0.0.0.0` | 监听地址，设为 `127.0.0.1` 则仅本机可访问 |
| `PI_WEB_HOME_OPEN` | `1`（CLI） | 设 `0` 不自动打开浏览器 |
| `PI_WEB_HOME_IDLE_MS` | `600000` | 会话空闲回收时间（毫秒） |
| `PI_WEB_HOME_MAX_SESSIONS` | `8` | 并发会话进程上限 |
| `PI_WEB_HOME_SSE_BUFFER` | `4194304` | 单连接 SSE 缓冲上限（字节） |
| `PI_WEB_HOME_STATIC_DIR` | 自动 | 覆盖前端构建目录；留空则仅提供 API |
| `PI_WEB_HOME_HOME` | `~/.pi-web-home` | 数据目录根 |
| `PI_WEB_HOME_SESSION_DIR` | pi 默认 | 强制 pi 会话存储在该目录下 |

## 快速上手

1. 浏览器打开 `http://<服务器IP>:8319`。
2. 点左栏 **+**，在文件选择器中选中项目目录并确认。
3. 点项目下的 **+** 新建会话，发出第一条提示词即可。

## 安全须知

服务端**无鉴权**，按设计仅供**可信的家庭局域网**使用：

- 不要暴露到公网，也不要从路由器外部通过反向代理转发进来。
- 若局域网内有不信任的设备，请设置 `PI_WEB_HOME_HOST=127.0.0.1`，仅本机可访问。
- 来自公网域名的请求会被拒绝；回环地址与私网地址段放行。

详见 [SECURITY.md](../SECURITY.md) 与[网络与隐私](./network-and-privacy.md)。

## 已知限制

见[已知限制](./known-limitations.md)。

## 开发

```sh
pnpm install
pnpm dev         # 前后端联调，改动实时生效
pnpm build       # 生产构建
pnpm typecheck   # 类型检查
pnpm test        # 全部测试（vitest）
```

## 许可证

MIT，见 [LICENSE](../LICENSE)。

界面与部分服务端逻辑移植改编自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT, Copyright (c) 2026 DeepSeek）、[pi-web-simple](https://github.com/woxihejinghao/pi-web)（MIT）与 [@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi-coding-agent)（MIT）。[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 列出了引用范围与来源——该文件随源码分发，请保留。

本项目为非官方项目，与 pi（Earendil Works）、DeepSeek 无关联；π 名称与标识归其各自所有者所有。
