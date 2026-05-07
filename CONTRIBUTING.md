# AI Coding Agent 贡献指南

> 本文档详细介绍了 AI Coding Agent VSCode 扩展的技术架构、核心实现和使用指南。

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [整体架构设计](#整体架构设计)
- [目录结构](#目录结构)
- [核心模块详解](#核心模块详解)
- [关键技术点实现](#关键技术点实现)
- [开发指南](#开发指南)
- [测试指南](#测试指南)
- [扩展指南](#扩展指南)

---

## 项目概述

AI Coding Agent 是一个对标 GitHub Copilot Agent 模式的 VSCode 扩展，提供以下核心功能：

| 功能 | 描述 |
|------|------|
| 多模型支持 | 支持 DeepSeek、OpenAI 等多种 LLM API |
| Chat 对话 | 独立的 Chat 面板进行 AI 对话 |
| 文件操作 | 读取、创建、修改、删除文件 |
| 终端执行 | 安全执行终端命令 |
| MCP 工具 | 支持 Model Context Protocol |
| 分支管理 | 对话分支与历史管理 |
| 流式输出 | 打字机效果的实时响应 |
| 使用统计 | Token 消耗与费用统计 |

---

## 技术栈

### 核心依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `typescript` | ^5.3.0 | TypeScript 编译 |
| `@types/vscode` | ^1.90.0 | VSCode API 类型定义 |
| `@microsoft/fetch-event-source` | ^2.0.1 | SSE 流式请求 |
| `node-fetch` | ^3.3.2 | HTTP 请求 |
| `uuid` | ^9.0.1 | 唯一 ID 生成 |

### 开发依赖

| 包名 | 用途 |
|------|------|
| `@vscode/test-electron` | VSCode 扩展测试框架 |
| `@types/mocha` | Mocha 测试框架类型 |
| `@types/node` | Node.js API 类型 |

### 运行时要求

- **VSCode 版本**: ^1.90.0 (支持 Chat API)
- **Node.js 版本**: ^18.0.0

---

## 整体架构设计

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        VSCode Host                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Chat UI   │  │  Settings   │  │    Execution Log UI      │ │
│  │  (Webview)  │  │   Panel     │  │      (Webview)           │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          │                                       │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │              extension.ts (入口)                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │  │
│  │  │   Commands  │  │ ChatParticipant│ │   StatusBar    │     │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘     │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │                    AgentExecutor                            │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │                   Core Layer                         │   │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │   │  │
│  │  │  │ ConfigManager│  │MetricsCollector│ │ ContextMgr│ │   │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────┘ │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │                   Tools Layer                        │   │  │
│  │  │  ┌────────────┐ ┌────────────┐ ┌────────────┐     │   │  │
│  │  │  │FileOperation│ │  Terminal   │ │WorkspaceCtx │     │   │  │
│  │  │  │    Tool     │ │    Tool    │ │    Tool     │     │   │  │
│  │  │  └────────────┘ └────────────┘ └────────────┘     │   │  │
│  │  │  ┌────────────┐ ┌────────────┐                    │   │  │
│  │  │  │ MCP Bridge  │ │ToolRegistry│                    │   │  │
│  │  │  └────────────┘ └────────────┘                    │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │                External APIs                               │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │  │
│  │  │  DeepSeek   │ │  OpenAI    │ │   MCP      │            │  │
│  │  │    API      │ │    API     │ │  Servers   │            │  │
│  │  └────────────┘ └────────────┘ └────────────┘            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件职责

| 组件 | 职责 |
|------|------|
| `extension.ts` | 扩展入口，注册命令、面板、状态栏 |
| `AgentExecutor` | 核心执行器，调度任务、调用模型、管理工具 |
| `ConfigManager` | 配置管理，模型配置持久化 |
| `ToolRegistry` | 工具注册中心，管理和执行工具 |
| `ContextWindowManager` | 上下文窗口管理，Token 限制处理 |
| `MetricsCollector` | 指标收集，使用统计 |

---

## 目录结构

```
src/
├── extension.ts              # 扩展入口文件
├── commands.ts              # 命令注册
├── agent/                   # Agent 核心
│   ├── agentExecutor.ts     # 任务执行器
│   ├── chatParticipant.ts   # VSCode Chat 集成
│   ├── contextWindowManager.ts  # 上下文管理
│   ├── subAgentSystem.ts    # 子代理系统
│   └── branchManager.ts     # 分支管理
├── config/
│   └── configManager.ts     # 配置管理
├── context/
│   └── contextBuilder.ts    # 上下文构建
├── metrics/
│   └── metricsCollector.ts  # 指标收集
├── tools/                   # 工具系统
│   ├── toolRegistry.ts      # 工具注册表
│   ├── fileOperationTool.ts # 文件操作
│   ├── terminalTool.ts      # 终端执行
│   ├── workspaceContextTool.ts  # 工作区上下文
│   └── mcpBridge.ts         # MCP 桥接
├── ui/                      # UI 组件
│   ├── chatPanel.ts         # Chat 面板
│   ├── settingsPanel.ts      # 设置面板
│   ├── executionLogPanel.ts  # 执行日志
│   └── streamingOutputManager.ts  # 流式输出
└── test/                    # 测试
    ├── runTest.ts
    └── suite/
        └── extension.test.ts
```

---

## 核心模块详解

### 1. AgentExecutor (`agent/agentExecutor.ts`)

**核心职责**: 协调模型调用、工具执行、上下文管理。

#### 类结构

```typescript
export class AgentExecutor {
    private configManager: ConfigManager;      // 配置管理
    private metricsCollector: MetricsCollector; // 指标收集
    private executionLogPanel: ExecutionLogPanel; // 日志面板
    private toolRegistry: ToolRegistry;        // 工具注册表
    private contextManager: ContextWindowManager; // 上下文管理
    private isStreaming: boolean;             // 流式状态
    private currentAbortController: AbortController; // 中断控制器
    private currentModel: ModelConfig;        // 当前模型
}
```

#### 核心方法

| 方法 | 描述 | 参数 |
|------|------|------|
| `execute()` | 执行用户消息 | `messages`, `onChunk`, `onToolCall`, `onComplete`, `onError` |
| `callModelAPI()` | 调用模型 API | `model`, `messages`, `tools`, `onChunk`, `onToolCall` |
| `executeToolCall()` | 执行工具调用 | `toolCall`, `onPendingConfirm` |
| `cancelCurrentTask()` | 取消当前任务 | - |

#### 执行流程

```
User Input
    │
    ▼
┌─────────────────────────────────────────┐
│  1. buildContext()                       │
│     - 添加系统提示                        │
│     - 添加工作区上下文                     │
│     - 添加历史消息                        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  2. trimContextIfNeeded()               │
│     - 检查 Token 数量                     │
│     - 滑动窗口裁剪                        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  3. callModelAPI()                       │
│     - 构建请求体                          │
│     - 发送 HTTP 请求                      │
│     - 处理流式响应                        │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────┐              ┌───────────┐
│ 纯文本   │              │ 工具调用   │
│ 响应     │              │ 请求      │
└────┬────┘              └─────┬─────┘
     │                         │
     ▼                         ▼
┌─────────────────────────────────────────┐
│  4. executeToolCall()                    │
│     - 检查确认状态                        │
│     - 调用工具执行                        │
│     - 返回结果                           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  5. 循环调用模型直到完成                  │
└─────────────────────────────────────────┘
```

### 2. ToolRegistry (`tools/toolRegistry.ts`)

**核心职责**: 管理所有可用工具的注册和执行。

#### 接口定义

```typescript
export interface Tool {
    name: string;                    // 工具名称
    description: string;             // 工具描述（用于 LLM 理解）
    parameters: {                    // JSON Schema 参数定义
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    execute(args: any): Promise<any>;  // 执行函数
}
```

#### 注册流程

```typescript
// 1. 创建工具实例
const fileTool = new FileOperationTool();

// 2. 注册到工具注册表
toolRegistry.registerTool(fileTool);

// 3. 获取 LLM 格式的工具定义
const tools = toolRegistry.getToolsForLLM();
```

### 3. ConfigManager (`config/configManager.ts`)

**核心职责**: 管理模型配置、API Key、用户设置。

#### 配置接口

```typescript
export interface ModelConfig {
    id: string;              // 模型 ID
    name: string;            // 显示名称
    provider: string;        // 提供商 (deepseek/openai/custom)
    apiBase: string;         // API 基础 URL
    apiKey: string;          // API Key
    model: string;           // 模型名称
    maxTokens: number;       // 最大 Token 数
    temperature: number;     // 温度参数
}
```

#### 配置存储

配置存储在 VSCode 工作区配置中：

```json
{
    "aiCodingAgent.models": [...],
    "aiCodingAgent.defaultModel": "deepseek-v4-pro",
    "aiCodingAgent.enableStreaming": true,
    "aiCodingAgent.maxContextTokens": 131072
}
```

### 4. ContextWindowManager (`agent/contextWindowManager.ts`)

**核心职责**: 管理对话上下文，处理 Token 限制。

#### 滑动窗口策略

1. **保留系统消息**: 始终保留
2. **保留最近用户消息**: 默认保留最后 10 条
3. **智能裁剪**: 按时间从旧到新裁剪
4. **摘要生成**: 当空间不足时生成对话摘要

```typescript
// Token 估算
estimateMessageTokens(message: ChatMessage): number {
    const chineseChars = (message.content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return baseOverhead + Math.ceil(chineseChars / 2 + otherChars / 4);
}
```

---

## 关键技术点实现

### 1. 流式输出 (Streaming)

使用 Server-Sent Events (SSE) 实现流式输出：

```typescript
// 发送请求
const response = await fetch(`${model.apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...requestBody, stream: true }),
    signal: this.currentAbortController?.signal
});

// 处理流式响应
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                onChunk(content);  // 实时回调
            }
        }
    }
}
```

### 2. 工具调用 (Tool Calling)

#### 工具定义格式 (OpenAI 格式)

```typescript
{
    type: 'function',
    function: {
        name: 'file_operation',
        description: '文件系统操作工具...',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['read', 'write', 'delete', 'list', 'search']
                },
                path: { type: 'string', description: '文件路径' },
                content: { type: 'string', description: '文件内容' }
            },
            required: ['action']
        }
    }
}
```

#### 工具执行流程

```typescript
async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments } = toolCall.function;
    const args = JSON.parse(arguments);
    
    // 1. 检查确认
    if (this.needsUserConfirmation(name, args)) {
        const confirmed = await vscode.window.showInformationMessage(
            `执行 ${name}?`,
            { modal: true },
            '确认', '取消'
        );
        if (confirmed !== '确认') {
            return { toolCallId, result: { error: '用户取消' }, isError: true };
        }
    }
    
    // 2. 获取工具
    const tool = this.toolRegistry.getTool(name);
    
    // 3. 执行工具
    const result = await tool.execute(args);
    
    // 4. 返回结果
    return { toolCallId, result };
}
```

### 3. MCP 协议桥接

MCP (Model Context Protocol) 允许扩展调用外部工具服务器：

```typescript
// MCP 服务器配置
interface MCPServerConfig {
    name: string;           // 服务器名称
    command: string;        // 启动命令
    args?: string[];        // 启动参数
    env?: Record<string, string>;  // 环境变量
}

