/**
 * Agent 执行器 - 核心任务调度、工具调用、子代理管理等
 */

import * as vscode from 'vscode';
import { ConfigManager, ModelConfig, ExecutionLog } from '../config/configManager';
import { MetricsCollector } from '../metrics/metricsCollector';
import { ExecutionLogPanel } from '../ui/executionLogPanel';
import { ToolRegistry } from '../tools/toolRegistry';
import { FileOperationTool } from '../tools/fileOperationTool';
import { TerminalTool } from '../tools/terminalTool';
import { WorkspaceContextTool } from '../tools/workspaceContextTool';
import { ContextWindowManager } from './contextWindowManager';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolResult {
    toolCallId: string;
    result: any;
    isError?: boolean;
}

export interface AgentResponse {
    content: string;
    toolCalls?: ToolCall[];
    isComplete: boolean;
}

export class AgentExecutor {
    private configManager: ConfigManager;
    private metricsCollector: MetricsCollector;
    private executionLogPanel: ExecutionLogPanel;
    private toolRegistry: ToolRegistry;
    private contextManager: ContextWindowManager;
    private isStreaming: boolean = false;
    private currentAbortController: AbortController | undefined;
    private pendingToolCalls: Map<string, ToolCall> = new Map();
    private currentModel: ModelConfig | undefined;

    constructor(
        configManager: ConfigManager,
        metricsCollector: MetricsCollector,
        executionLogPanel: ExecutionLogPanel
    ) {
        this.configManager = configManager;
        this.metricsCollector = metricsCollector;
        this.executionLogPanel = executionLogPanel;
        
        // 初始化工具注册表
        this.toolRegistry = new ToolRegistry();
        this.registerDefaultTools();
        
        // 初始化上下文窗口管理器
        this.contextManager = new ContextWindowManager(configManager.getMaxContextTokens());
    }

    private registerDefaultTools() {
        // 注册文件操作工具
        const fileTool = new FileOperationTool();
        this.toolRegistry.registerTool(fileTool);
        
        // 注册终端工具
        const terminalTool = new TerminalTool();
        this.toolRegistry.registerTool(terminalTool);
        
        // 注册工作区上下文工具
        const workspaceTool = new WorkspaceContextTool();
        this.toolRegistry.registerTool(workspaceTool);
    }

    /**
     * 设置当前模型
     */
    setCurrentModel(model: ModelConfig) {
        this.currentModel = model;
    }

    /**
     * 获取当前模型
     */
    getCurrentModel(): ModelConfig | undefined {
        return this.currentModel || this.configManager.getDefaultModel();
    }

