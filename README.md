# AI Coding Agent

VSCode AI Coding Agent 扩展 - 对标 GitHub Copilot Agent 模式，支持多模型 API Key 配置。

## 功能特性

### 核心功能 (Top 14)

- **F1**: 扩展注册为 Chat Participant (`@agent` 激活)
- **F2**: 多模型 API Key 配置（Settings UI + JSON 双模式）
- **F3**: 一键配置 DeepSeek V4（Pro/Flash）
- **F4**: 多步推理与子代理系统
- **F5**: 自主文件系统操作（带 diff 预览）
- **F6**: 终端命令执行与安全控制
- **F7**: MCP 工具调用（Model Context Protocol）
- **F8**: 对话窗口分支功能
- **F9**: 流式输出与增量渲染
- **F10**: 工作区 RAG 上下文感知
- **F11**: Agent 执行日志面板
- **F12**: 模型热切换
- **F13**: 长文本窗口管理（滑动窗口）
- **F14**: Model-as-a-Service 统计

## 快速开始

### 安装依赖

```bash
npm install
```

### 编译

```bash
npm run compile
```

### 调试

1. 按 `F5` 启动调试
2. 在 VS Code 中打开命令面板 (`Cmd+Shift+P`)
3. 输入 `AI Agent: Configure Model` 配置模型

### 配置 DeepSeek V4

1. 按 `Cmd+Shift+P`
2. 输入 `AI Agent: Configure Model`
3. 选择 `DeepSeek V4 Pro` 或 `DeepSeek V4 Flash`
4. 输入您的 API Key

## 使用方法

### 激活 Agent

在 Chat 面板输入 `@agent` 即可激活 Agent。

### 示例命令

```
@agent Hello
@agent 帮我创建一个 Express 服务器
@agent 在当前目录创建一个 demo.ts 文件
@agent 运行 npm install
```

## 项目结构

```
src/
├── extension.ts          # 扩展入口
├── commands.ts           # 命令注册
├── config/
│   └── configManager.ts  # 配置管理
├── agent/
│   ├── agentExecutor.ts       # Agent 执行器
│   ├── chatParticipant.ts     # Chat Participant
│   ├── subAgentSystem.ts      # 子代理系统
│   ├── branchManager.ts       # 分支管理
│   └── contextWindowManager.ts # 上下文窗口
├── tools/
│   ├── toolRegistry.ts        # 工具注册表
│   ├── fileOperationTool.ts   # 文件操作
│   ├── terminalTool.ts        # 终端工具
│   ├── workspaceContextTool.ts # 工作区上下文
│   └── mcpBridge.ts           # MCP 桥接
├── context/
│   └── contextBuilder.ts      # 上下文构建
├── ui/
│   ├── executionLogPanel.ts   # 执行日志面板
│   ├── settingsPanel.ts       # 设置面板
│   └── streamingOutputManager.ts # 流式输出
└── metrics/
    └── metricsCollector.ts    # 指标收集
```

## 技术栈

- **扩展宿主**: VS Code Extension API v1.90+
- **语言模型**: OpenAI-compatible HTTP Client
- **工具调用**: MCP SDK + 自定义 Tool Registry
- **前端UI**: VS Code Webview / Chat View

## API 请求格式

### 输入

```json
{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "system", "content": "You are AI Coding Agent..."},
    {"role": "user", "content": "帮我创建文件..."}
  ],
  "stream": true,
  "tools": [...]
}
```

### 输出

- 支持 OpenAI `chat/completions` 格式
- 流式输出使用 SSE (Server-Sent Events)
- 解析 `tool_calls` 命名的工具执行意图

## License

MIT