// MCP 请求格式
interface MCPRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: any;
}
```

### 4. 安全控制

#### 终端命令安全

```typescript
// 危险命令检测
private isDangerousCommand(command: string): boolean {
    const dangerousPatterns = [
        /rm\s+-rf/i,
        /format/i,
        /del\s+\/f\s+\/s/i,
        /shutdown/i,
        /init/i
    ];
    return dangerousPatterns.some(p => p.test(command));
}

// 用户确认
if (this.isDangerousCommand(command)) {
    const confirmed = await vscode.window.showWarningMessage(
        `危险命令: ${command}`,
        { modal: true },
        '仍然执行', '取消'
    );
}
```

---

## 开发指南

### 环境配置

```bash
# 1. 克隆项目
git clone <repository-url>
cd ai-code-assistant-vscode-extension

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run compile

# 4. 开发模式（监视文件变化）
npm run watch
```

### 调试

1. 在 VSCode 中打开项目
2. 按 `F5` 启动 Extension Development Host
3. 在调试窗口中测试扩展

### 项目配置

#### launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

#### package.json 配置

```json
{
  "activationEvents": [
    "onCommand:aiCodingAgent.configure",
    "onCommand:aiCodingAgent.openChat",
    "onView:aiCodingAgent.executionLog"
  ],
  "contributes": {
    "commands": [...],
    "views": {...},
    "keybindings": [...]
  }
}
```

---

## 测试指南

### 单元测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
./node_modules/.bin/mocha out/test/suite/**/*.js
```

