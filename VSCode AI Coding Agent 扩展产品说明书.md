> 版本：v1.0 | 更新日期：2026-05
>

本说明书定义了 **VSCode AI Coding Agent 扩展**的产品形态、核心能力与Demo交付标准。目标是对标 GitHub Copilot 的 Agent 模式，同时**不绑定 Microsoft / GitHub 账号体系**，用户仅需提供第三方大模型 API Key（如 DeepSeek V4）即可直接使用全部功能。



## 一、产品定位
| 维度 | 说明 |
| --- | --- |
| 产品名称 | VSCode AI Coding Agent（内部代号可自定义） |
| 目标用户 | 希望使用国产大模型（DeepSeek等）进行AI辅助编程的开发者 |
| 核心差异 | 完全解耦模型供应商，用户自带API Key，开箱即用 |
| 对标参照 | GitHub Copilot Agent Mode（开源参考：`microsoft/vscode-copilot-chat`） |


## 二、必须实现的Top 14功能项
以下功能项按优先级从高到低排列：

| 编号 | 功能名称 | 详细要求 |
| --- | --- | --- |
| **F1** | 扩展注册为 Chat Participant | 使用 VS Code Chat Extension API，注册为 `@agent` 聊天参与者。用户在 Chat 面板输入 `@agent` 即可激活，不依赖 GitHub 登录。API 参考：`chat.createChatParticipant` |
| **F2** | 多模型API Key配置 | 提供一个配置面板（Settings UI + JSON双模式），用户填入API Base URL、API Key、Model ID 后立即生效。支持 OpenAI Compatible 接口协议 |
| **F3** | 一键配置 DeepSeek V4 | 预设 DeepSeek V4 模型模板：`deepseek-v4-pro`（旗舰推理）和 `deepseek-v4-flash`（轻量快速），API端点填入 `https://api.deepseek.com/v1` 即可 |
| **F4** | 多步推理与子代理系统 | 任务到达后自动拆解为子任务链，每个子任务可独立执行、独立使用工具。支持子代理互相调用，实现多步骤工作流组合 |
| **F5** | 自主文件系统操作 | 能读取、创建、修改、删除工作区文件。每步操作需向用户展示 diff/patch 预览（参照 Agent Mode 的安全确认机制） |
| **F6** | 终端命令执行与安全控制 | 能生成 shell 命令、执行并读取输出结果。**必须**包含用户确认环节（Agent 发起请求 → 用户批准 → 执行 → 解析结果），不可绕过 |
| **F7** | MCP 工具调用（Model Context Protocol） | 支持加载 MCP Server（通过 `.mcp.json` 或用户手动指定），Agent 可在规划阶段自动匹配并调用 MCP 工具完成外部操作（如查数据库、调GitHub API等） |
| **F8** | 对话窗口分支功能 | 用户在对话历史的任意节点可“分叉”创建新会话副本，用于探索替代方案而不丢失原始上下文。需实现 UI 分支入口 |
| **F9** | 流式输出与增量渲染 | 模型采用 SSE 流式输出，前端使用 Content-Security-Policy 合规的增量渲染策略（逐字显示），支持中途取消 |
| **F10** | 工作区 RAG 上下文感知 | 与本地代码库索引工具合作：Agent 自动获取项目文件结构、关键变量定义、函数签名作为上下文；支持用户通过 `#file` 快速指定文件参考 |
| **F11** | Agent 执行日志面板 | 提供一个时间线视图，按顺序记录每次 Agent 交互的关键事件（选择工具、调用参数、模型返回、执行结果）。附带展开/收起功能，方便调试 |
| **F12** | 模型热切换 | 对话进行中可按快捷键或单击模型名称切换到其他已配置模型，上下文不变。切换后当前任务继续使用新模型响应 |
| **F13** | 长文本窗口管理 | 支持百万上下文窗口（如 DeepSeek V4），当对话历史接近模型限制时触发滑动窗口机制，自动按重要性保留上下文并温顺降级 |
| **F14** | Model-as-a-Service 统计 | 实时显示 Token 使用量、API 调用次数、响应耗时与预估费用（基于用户配置的 Pricing 参数），不共享给任何第三方 |