    /**
     * 执行用户消息
     */
    async execute(
        messages: ChatMessage[],
        onChunk: (content: string) => void,
        onToolCall: (toolCall: ToolCall) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        const model = this.getCurrentModel();
        if (!model) {
            onError(new Error('未配置任何模型，请先配置 AI 模型'));
            return;
        }

        this.isStreaming = true;
        this.currentAbortController = new AbortController();

        try {
            // 添加日志
            this.executionLogPanel.addLog({
                id: this.generateId(),
                timestamp: new Date(),
                type: 'info',
                title: '开始执行任务',
                details: `使用模型: ${model.name}`,
                status: 'pending'
            });

            // 构建上下文
            const contextMessages = await this.buildContext(messages);
            
            // 检查是否需要滑动窗口
            const trimmedMessages = this.contextManager.trimContextIfNeeded(
                contextMessages,
                model.maxTokens
            );

            // 获取工具定义
            const tools = this.toolRegistry.getToolsForLLM();

            // 调用模型 API
            await this.callModelAPI(model, trimmedMessages, tools, onChunk, onToolCall);

            onComplete();
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                this.executionLogPanel.addLog({
                    id: this.generateId(),
                    timestamp: new Date(),
                    type: 'error',
                    title: '执行错误',
                    details: error.message,
                    status: 'error'
                });
                onError(error);
            }
        } finally {
            this.isStreaming = false;
            this.currentAbortController = undefined;
        }
    }

    /**
     * 调用模型 API
     */
    private async callModelAPI(
        model: ModelConfig,
        messages: ChatMessage[],
        tools: any[],
        onChunk: (content: string) => void,
        onToolCall: (toolCall: ToolCall) => void
    ): Promise<void> {
        const startTime = Date.now();
        
        const requestBody: any = {
            model: model.model,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            stream: this.configManager.isStreamingEnabled(),
            max_tokens: model.maxTokens,
            temperature: model.temperature
        };

        if (tools.length > 0) {
            requestBody.tools = tools;
        }

        const response = await fetch(`${model.apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: this.currentAbortController?.signal
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API 请求失败: ${response.status} - ${error}`);
        }

        if (this.configManager.isStreamingEnabled() && response.body) {
            // 流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            
                            if (parsed.choices?.[0]?.delta?.content) {
                                const content = parsed.choices[0].delta.content;
                                fullContent += content;
                                onChunk(content);
                            }
                            
                            if (parsed.choices?.[0]?.delta?.tool_calls) {
                                for (const toolCall of parsed.choices[0].delta.tool_calls) {
                                    onToolCall(toolCall);
                                }
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }

            // 记录指标
            this.metricsCollector.recordRequest(
                model.id,
                this.estimateTokens(JSON.stringify(messages)),
                this.estimateTokens(fullContent),
                Date.now() - startTime
            );
        } else {
            // 非流式响应
            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || '';
            
            onChunk(content);

            // 记录指标
            this.metricsCollector.recordRequest(
                model.id,
                this.estimateTokens(JSON.stringify(messages)),
                this.estimateTokens(content),
                Date.now() - startTime
            );
        }
    }

    /**
     * 执行工具调用
     */
    async executeToolCall(
        toolCall: ToolCall,
        onPendingConfirm: (toolCall: ToolCall) => Promise<boolean>
    ): Promise<ToolResult> {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        // 添加执行日志
        this.executionLogPanel.addLog({
            id: this.generateId(),
            timestamp: new Date(),
            type: toolName === 'terminal_command' ? 'terminal_command' : 
                  toolName.includes('file') ? 'file_operation' : 'tool_call',
            title: `工具调用: ${toolName}`,
            details: JSON.stringify(toolArgs, null, 2),
            toolName,
            toolArgs,
            status: 'pending'
        });

        // 检查是否需要用户确认
        const needsConfirmation = this.needsUserConfirmation(toolName, toolArgs);
        const autoConfirm = this.configManager.isAutoConfirmEnabled();

        if (needsConfirmation && !autoConfirm) {
            const confirmed = await onPendingConfirm(toolCall);
            if (!confirmed) {
                this.executionLogPanel.updateLogStatus(
                    toolCall.id,
                    'cancelled'
                );
                return {
                    toolCallId: toolCall.id,
                    result: { error: '用户取消执行' },
                    isError: true
                };
            }
        }

        try {
            const tool = this.toolRegistry.getTool(toolName);
            if (!tool) {
                throw new Error(`未找到工具: ${toolName}`);
            }

            const result = await tool.execute(toolArgs);

            this.executionLogPanel.updateLogStatus(
                toolCall.id,
                'success'
            );

            return {
                toolCallId: toolCall.id,
                result
            };
        } catch (error: any) {
            this.executionLogPanel.updateLogStatus(
                toolCall.id,
                'error'
            );

            return {
                toolCallId: toolCall.id,
                result: { error: error.message },
                isError: true
            };
        }
    }

    /**
     * 判断是否需要用户确认
     */
    private needsUserConfirmation(toolName: string, args: any): boolean {
        // 终端命令始终需要确认
        if (toolName === 'terminal_command') {
            return true;
        }

        // 文件删除操作需要确认
        if (toolName === 'delete_file' || toolName === 'delete_files') {
            return true;
        }

        // 覆盖文件需要确认
        if (toolName === 'write_file' && args.overwrite) {
            return true;
        }

        return false;
    }

    /**
     * 构建上下文
     */
    private async buildContext(messages: ChatMessage[]): Promise<ChatMessage[]> {
        const context: ChatMessage[] = [];

        // 添加系统提示
        context.push({
            role: 'system',
            content: this.buildSystemPrompt()
        });

        // 添加工作区上下文（如果启用）
        if (this.configManager.isWorkspaceContextEnabled()) {
            const workspaceContext = await this.getWorkspaceContext();
            if (workspaceContext) {
                context.push({
                    role: 'system',
                    content: `【工作区上下文】\n${workspaceContext}`
                });
            }
        }

        // 添加历史消息
        context.push(...messages);

        return context;
    }

    /**
     * 构建系统提示
     */
    private buildSystemPrompt(): string {
        return `你是 AI Coding Agent，一个强大的 AI 编程助手。你可以帮助用户：
1. 读取、创建、修改和删除文件
2. 执行终端命令
3. 分析和理解代码
4. 回答编程问题

你具备以下能力：
- 多步骤推理和任务分解
- 工具调用（MCP 协议）
- 文件系统操作（需要用户确认）
- 终端命令执行（需要用户确认）

安全原则：
- 所有文件操作和终端命令都需要用户确认才能执行
- 如果不确定操作的后果，请先询问用户
- 使用 diff/patch 预览展示文件修改

你必须使用工具来完成复杂任务，不要只是给出建议。`;
    }

    /**
     * 获取工作区上下文
     */
    private async getWorkspaceContext(): Promise<string | null> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/*.{ts,js,json,md}'),
            '**/node_modules/**',
            50
        );

        if (files.length === 0) {
            return null;
        }

        const fileInfos = files.slice(0, 20).map(file => {
            const relativePath = vscode.workspace.asRelativePath(file);
            return relativePath;
        });

        return `工作区文件结构（前20个）：\n${fileInfos.join('\n')}`;
    }

    /**
     * 估算 Token 数量
     */
    private estimateTokens(text: string): number {
        // 简单估算：中文约 2 字符/token，英文约 4 字符/token
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars / 2 + otherChars / 4);
    }

    /**
     * 取消当前任务
     */
    async cancelCurrentTask(): Promise<void> {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.isStreaming = false;
            
            this.executionLogPanel.addLog({
                id: this.generateId(),
                timestamp: new Date(),
                type: 'info',
                title: '任务已取消',
                details: '用户手动取消当前任务',
                status: 'cancelled'
            });
        }
    }

    /**
     * 检查是否正在流式输出
     */
    isCurrentlyStreaming(): boolean {
        return this.isStreaming;
    }

    /**
     * 生成唯一 ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
