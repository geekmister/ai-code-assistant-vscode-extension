/**
 * 设置面板 - F2: 多模型API Key配置 + F3: 一键配置 DeepSeek V4
 */

import * as vscode from 'vscode';
import { ConfigManager, ModelConfig } from '../config/configManager';

export class SettingsPanel {
    private context: vscode.Uri;
    private panel: vscode.WebviewPanel | undefined;
    private configManager: ConfigManager;

    constructor(context: vscode.Uri, configManager: ConfigManager) {
        this.context = context;
        this.configManager = configManager;
    }

    /**
     * 创建或显示面板
     */
    createOrShow(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'aiCodingAgent.settings',
            'AI Agent 设置',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml();
        
        // 监听消息
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message);
        });
    }

    /**
     * 处理 Webview 消息
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'getModels':
                this.sendModels();
                break;
            case 'addModel':
                await this.addModel(message.data);
                break;
            case 'deleteModel':
                await this.deleteModel(message.modelId);
                break;
            case 'setDefaultModel':
                await this.setDefaultModel(message.modelId);
                break;
            case 'testConnection':
                await this.testConnection(message.modelId);
                break;
            case 'quickConfig':
                await this.quickConfig(message.model);
                break;
        }
    }

    /**
     * 发送模型列表到 Webview
     */
    private sendModels(): void {
        if (!this.panel) return;

        const models = this.configManager.getModels();
        const defaultModel = this.configManager.getDefaultModel();

        this.panel.webview.postMessage({
            type: 'modelsList',
            models,
            defaultModelId: defaultModel?.id
        });
    }

    /**
     * 添加模型
     */
    private async addModel(data: Partial<ModelConfig>): Promise<void> {
        const model: ModelConfig = {
            id: data.id || `model-${Date.now()}`,
            name: data.name || 'New Model',
            provider: data.provider || 'custom',
            apiBase: data.apiBase || '',
            apiKey: data.apiKey || '',
            model: data.model || '',
            maxTokens: data.maxTokens || 131072,
            temperature: data.temperature || 0.7
        };

        await this.configManager.saveModel(model);
        this.sendModels();
        
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'notification',
                message: '模型已添加',
                kind: 'success'
            });
        }
    }

    /**
     * 删除模型
     */
    private async deleteModel(modelId: string): Promise<void> {
        await this.configManager.deleteModel(modelId);
        this.sendModels();
    }

    /**
     * 设置默认模型
     */
    private async setDefaultModel(modelId: string): Promise<void> {
        await this.configManager.setDefaultModel(modelId);
        this.sendModels();
    }

    /**
     * 测试连接
     */
    private async testConnection(modelId: string): Promise<void> {
        const models = this.configManager.getModels();
        const model = models.find(m => m.id === modelId);
        
        if (!model || !this.panel) return;

        const result = await this.configManager.testConnection(model);
        
        this.panel.webview.postMessage({
            type: 'connectionResult',
            modelId,
            success: result.success,
            message: result.message
        });
    }

    /**
     * 快速配置
     */
    private async quickConfig(model: 'pro' | 'flash'): Promise<void> {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入 DeepSeek API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) return;

        if (model === 'pro') {
            await this.configManager.quickConfigDeepSeekPro(apiKey);
        } else {
            await this.configManager.quickConfigDeepSeekFlash(apiKey);
        }

        this.sendModels();
        
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'notification',
                message: `已配置 DeepSeek V4 ${model === 'pro' ? 'Pro' : 'Flash'}`,
                kind: 'success'
            });
        }
    }

    /**
     * 生成 HTML
     */
    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Agent 设置</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header { margin-bottom: 24px; }
        .header h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        .header p { color: var(--vscode-descriptionForeground); font-size: 13px; }
        
        .section { margin-bottom: 24px; }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        
        .quick-config {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 24px;
        }
        .quick-btn {
            padding: 16px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-editorWidget-background);
            border-radius: 8px;
            cursor: pointer;
            text-align: left;
            transition: all 0.2s;
        }
        .quick-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        .quick-btn h3 { font-size: 14px; margin-bottom: 4px; }
        .quick-btn p { font-size: 12px; color: var(--vscode-descriptionForeground); }
        .quick-btn .badge {
            display: inline-block;
            padding: 2px 8px;
            background: #4ec9b033;
            color: #4ec9b0;
            border-radius: 4px;
            font-size: 10px;
            margin-top: 8px;
        }
        
        .model-list { display: flex; flex-direction: column; gap: 8px; }
        .model-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--vscode-editorWidget-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-widget-border);
        }
        .model-item.active {
            border-color: #4ec9b0;
        }
        .model-info h4 { font-size: 14px; font-weight: 500; }
        .model-info p { font-size: 12px; color: var(--vscode-descriptionForeground); }
        .model-actions { display: flex; gap: 8px; }
        .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn.primary { background: #4ec9b0; color: #000; border-color: #4ec9b0; }
        .btn.primary:hover { background: #3db89c; }
        .btn.danger { color: #f48771; }
        
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; margin-bottom: 6px; }
        .form-group input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-textEditorWidget-background);
            color: var(--vscode-editor-foreground);
            border-radius: 4px;
            font-size: 13px;
        }
        .form-group input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Agent 设置</h1>
        <p>配置和管理您的 AI 模型</p>
    </div>
    
    <div class="section">
        <h2 class="section-title">快速配置</h2>
        <div class="quick-config">
            <div class="quick-btn" onclick="quickConfig('pro')">
                <h3>DeepSeek V4 Pro</h3>
                <p>旗舰推理模型，百万上下文</p>
                <span class="badge">推荐</span>
            </div>
            <div class="quick-btn" onclick="quickConfig('flash')">
                <h3>DeepSeek V4 Flash</h3>
                <p>轻量快速，成本低</p>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">已配置模型</h2>
        <div class="model-list" id="modelList">
            <div class="empty-state">暂无已配置的模型</div>
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">添加自定义模型</h2>
        <form id="addModelForm">
            <div class="form-group">
                <label>模型名称</label>
                <input type="text" id="modelName" placeholder="My Model" required>
            </div>
            <div class="form-group">
                <label>API Base URL</label>
                <input type="text" id="apiBase" placeholder="https://api.openai.com/v1" required>
            </div>
            <div class="form-group">
                <label>API Key</label>
                <input type="password" id="apiKey" placeholder="sk-..." required>
            </div>
            <div class="form-group">
                <label>模型 ID</label>
                <input type="text" id="modelId" placeholder="gpt-4" required>
            </div>
            <button type="submit" class="btn primary">添加模型</button>
        </form>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function loadModels() {
            vscode.postMessage({ type: 'getModels' });
        }
        
        function quickConfig(model) {
            vscode.postMessage({ type: 'quickConfig', model });
        }
        
        function setDefault(modelId) {
            vscode.postMessage({ type: 'setDefaultModel', modelId });
        }
        
        function deleteModel(modelId) {
            vscode.postMessage({ type: 'deleteModel', modelId });
        }
        
        function testConnection(modelId) {
            vscode.postMessage({ type: 'testConnection', modelId });
        }
        
        document.getElementById('addModelForm').addEventListener('submit', (e) => {
            e.preventDefault();
            vscode.postMessage({
                type: 'addModel',
                data: {
                    name: document.getElementById('modelName').value,
                    apiBase: document.getElementById('apiBase').value,
                    apiKey: document.getElementById('apiKey').value,
                    model: document.getElementById('modelId').value
                }
            });
            e.target.reset();
        });
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'modelsList') {
                renderModels(message.models, message.defaultModelId);
            }
        });
        
        function renderModels(models, defaultId) {
            const list = document.getElementById('modelList');
            if (!models || models.length === 0) {
                list.innerHTML = '<div class="empty-state">暂无已配置的模型</div>';
                return;
            }
            list.innerHTML = models.map(m => \`
                <div class="model-item \${m.id === defaultId ? 'active' : ''}">
                    <div class="model-info">
                        <h4>\${m.name} \${m.id === defaultId ? '✓' : ''}</h4>
                        <p>\${m.apiBase} / \${m.model}</p>
                    </div>
                    <div class="model-actions">
                        \${m.id !== defaultId ? \`<button class="btn" onclick="setDefault('\${m.id}')">设为默认</button>\` : ''}
                        <button class="btn" onclick="testConnection('\${m.id}')">测试</button>
                        <button class="btn danger" onclick="deleteModel('\${m.id}')">删除</button>
                    </div>
                </div>
            \`).join('');
        }
        
        loadModels();
    </script>
</body>
</html>`;
    }
}