## 三、技术架构概要
### 3.1 核心三层架构
### 3.2 关键技术栈
| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| 扩展宿主 | VS Code Extension API v1.90+ | 需使用 Chat Participant API、Language Model API |
| 语言模型接入 | OpenAI-compatible HTTP Client | `POST /v1/chat/completions`，支持流式 SSE |
| 工具调用 | MCP SDK + 自定义 Tool Registry | Agent 工具集包括：文件系统、终端、MCP |
| 前端UI | VS Code Webview / Chat View | 设置面板、执行日志、模型切换等扩展 UI |


### 3.3 API 请求模板格式
**输入侧（用户消息）**：

+ 必须包含 `messages` 列表（system + user + assistant）
+ 必须包含当前的 MCP 工具定义作为 `tools` 字段
+ 可选包含工作区上下文中的关键代码段

**输出侧（API响应）**：

+ 支持 OpenAI `chat/completions` 格式
+ 流式输出使用 SSE (Server‑Sent Events)
+ 解析 `tool_calls` 命名的工具执行意图
+ Agent 可按需请求执行终端指令、文件修改

### 3.4 模块拆分清单
| 模块名 | 说明 |
| --- | --- |
| `src/extension.ts` | 扩展入口、participant 注册、命令注册 |
| `src/config/` | 模型配置管理、预设模型模板 |
| `src/agent/` | Agent 主控、子代理调度、任务拆解 |
| `src/tools/` | 工具注册中心、文件操作工具、终端工具、MCP桥接 |
| `src/context/` | 上下文构建、RAG 索引适配器 |
| `src/ui/` | Webview UI（设置面板、执行日志）、状态栏指示器 |
| `src/metrics/` | Token 计算器、API 调用统计 |


## 四、快速配置大模型API
### 4.1 方案A：快捷键一键配置（推荐）
1. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
2. 输入 `AI Agent: Configure Model` 并回车
3. 在弹出菜单中选择 **DeepSeek V4 Pro** 或 **DeepSeek V4 Flash**
4. 填入您的 API Key，点击 **Test & Save**

### 4.2 方案B：手动 JSON 配置
在 VS Code Settings JSON 中添加：

```json
"aiAgent.models": [
  {
    "id": "deepseek-v4-pro",
    "name": "DeepSeek V4 Pro",
    "provider": "deepseek",
    "apiBase": "https://api.deepseek.com/v1",
    "apiKey": "${env:DEEPSEEK_API_KEY}",
    "model": "deepseek-v4-pro",
    "maxTokens": 131072,
    "temperature": 0.7
  },
  {
    "id": "deepseek-v4-flash",
    "name": "DeepSeek V4 Flash",
    "provider": "deepseek",
    "apiBase": "https://api.deepseek.com/v1",
    "apiKey": "${env:DEEPSEEK_API_KEY}",
    "model": "deepseek-v4-flash",
    "maxTokens": 16384,
    "temperature": 0.3
  }
],
"aiAgent.defaultModel": "deepseek-v4-pro"
```

### 4.3 模型选择建议
| 模型 | 场景 | 特点 |
| --- | --- | --- |
| `deepseek-v4-pro` | 复杂多步推理、大型重构 | 旗舰模型，强推理能力，百万上下文 |
| `deepseek-v4-flash` | 日常代码补全、快速问答 | 轻量快速，成本低，非思考模式 |
| 其他 OpenAI 兼容模型 | 灵活替换 | 填写 API Base 和 Model ID 即可 |


> **注意**：旧版模型名 `deepseek-chat` 和 `deepseek-reasoner` 将于 2026-07-24 完全停用，请使用新模型名。
>

