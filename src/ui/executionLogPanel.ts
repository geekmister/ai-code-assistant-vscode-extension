/**
 * 执行日志面板 - F11: Agent 执行日志面板
 * 显示完整的事件时间线
 */

import * as vscode from 'vscode';
import { ExecutionLog } from '../config/configManager';

export class ExecutionLogPanel {
    private context: vscode.Uri;
    private panel: vscode.WebviewPanel | undefined;
    private logs: ExecutionLog[] = [];
    private maxLogs: number = 100;

    constructor(context: vscode.Uri) {
        this.context = context;
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
            'aiCodingAgent.executionLog',
            'Agent 执行日志',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    /**
     * 添加日志
     */
    addLog(log: ExecutionLog): void {
        this.logs.unshift(log);
        
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        this.updateWebview();
    }

    /**
     * 更新日志状态
     */
    updateLogStatus(logId: string, status: 'pending' | 'success' | 'error' | 'cancelled'): void {
        const log = this.logs.find(l => l.id === logId);
        if (log) {
            log.status = status;
            this.updateWebview();
        }
    }

    /**
     * 获取所有日志
     */
    getLogs(): ExecutionLog[] {
        return this.logs;
    }

    /**
     * 清空日志
     */
    clearLogs(): void {
        this.logs = [];
        this.updateWebview();
    }

    /**
     * 更新 Webview
     */
    private updateWebview(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'updateLogs',
                logs: this.logs
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
    <title>Agent 执行日志</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 16px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .header h1 { font-size: 16px; font-weight: 600; }
        .btn {
            padding: 4px 12px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .stats {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
            padding: 12px;
            background: var(--vscode-editorWidget-background);
            border-radius: 6px;
        }
        .stat-item { display: flex; align-items: center; gap: 6px; }
        .stat-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
        .stat-value { font-weight: 600; font-size: 14px; }
        .log-list { display: flex; flex-direction: column; gap: 8px; }
        .log-item {
            padding: 12px;
            background: var(--vscode-editorWidget-background);
            border-radius: 6px;
            border-left: 3px solid #4ec9b0;
            cursor: pointer;
        }
        .log-item:hover { background: var(--vscode-list-hoverBackground); }
        .log-item.pending { border-left-color: #dcdcaa; }
        .log-item.success { border-left-color: #4ec9b0; }
        .log-item.error { border-left-color: #f48771; }
        .log-item.cancelled { border-left-color: #808080; }
        .log-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .log-title { font-weight: 600; font-size: 13px; }
        .log-time { color: var(--vscode-descriptionForeground); font-size: 11px; }
        .log-details {
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            background: var(--vscode-textEditorWidget-background);
            padding: 8px;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        .log-type {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            text-transform: uppercase;
            margin-left: 8px;
        }
        .log-type.tool_call { background: #4ec9b033; color: #4ec9b0; }
        .log-type.model_response { background: #569cd633; color: #569cd6; }
        .log-type.file_operation { background: #ce917833; color: #ce9178; }
        .log-type.terminal_command { background: #c586c033; color: #c586c0; }
        .log-type.error { background: #f4877133; color: #f48771; }
        .log-type.info { background: #4ec9b033; color: #4ec9b0; }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Agent 执行日志</h1>
        <button class="btn" onclick="clearLogs()">清空</button>
    </div>
    
    <div class="stats">
        <div class="stat-item"><span class="stat-label">总数:</span><span class="stat-value" id="totalLogs">0</span></div>
        <div class="stat-item"><span class="stat-label">成功:</span><span class="stat-value" style="color:#4ec9b0" id="successCount">0</span></div>
        <div class="stat-item"><span class="stat-label">失败:</span><span class="stat-value" style="color:#f48771" id="errorCount">0</span></div>
        <div class="stat-item"><span class="stat-label">进行中:</span><span class="stat-value" style="color:#dcdcaa" id="pendingCount">0</span></div>
    </div>
    
    <div class="log-list" id="logList">
        <div class="empty-state"><p>暂无执行日志</p></div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let logs = [];
        
        function updateLogs(newLogs) {
            logs = newLogs;
            renderLogs();
        }
        
        function renderLogs() {
            const logList = document.getElementById('logList');
            document.getElementById('totalLogs').textContent = logs.length;
            document.getElementById('successCount').textContent = logs.filter(l => l.status === 'success').length;
            document.getElementById('errorCount').textContent = logs.filter(l => l.status === 'error').length;
            document.getElementById('pendingCount').textContent = logs.filter(l => l.status === 'pending').length;
            
            if (logs.length === 0) {
                logList.innerHTML = '<div class="empty-state"><p>暂无执行日志</p></div>';
                return;
            }
            
            logList.innerHTML = logs.map(log => \`
                <div class="log-item \${log.status || ''}" onclick="toggleDetails('\${log.id}')">
                    <div class="log-header">
                        <div>
                            <span class="log-title">\${escapeHtml(log.title)}</span>
                            <span class="log-type \${log.type}">\${log.type}</span>
                        </div>
                        <span class="log-time">\${formatTime(log.timestamp)}</span>
                    </div>
                    <div class="log-details" id="details-\${log.id}" style="display:none">\${escapeHtml(log.details)}</div>
                </div>
            \`).join('');
        }
        
        function toggleDetails(id) {
            const details = document.getElementById('details-' + id);
            if (details) details.style.display = details.style.display === 'none' ? 'block' : 'none';
        }
        
        function formatTime(ts) {
            return new Date(ts).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        }
        
        function escapeHtml(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }
        
        function clearLogs() {
            vscode.postMessage({ type: 'clearLogs' });
        }
        
        window.addEventListener('message', event => {
            if (event.data.type === 'updateLogs') updateLogs(event.data.logs);
        });
    </script>
</body>
</html>`;
    }
}
