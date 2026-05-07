/**
 * 流式输出管理器 - F9: 流式输出与增量渲染
 * 支持 SSE 流式输出，逐字显示，中途取消
 */

import * as vscode from 'vscode';

export interface StreamingOptions {
    onChunk?: (chunk: string) => void;
    onComplete?: (fullContent: string) => void;
    onError?: (error: Error) => void;
    onCancel?: () => void;
}

export class StreamingOutputManager {
    private isStreaming: boolean = false;
    private abortController: AbortController | undefined;
    private currentContent: string = '';
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // 注册取消快捷键监听
        this.registerCancelHandler();
    }

    /**
     * 开始流式输出
     */
    async startStreaming(options: StreamingOptions): Promise<string> {
        this.isStreaming = true;
        this.currentContent = '';
        this.abortController = new AbortController();

        return new Promise((resolve, reject) => {
            // 监听取消信号
            const cancelHandler = () => {
                if (this.isStreaming) {
                    this.cancel();
                    options.onCancel?.();
                    reject(new Error('Stream cancelled'));
                }
            };

            this.disposables.push(
                vscode.commands.registerCommand('aiCodingAgent.cancelCurrentTask', cancelHandler)
            );

            // 设置超时
            const timeout = setTimeout(() => {
                if (this.isStreaming) {
                    this.cancel();
                    options.onError?.(new Error('Stream timeout'));
                    reject(new Error('Stream timeout'));
                }
            }, 300000); // 5 分钟超时

            // 存储完成回调
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.currentOptions = options;
            this.timeoutHandle = timeout;
        });
    }

    private currentResolve?: (value: string) => void;
    private currentReject?: (reason?: any) => void;
    private currentOptions?: StreamingOptions;
    private timeoutHandle?: NodeJS.Timeout;

    /**
     * 处理接收到的数据块
     */
    processChunk(chunk: string): void {
        if (!this.isStreaming) return;

        this.currentContent += chunk;
        this.currentOptions?.onChunk?.(chunk);
    }

    /**
     * 完成流式输出
     */
    complete(): void {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
        }

        // 清理监听器
        this.dispose();

        this.currentOptions?.onComplete?.(this.currentContent);
        this.currentResolve?.(this.currentContent);
    }

    /**
     * 处理错误
     */
    error(error: Error): void {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
        }

        this.dispose();

        this.currentOptions?.onError?.(error);
        this.currentReject?.(error);
    }

    /**
     * 取消流式输出
     */
    cancel(): void {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        this.abortController?.abort();

        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
        }

        this.dispose();

        this.currentOptions?.onCancel?.();
        this.currentResolve?.(this.currentContent);
    }

    /**
     * 检查是否正在流式输出
     */
    getIsStreaming(): boolean {
        return this.isStreaming;
    }

    /**
     * 获取当前内容
     */
    getCurrentContent(): string {
        return this.currentContent;
    }

    /**
     * 注册取消快捷键处理
     */
    private registerCancelHandler(): void {
        // 监听 Escape 键
        const disposable = vscode.commands.registerCommand('workbench.action.closeQuickFix', () => {
            if (this.isStreaming) {
                this.cancel();
            }
        });
        
        this.disposables.push(disposable);
    }

    /**
     * 清理资源
     */
    private dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

/**
 * SSE 事件解析器
 */
export class SSEParser {
    private buffer: string = '';
    private decoder = new TextDecoder();

    /**
     * 解析 SSE 数据
     */
    parse(data: Uint8Array): SSEEvent[] {
        const text = this.decoder.decode(data);
        this.buffer += text;
        
        const events: SSEEvent[] = [];
        const lines = this.buffer.split('\n');
        
        // 保留最后一个不完整的行
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const event = this.parseLine(line.slice(6));
                if (event) {
                    events.push(event);
                }
            }
        }

        return events;
    }

    /**
     * 解析单行数据
     */
    private parseLine(line: string): SSEEvent | undefined {
        if (line === '[DONE]') {
            return { type: 'done', data: '' };
        }

        try {
            const json = JSON.parse(line);
            
            // OpenAI 流式格式
            if (json.choices) {
                const choice = json.choices[0];
                const delta = choice.delta;
                
                if (delta?.content) {
                    return {
                        type: 'content',
                        data: delta.content
                    };
                }
                
                if (delta?.tool_calls) {
                    return {
                        type: 'tool_call',
                        data: delta.tool_calls
                    };
                }
                
                if (choice.finish_reason) {
                    return {
                        type: 'finish',
                        data: choice.finish_reason
                    };
                }
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * 清空缓冲区
     */
    clear(): void {
        this.buffer = '';
    }
}

export interface SSEEvent {
    type: 'content' | 'tool_call' | 'done' | 'finish' | 'error';
    data: any;
}
