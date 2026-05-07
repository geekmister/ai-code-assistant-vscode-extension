/**
 * 指标收集器 - F14: Model-as-a-Service 统计
 * 实时显示 Token 使用量、API 调用次数、响应耗时与预估费用
 */

import * as vscode from 'vscode';
import { ConfigManager, PricingConfig } from '../config/configManager';

export interface RequestMetrics {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    duration: number;
    timestamp: Date;
    estimatedCost: number;
}

export interface AggregatedMetrics {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalRequests: number;
    totalCost: number;
    averageDuration: number;
    requestsByModel: Record<string, number>;
    tokensByModel: Record<string, number>;
}

export class MetricsCollector {
    private configManager: ConfigManager;
    private metrics: RequestMetrics[] = [];
    private maxMetrics: number = 1000;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * 记录 API 请求
     */
    recordRequest(
        modelId: string,
        inputTokens: number,
        outputTokens: number,
        duration: number
    ): void {
        const pricing = this.configManager.getPricing(modelId);
        const estimatedCost = this.calculateCost(inputTokens, outputTokens, pricing);

        const metric: RequestMetrics = {
            modelId,
            inputTokens,
            outputTokens,
            duration,
            timestamp: new Date(),
            estimatedCost
        };

        this.metrics.unshift(metric);

        // 限制保存的指标数量
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(0, this.maxMetrics);
        }

        // 更新状态栏
        this.updateStatusBar(metric);
    }

    /**
     * 计算预估费用
     */
    private calculateCost(
        inputTokens: number,
        outputTokens: number,
        pricing?: PricingConfig
    ): number {
        if (!pricing) {
            return 0;
        }

        const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePer1M;
        const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePer1M;

        return inputCost + outputCost;
    }

    /**
     * 获取聚合指标
     */
    getAggregatedMetrics(): AggregatedMetrics {
        const totalInputTokens = this.metrics.reduce((sum, m) => sum + m.inputTokens, 0);
        const totalOutputTokens = this.metrics.reduce((sum, m) => sum + m.outputTokens, 0);
        const totalCost = this.metrics.reduce((sum, m) => sum + m.estimatedCost, 0);
        const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);

        const requestsByModel: Record<string, number> = {};
        const tokensByModel: Record<string, number> = {};

        for (const metric of this.metrics) {
            requestsByModel[metric.modelId] = (requestsByModel[metric.modelId] || 0) + 1;
            tokensByModel[metric.modelId] = (tokensByModel[metric.modelId] || 0) 
                + metric.inputTokens + metric.outputTokens;
        }

        return {
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            totalRequests: this.metrics.length,
            totalCost,
            averageDuration: this.metrics.length > 0 ? totalDuration / this.metrics.length : 0,
            requestsByModel,
            tokensByModel
        };
    }

    /**
     * 获取最近 N 条指标
     */
    getRecentMetrics(count: number = 10): RequestMetrics[] {
        return this.metrics.slice(0, count);
    }

    /**
     * 获取按模型分组的指标
     */
    getMetricsByModel(modelId: string): RequestMetrics[] {
        return this.metrics.filter(m => m.modelId === modelId);
    }

    /**
     * 获取时间范围内的指标
     */
    getMetricsInTimeRange(startTime: Date, endTime: Date): RequestMetrics[] {
        return this.metrics.filter(m => 
            m.timestamp >= startTime && m.timestamp <= endTime
        );
    }

    /**
     * 清空所有指标
     */
    clearMetrics(): void {
        this.metrics = [];
    }

    /**
     * 格式化 Token 数量
     */
    formatTokens(tokens: number): string {
        if (tokens >= 1_000_000) {
            return `${(tokens / 1_000_000).toFixed(2)}M`;
        } else if (tokens >= 1_000) {
            return `${(tokens / 1_000).toFixed(1)}K`;
        }
        return tokens.toString();
    }

    /**
     * 格式化费用
     */
    formatCost(cost: number): string {
        if (cost >= 1) {
            return `$${cost.toFixed(4)}`;
        }
        return `$${(cost * 1000).toFixed(2)}m`;
    }

    /**
     * 格式化耗时
     */
    formatDuration(ms: number): string {
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(1)}s`;
        }
        return `${ms.toFixed(0)}ms`;
    }

    /**
     * 生成统计报告
     */
    generateReport(): string {
        const agg = this.getAggregatedMetrics();
        
        const lines: string[] = [];
        lines.push('## AI Agent 使用统计报告');
        lines.push('');
        lines.push('### 总体统计');
        lines.push(`- 总请求数: ${agg.totalRequests}`);
        lines.push(`- 输入 Token: ${this.formatTokens(agg.totalInputTokens)}`);
        lines.push(`- 输出 Token: ${this.formatTokens(agg.totalOutputTokens)}`);
        lines.push(`- 总 Token: ${this.formatTokens(agg.totalTokens)}`);
        lines.push(`- 总费用: ${this.formatCost(agg.totalCost)}`);
        lines.push(`- 平均响应时间: ${this.formatDuration(agg.averageDuration)}`);
        lines.push('');

        if (Object.keys(agg.requestsByModel).length > 0) {
            lines.push('### 按模型统计');
            for (const [modelId, count] of Object.entries(agg.requestsByModel)) {
                const tokens = agg.tokensByModel[modelId] || 0;
                lines.push(`- ${modelId}: ${count} 次请求, ${this.formatTokens(tokens)} tokens`);
            }
        }

        return lines.join('\n');
    }

    /**
     * 显示统计面板
     */
    async showMetricsPanel(): Promise<void> {
        const agg = this.getAggregatedMetrics();

        const items = [
            `总请求数: ${agg.totalRequests}`,
            `输入 Token: ${this.formatTokens(agg.totalInputTokens)}`,
            `输出 Token: ${this.formatTokens(agg.totalOutputTokens)}`,
            `总费用: ${this.formatCost(agg.totalCost)}`,
            `平均响应时间: ${this.formatDuration(agg.averageDuration)}`
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'AI Agent 使用统计'
        });

        if (selected) {
            vscode.window.showInformationMessage(this.generateReport());
        }
    }

    /**
     * 更新状态栏
     */
    private updateStatusBar(metric: RequestMetrics): void {
        vscode.commands.executeCommand(
            'setContext',
            'aiCodingAgent.lastMetric',
            {
                tokens: metric.inputTokens + metric.outputTokens,
                cost: metric.estimatedCost,
                duration: metric.duration
            }
        );
    }
}