## 五、给Codebuddy的Demo交付清单
请 Codebuddy 按以下最低标准完成 Demo 开发，**全部通过后可交付**。

### 5.1 Demo 验收检查清单
| 编号 | 验收项 | 操作步骤 | 期望结果 |
| --- | --- | --- | --- |
| **D1** | 扩展安装 & 激活 | 安装 `.vsix`，重启 VS Code | 状态栏出现 `AI Agent: Ready` |
| **D2** | DeepSeek V4 模型配置 | 填入 API Key 并测试连接 | 显示绿色勾 `Connection OK` |
| **D3** | 基础对话 | 在 Chat 面板输入 `@agent Hello` | Agent 成功回复 |
| **D4** | 多步推理 | `@agent 帮我创建以下任务：1. 创建一个 Express 服务器文件，2. 创建一个健康检查端点，3. 创建 package.json` | Agent 逐步完成并确认 |
| **D5** | 文件操作 | `@agent 在当前目录创建一个名为 demo.ts 的 TypeScript 文件，包含一个防抖函数` | 文件创建成功，Agent 展示 diff |
| **D6** | 终端执行 | `@agent 运行 npx create-next-app@latest my-agent-demo` | 终端命令请求审批，执行结果返回 Chat |
| **D7** | 流式输出 | 发送一个长任务请求 | 响应逐字流式展示，可中途取消 |
| **D8** | 执行日志 | 执行任何 Agent 任务，打开执行日志面板 | 显示完整的事件时间线 |
| **D9** | 分支对话 | 在一次对话中间点击分支按钮 | 创建新分支，新分支独立运行 |


### 5.2 Demo 数据示例
**测试用 DeepSeek V4 API Key**（请替换为用户实际Key）：

```plain
sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**示例任务 prompt（验收用）**：

```plain
创建一个完整的 REST API 示例项目：
1. 使用 Express + TypeScript
2. 包含 GET /api/users 和 POST /api/users 两个端点
3. 数据存于内存数组
4. 对应的 curl 测试命令写在 test.sh 中
```

**期望 Agent 输出**：

+ `src/index.ts` — 服务主入口
+ `src/routes/users.ts` — 用户路由实现
+ `package.json` — 项目依赖
+ `tsconfig.json` — TypeScript 配置
+ `test.sh` — 测试命令

### 5.3 Demo 最小化技术栈建议
| 组件 | 技术选型 |
| --- | --- |
| 开发语言 | TypeScript |
| 扩展脚手架 | `yo code`（VS Code Extension Generator） |
| HTTP 客户端 | `node-fetch` + `@microsoft/fetch-event-source`（SSE 流式） |
| 配置存储 | `vscode.workspace.getConfiguration` |
| API 协议 | OpenAI-compatible Chat Completions + SSE 流式 |
| 工作区扫描 | `vscode.workspace.findFiles` |
| API Key 安全存储 | `vscode.SecretStorage`（同 Copilot 方案） |


### 5.4 文件操作流程图（F5 实现参考）
Agent 每次文件操作必须遵循：**扫描 → 提案 → 用户审查 → 执行 → 验证** 五步。

```plain
用户请求 → Agent分析 → 输出Diff → [Await 用户确认]
     ↓                                          ↓
   (reject)                               (accept)
     ↓                                          ↓
  返回调整说明                             实际写入文件
                                             ↓
                                        写入后 Diff 验证
```

### 5.5 调试指南
如果遇到问题，按以下顺序排查：

1. **API 连接失败**：检查 `apiBase` 地址是否包含末尾的 `/v1`，确认 API Key 有效
2. **流式输出中断**：检查 `stream: true` 参数是否传入，确认网络代理设置
3. **工具调用无响应**：检查 `tools` 参数格式是否符合 OpenAI Function Calling 规范
4. **文件操作权限**：确认工作区路径可读写，检查 VS Code 工作区信任设置

---

_本说明书版本 v1.0，更新时间 2026-05。如有问题请及时沟通。_