### 测试覆盖

| 模块 | 测试内容 |
|------|---------|
| `ConfigManager` | 模型配置保存/读取 |
| `ToolRegistry` | 工具注册/获取 |
| `ContextWindowManager` | Token 裁剪逻辑 |
| `MetricsCollector` | 统计计算 |

---

## 扩展指南

### 添加新工具

1. **创建工具类** (`tools/exampleTool.ts`)

```typescript
import { Tool } from './toolRegistry';

export class ExampleTool implements Tool {
    name = 'example_tool';
    description = '示例工具描述';
    
    parameters = {
        type: 'object' as const,
        properties: {
            param1: { type: 'string', description: '参数1' }
        },
        required: ['param1']
    };
    
    async execute(args: any): Promise<any> {
        // 实现逻辑
        return { success: true, result: '...' };
    }
}
```

2. **注册工具** (`agentExecutor.ts`)

```typescript
const exampleTool = new ExampleTool();
this.toolRegistry.registerTool(exampleTool);
```

### 添加新模型

在 `ConfigManager` 中添加模型配置：

```typescript
async addCustomModel(apiKey: string, modelName: string): Promise<void> {
    const model: ModelConfig = {
        id: `custom-${Date.now()}`,
        name: modelName,
        provider: 'custom',
        apiBase: 'https://api.example.com/v1',
        apiKey,
        model: modelName,
        maxTokens: 8192,
        temperature: 0.7
    };
    
    await this.saveModel(model);
}
```

