/**
 * 上下文窗口管理器 - F13: 长文本窗口管理
 * 支持滑动窗口机制，自动按重要性保留上下文
 */

import { ChatMessage } from './agentExecutor';

export interface WindowConfig {
    maxTokens: number;
    preserveSystemMessages: boolean;
    preserveLastNUserMessages: number;
}

export class ContextWindowManager {
    private maxTokens: number;
    private preserveSystemMessages: boolean;
    private preserveLastNUserMessages: number;

    constructor(maxTokens: number = 131072) {
        this.maxTokens = maxTokens;
        this.preserveSystemMessages = true;
        this.preserveLastNUserMessages = 10;
    }

    /**
     * 估算消息的 Token 数量
     */
    estimateMessageTokens(message: ChatMessage): number {
        // 估算公式：基础开销 + 内容长度
        const baseOverhead = 10; // role, content 等字段开销
        const contentLength = message.content.length;
        
        // 中文约 2 字符/token，英文约 4 字符/token
        const chineseChars = (message.content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = contentLength - chineseChars;
        
        return baseOverhead + Math.ceil(chineseChars / 2 + otherChars / 4);
    }

    /**
     * 计算消息列表的总 Token 数
     */
    calculateTotalTokens(messages: ChatMessage[]): number {
        return messages.reduce((total, msg) => total + this.estimateMessageTokens(msg), 0);
    }

    /**
     * 检查是否需要滑动窗口
     */
    needsTrimming(messages: ChatMessage[]): boolean {
        return this.calculateTotalTokens(messages) > this.maxTokens * 0.9; // 90% 阈值
    }

    /**
     * 裁剪上下文（如果需要）
     */
    trimContextIfNeeded(messages: ChatMessage[], maxTokens?: number): ChatMessage[] {
        const limit = maxTokens || this.maxTokens;
        
        if (!this.needsTrimming(messages)) {
            return messages;
        }

        return this.trimMessages(messages, limit);
    }

    /**
     * 执行消息裁剪
     */
    private trimMessages(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
        if (messages.length <= 2) {
            return messages; // 至少保留系统消息和用户消息
        }

        // 分离不同类型的消息
        const systemMessages: ChatMessage[] = [];
        const otherMessages: ChatMessage[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemMessages.push(msg);
            } else {
                otherMessages.push(msg);
            }
        }

        // 保留系统消息
        const systemTokens = this.calculateTotalTokens(systemMessages);
        const availableTokens = maxTokens - systemTokens - 50; // 留一些余量

        if (availableTokens <= 0) {
            // 系统消息就超过了限制，只保留最新的用户消息
            const latestUserMessage = otherMessages.filter(m => m.role === 'user').pop();
            if (latestUserMessage) {
                return [systemMessages[0], latestUserMessage];
            }
            return [systemMessages[0]];
        }

        // 从后向前保留消息
        const trimmedMessages: ChatMessage[] = [...systemMessages];
        let currentTokens = 0;

        // 先保留最后几条用户消息（保持对话上下文）
        const recentUserMessages: ChatMessage[] = [];
        for (let i = otherMessages.length - 1; i >= 0; i--) {
            const msg = otherMessages[i];
            if (msg.role === 'user') {
                recentUserMessages.unshift(msg);
                currentTokens += this.estimateMessageTokens(msg);
                if (recentUserMessages.length >= this.preserveLastNUserMessages) {
                    break;
                }
            }
        }

        // 如果最近的摘要消息就占满了空间，使用摘要
        if (currentTokens >= availableTokens) {
            // 创建一个摘要
            const summaryMsg: ChatMessage = {
                role: 'system',
                content: this.createSummary(otherMessages)
            };
            trimmedMessages.push(summaryMsg);
            return trimmedMessages;
        }

        // 逐步添加其他消息
        const remainingTokens = availableTokens - currentTokens;
        let includedMessages: ChatMessage[] = [];

        for (const msg of otherMessages.reverse()) {
            const msgTokens = this.estimateMessageTokens(msg);
            if (msgTokens <= remainingTokens - currentTokens) {
                includedMessages.unshift(msg);
                currentTokens += msgTokens;
            } else {
                break;
            }
        }

        trimmedMessages.push(...recentUserMessages, ...includedMessages);

        return trimmedMessages;
    }

    /**
     * 创建消息摘要
     */
    private createSummary(messages: ChatMessage[]): string {
        const conversationLength = messages.length;
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');

        let summary = `【对话摘要 - 原始消息数: ${conversationLength}】\n`;
        summary += `用户消息: ${userMessages.length} 条\n`;
        summary += `助手消息: ${assistantMessages.length} 条\n\n`;

        // 保留最近几条完整消息作为上下文
        const recentMessages = messages.slice(-6);
        summary += '【最近的对话内容】\n';

        for (const msg of recentMessages) {
            const prefix = msg.role === 'user' ? '👤 用户' : '🤖 助手';
            const content = msg.content.slice(0, 200);
            summary += `${prefix}: ${content}${msg.content.length > 200 ? '...' : ''}\n`;
        }

        return summary;
    }

    /**
     * 获取上下文使用情况
     */
    getContextUsage(messages: ChatMessage[]): {
        usedTokens: number;
        maxTokens: number;
        usagePercent: number;
        needsTrimming: boolean;
    } {
        const usedTokens = this.calculateTotalTokens(messages);
        const usagePercent = (usedTokens / this.maxTokens) * 100;

        return {
            usedTokens,
            maxTokens: this.maxTokens,
            usagePercent,
            needsTrimming: this.needsTrimming(messages)
        };
    }

    /**
     * 更新最大 Token 限制
     */
    updateMaxTokens(maxTokens: number): void {
        this.maxTokens = maxTokens;
    }
}
