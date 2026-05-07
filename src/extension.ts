/**
 * VSCode AI Coding Agent - 扩展入口文件
 * 注册 Chat Participant、命令、视图等
 */

import * as vscode from 'vscode';
import { registerChatParticipant } from './agent/chatParticipant';
import { ConfigManager } from './config/configManager';
import { AgentExecutor } from './agent/agentExecutor';
import { ExecutionLogPanel } from './ui/executionLogPanel';
import { ChatPanel } from './ui/chatPanel';
import { registerCommands } from './commands';
import { MetricsCollector } from './metrics/metricsCollector';

let statusBarItem: vscode.StatusBarItem | undefined;
let agentExecutor: AgentExecutor | undefined;
let executionLogPanel: ExecutionLogPanel | undefined;
let chatPanel: ChatPanel | undefined;
let metricsCollector: MetricsCollector | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Coding Agent 扩展正在激活...');

    // 初始化配置管理器
    const configManager = new ConfigManager(context);

    // 初始化指标收集器
    metricsCollector = new MetricsCollector(configManager);

    // 初始化执行日志面板
    executionLogPanel = new ExecutionLogPanel(context.extensionUri);

    // 初始化 Agent 执行器
    agentExecutor = new AgentExecutor(configManager, metricsCollector, executionLogPanel);

    // 初始化 Chat 面板
    chatPanel = new ChatPanel(context, agentExecutor, configManager, metricsCollector);

    // 创建状态栏
    createStatusBar();

    // 注册命令
    registerCommands(context, configManager, agentExecutor, executionLogPanel);

    // 注册 Chat Participant
    registerChatParticipant(context, agentExecutor);

    // 更新状态栏
    updateStatusBar('Ready');

    console.log('AI Coding Agent 扩展激活成功！');
}

function createStatusBar() {
    statusBarItem = vscode.window.createStatusBarItem(
        'aiCodingAgent.status',
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '$(hubot) AI Agent';
    statusBarItem.tooltip = 'AI Coding Agent - 点击打开对话';
    statusBarItem.command = 'aiCodingAgent.openChat';
    statusBarItem.show();
}

export function updateStatusBar(status: string, modelName?: string) {
    if (statusBarItem) {
        const icon = status === 'Ready' ? '$(hubot)' : 
                     status === 'Thinking' ? '$(sync~spin)' : 
                     status === 'Error' ? '$(error)' : '$(hubot)';
        statusBarItem.text = `${icon} AI Agent${modelName ? ` (${modelName})` : ''}: ${status}`;
        
        switch (status) {
            case 'Ready':
                statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
                break;
            case 'Thinking':
                statusBarItem.color = '#4ec9b0';
                break;
            case 'Error':
                statusBarItem.color = '#f48771';
                break;
            default:
                statusBarItem.color = undefined;
        }
    }
}

export async function deactivate() {
    if (agentExecutor) {
        await agentExecutor.cancelCurrentTask();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