### 添加新面板

1. **创建 Webview 面板**

```typescript
export class MyPanel {
    private panel: vscode.WebviewPanel | undefined;
    
    show(context: vscode.ExtensionContext): void {
        this.panel = vscode.window.createWebviewPanel(
            'myPanel',
            'My Panel',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        
        this.panel.webview.html = this.getHtmlContent();
    }
}
```

2. **注册命令** (`commands.ts`)

```typescript
vscode.commands.registerCommand('aiCodingAgent.openMyPanel', () => {
    myPanel.show(context);
});
```

3. **添加到 package.json**

```json
{
  "commands": [{
    "command": "aiCodingAgent.openMyPanel",
    "title": "AI Agent: Open My Panel"
  }]
}
```

---

## 常见问题

### Q: 如何添加新的 API 提供商？

A: 在 `ConfigManager` 中添加配置方法：

```typescript
async addOpenAICompatibleModel(config: {
    apiKey: string;
    baseUrl: string;
    model: string;
}): Promise<void> {
    const model: ModelConfig = {
        id: `openai-compatible-${Date.now()}`,
        name: config.model,
        provider: 'openai-compatible',
        apiBase: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: 128000,
        temperature: 0.7
    };
    
    await this.saveModel(model);
}
```

### Q: 如何禁用特定工具？

A: 修改 `AgentExecutor.registerDefaultTools()` 方法：

```typescript
private registerDefaultTools() {
    // 注释掉不需要的工具
    // this.toolRegistry.registerTool(new TerminalTool());
    
    // 只注册需要的工具
    this.toolRegistry.registerTool(new FileOperationTool());
    this.toolRegistry.registerTool(new WorkspaceContextTool());
}
```

### Q: 如何添加自定义快捷键？

A: 在 `package.json` 中添加：

```json
{
  "keybindings": [{
    "command": "aiCodingAgent.openChat",
    "key": "ctrl+shift+a",
    "mac": "cmd+shift+a",
    "when": "editorTextFocus"
  }]
}
```

---

## 附录

### 配置文件格式

```json
{
  "aiCodingAgent": {
    "models": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "provider": "deepseek",
        "apiBase": "https://api.deepseek.com/v1",
        "apiKey": "${env:DEEPSEEK_API_KEY}",
        "model": "deepseek-v4-pro",
        "maxTokens": 131072,
        "temperature": 0.7
      }
    ],
    "defaultModel": "deepseek-v4-pro",
    "maxContextTokens": 131072,
    "enableStreaming": true,
    "autoConfirmFileOperations": false,
    "workspaceContextEnabled": true,
    "pricing": {
      "deepseek-v4-pro": {
        "inputPricePer1M": 0.5,
        "outputPricePer1M": 2.0
      }
    }
  }
}
```

### VSCode API 参考

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Chat API (VSCode 1.90+)](https://code.visualstudio.com/api/extension-guides/chat)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)

---

*本文档最后更新于 2026-05-07*
