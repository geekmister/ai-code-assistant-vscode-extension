/**
 * Chat Participant 注册 - F1: 扩展注册为 Chat Participant
 * 
 * 注意：此实现基于 VS Code 的 Chat Extension API。
 * 实际的 Chat Participant API 在 vscode@1.90+ 中可用。
 */

import * as vscode from 'vscode';
import { AgentExecutor, ChatMessage, ToolCall } from './agentExecutor';
import { updateStatusBar } from '../extension';

// Chat API 类型定义
interface ChatRequestHandler {
    (request: vscode.ChatRequest, stream: vscode.ChatResponseStream, context: vscode.ChatContext): Promise<vscode.ProviderResult<vscode.ChatFollowup[]>>;
}

export function registerChatParticipant(
    context: vscode.ExtensionContext,
    agentExecutor: AgentExecutor
) {
    // 检查是否支持 Chat API
    if (!('createChatParticipant' in vscode.chat)) {
        vscode.window.showWarningMessage(
            '当前 VS Code 版本不支持 Chat API。请升级到 VS Code 1.90 或更高版本。'
        );
        return;
    }

    // 使用类型断言来绕过类型检查
    const chatParticipant = (vscode.chat as any).createChatParticipant(
        'agent',
        async (request: vscode.ChatRequest, stream: vscode.ChatResponseStream) => {
            const userMessage = request.prompt;
            
            // 更新状态栏
            const currentModel = agentExecutor.getCurrentModel();
            updateStatusBar('Thinking', currentModel?.name);

            try {
                // 构建消息历史
                const messages: ChatMessage[] = [
                    { role: 'user', content: userMessage }
                ];

                // 收集模型响应
                let fullResponse = '';
                const toolCalls: ToolCall[] = [];

                // 执行 Agent
                await agentExecutor.execute(
                    messages,
                    // 流式输出回调
                    (chunk: string) => {
                        fullResponse += chunk;
                        stream.markdown(chunk);
                    },
                    // 工具调用回调
                    async (toolCall: ToolCall) => {
                        // 记录工具调用
                        toolCalls.push(toolCall);
                        
                        // 显示工具调用信息
                        stream.markdown(`正在请求执行工具: ${toolCall.function.name}`);
                        
                        // 执行工具
                        const result = await agentExecutor.executeToolCall(
                            toolCall,
                            async () => true
                        );

                        // 将结果添加到消息历史
                        messages.push({
                            role: 'assistant',
                            content: fullResponse,
                            toolCalls: toolCalls
                        });
                        messages.push({
                            role: 'assistant',
                            content: JSON.stringify(result.result)
                        });

                        // 继续执行
                        await agentExecutor.execute(
                            messages,
                            (chunk: string) => stream.markdown(chunk),
                            async () => {},
                            () => updateStatusBar('Ready', agentExecutor.getCurrentModel()?.name),
                            (error: Error) => {
                                stream.markdown(`\n\n**错误**: ${error.message}`);
                                updateStatusBar('Error');
                            }
                        );
                    },
                    // 完成回调
                    () => {
                        updateStatusBar('Ready', agentExecutor.getCurrentModel()?.name);
                    },
                    // 错误回调
                    (error: Error) => {
                        stream.markdown(`\n\n**错误**: ${error.message}`);
                        updateStatusBar('Error');
                    }
                );
            } catch (error: any) {
                stream.markdown(`\n\n**错误**: ${error.message}`);
                updateStatusBar('Error');
            }
        }
    );

    // 设置Participant的详细配置
    try {
        (chatParticipant as any).iconPath = vscode.Uri.joinPath(
            context.extensionUri,
            'resources',
            'icon.png'
        );
    } catch {
        // icon 可能不存在，忽略
    }
}
