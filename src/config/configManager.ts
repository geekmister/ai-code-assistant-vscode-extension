/**
 * 配置管理器 - 管理模型配置、预设模板等
 */

import * as vscode from 'vscode';

export interface ModelConfig {
    id: string;
    name: string;
    provider: string;
    apiBase: string;
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
}

export interface PricingConfig {
    inputPricePer1M: number;
    outputPricePer1M: number;
}

export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export interface ExecutionLog {
    id: string;
    timestamp: Date;
    type: 'tool_call' | 'model_response' | 'file_operation' | 'terminal_command' | 'error' | 'info';
    title: string;
    details: string;
    toolName?: string;
    toolArgs?: any;
    status?: 'pending' | 'success' | 'error' | 'cancelled';
}

export class ConfigManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 获取所有配置的模型
     */
    getModels(): ModelConfig[] {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        const models = config.get<ModelConfig[]>('models', []);
        return models.map(model => this.resolveEnvVariables(model));
    }

    /**
     * 获取默认模型
     */
    getDefaultModel(): ModelConfig | undefined {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        const defaultId = config.get<string>('defaultModel', '');
        
        if (!defaultId) {
            const models = this.getModels();
            return models[0];
        }
        
        return this.getModels().find(m => m.id === defaultId);
    }

    /**
     * 获取当前激活的模型
     */
    getActiveModel(): ModelConfig | undefined {
        return this.getDefaultModel();
    }

    /**
     * 设置默认模型
     */
    async setDefaultModel(modelId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        await config.update('defaultModel', modelId, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 添加或更新模型
     */
    async saveModel(model: ModelConfig): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        const models = this.getModels();
        
        const existingIndex = models.findIndex(m => m.id === model.id);
        if (existingIndex >= 0) {
            models[existingIndex] = model;
        } else {
            models.push(model);
        }
        
        await config.update('models', models, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 删除模型
     */
    async deleteModel(modelId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        const models = this.getModels().filter(m => m.id !== modelId);
        await config.update('models', models, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 快速配置 DeepSeek V4 Pro
     */
    async quickConfigDeepSeekPro(apiKey: string): Promise<void> {
        const model: ModelConfig = {
            id: 'deepseek-v4-pro',
            name: 'DeepSeek V4 Pro',
            provider: 'deepseek',
            apiBase: 'https://api.deepseek.com/v1',
            apiKey: apiKey,
            model: 'deepseek-v4-pro',
            maxTokens: 131072,
            temperature: 0.7
        };
        
        await this.saveModel(model);
        await this.setDefaultModel('deepseek-v4-pro');
    }

    /**
     * 快速配置 DeepSeek V4 Flash
     */
    async quickConfigDeepSeekFlash(apiKey: string): Promise<void> {
        const model: ModelConfig = {
            id: 'deepseek-v4-flash',
            name: 'DeepSeek V4 Flash',
            provider: 'deepseek',
            apiBase: 'https://api.deepseek.com/v1',
            apiKey: apiKey,
            model: 'deepseek-v4-flash',
            maxTokens: 16384,
            temperature: 0.3
        };
        
        await this.saveModel(model);
        await this.setDefaultModel('deepseek-v4-flash');
    }

    /**
     * 获取模型定价
     */
    getPricing(modelId: string): PricingConfig | undefined {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        const pricing = config.get<Record<string, PricingConfig>>('pricing', {});
        return pricing[modelId];
    }

    /**
     * 获取最大上下文 Token 数
     */
    getMaxContextTokens(): number {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        return config.get<number>('maxContextTokens', 131072);
    }

    /**
     * 是否启用流式输出
     */
    isStreamingEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        return config.get<boolean>('enableStreaming', true);
    }

    /**
     * 是否自动确认文件操作
     */
    isAutoConfirmEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        return config.get<boolean>('autoConfirmFileOperations', false);
    }

    /**
     * 获取 MCP 服务器配置
     */
    getMCPServers(): MCPServerConfig[] {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        return config.get<MCPServerConfig[]>('mcpServers', []);
    }

    /**
     * 是否启用工作区上下文感知
     */
    isWorkspaceContextEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('aiCodingAgent');
        return config.get<boolean>('workspaceContextEnabled', true);
    }

    /**
     * 解析环境变量
     */
    private resolveEnvVariables(model: ModelConfig): ModelConfig {
        const resolve = (value: string) => {
            if (value.startsWith('${env:') && value.endsWith('}')) {
                const envVar = value.slice(6, -1);
                return process.env[envVar] || '';
            }
            return value;
        };
        
        return {
            ...model,
            apiKey: resolve(model.apiKey)
        };
    }

    /**
     * 测试 API 连接
     */
    async testConnection(model: ModelConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${model.apiBase}/models`, {
                headers: {
                    'Authorization': `Bearer ${model.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                return { success: true, message: 'Connection OK' };
            } else {
                const error = await response.text();
                return { success: false, message: `Error: ${response.status} - ${error}` };
            }
        } catch (error: any) {
            return { success: false, message: `Connection Failed: ${error.message}` };
        }
    }
}
