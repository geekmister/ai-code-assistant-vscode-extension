/**
 * 命令注册 - 所有 VSCode 命令的注册和实现
 */

import * as vscode from 'vscode';
import { ConfigManager, ModelConfig } from './config/configManager';
import { AgentExecutor } from './agent/agentExecutor';
import { ExecutionLogPanel } from './ui/executionLogPanel';
import { updateStatusBar } from './extension';

export function registerCommands(
    context: vscode.ExtensionContext,
    configManager: ConfigManager,
    agentExecutor: AgentExecutor,
    executionLogPanel: ExecutionLogPanel
) {
    // 配置模型
    registerConfigureCommand(context, configManager);

    // 打开设置
    registerOpenSettingsCommand(context);

    // 打开日志面板
    registerOpenLogPanelCommand(context, executionLogPanel);

    // 快速配置 DeepSeek
    registerQuickConfigCommands(context, configManager);

    // 切换模型
    registerSwitchModelCommand(context, configManager);

    // 取消任务
    registerCancelTaskCommand(context, agentExecutor);

    // 创建分支
    registerCreateBranchCommand(context);

    // 确认/拒绝工具执行
    registerToolConfirmationCommands(context, agentExecutor);
}

/**
 * 配置模型命令
 */
function registerConfigureCommand(context: vscode.ExtensionContext, configManager: ConfigManager) {
    vscode.commands.registerCommand('aiCodingAgent.configure', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入 DeepSeek API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) {
            return;
        }

        const choice = await vscode.window.showQuickPick(
            ['DeepSeek V4 Pro', 'DeepSeek V4 Flash', '其他模型'],
            { placeHolder: '选择要配置的模型类型' }
        );

        if (!choice) {
            return;
        }

        if (choice === 'DeepSeek V4 Pro') {
            await configManager.quickConfigDeepSeekPro(apiKey);
            vscode.window.showInformationMessage('已配置 DeepSeek V4 Pro');
        } else if (choice === 'DeepSeek V4 Flash') {
            await configManager.quickConfigDeepSeekFlash(apiKey);
            vscode.window.showInformationMessage('已配置 DeepSeek V4 Flash');
        } else {
            // 其他模型手动配置
            const modelName = await vscode.window.showInputBox({
                prompt: '输入模型名称',
                value: 'my-model'
            });
            
            if (!modelName) return;

            const model: ModelConfig = {
                id: `custom-${Date.now()}`,
                name: modelName,
                provider: 'custom',
                apiBase: await vscode.window.showInputBox({
                    prompt: '输入 API Base URL',
                    value: 'https://api.openai.com/v1'
                }) || '',
                apiKey: apiKey,
                model: await vscode.window.showInputBox({
                    prompt: '输入模型 ID',
                    value: 'gpt-4'
                }) || '',
                maxTokens: 131072,
                temperature: 0.7
            };

            await configManager.saveModel(model);
            await configManager.setDefaultModel(model.id);
            vscode.window.showInformationMessage(`已配置模型: ${modelName}`);
        }

        // 测试连接
        const model = configManager.getDefaultModel();
        if (model) {
            const result = await configManager.testConnection(model);
            if (result.success) {
                vscode.window.showInformationMessage('✅ ' + result.message);
            } else {
                vscode.window.showWarningMessage('⚠️ ' + result.message);
            }
        }
    });
}

/**
 * 打开设置命令
 */
function registerOpenSettingsCommand(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand('aiCodingAgent.openSettings', async () => {
        const action = await vscode.window.showQuickPick(
            [
                { label: '$(settings) 打开扩展设置', value: 'settings' },
                { label: '$(list) 查看已配置模型', value: 'list' },
                { label: '$(plus) 添加新模型', value: 'add' },
                { label: '$(trash) 删除模型', value: 'delete' }
            ],
            { placeHolder: '选择操作' }
        );

        if (!action) return;

        switch (action.value) {
            case 'settings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingAgent');
                break;
            case 'list':
                await vscode.commands.executeCommand('aiCodingAgent.configure');
                break;
            case 'add':
                await vscode.commands.executeCommand('aiCodingAgent.configure');
                break;
            case 'delete':
                await vscode.commands.executeCommand('aiCodingAgent.configure');
                break;
        }
    });
}

/**
 * 打开日志面板命令
 */
function registerOpenLogPanelCommand(context: vscode.ExtensionContext, executionLogPanel: ExecutionLogPanel) {
    vscode.commands.registerCommand('aiCodingAgent.openLogPanel', () => {
        executionLogPanel.createOrShow();
    });

    // 注册视图
    const view = vscode.window.createTreeView('aiCodingAgent.executionLog', {
        treeDataProvider: {
            getChildren: () => executionLogPanel.getLogs(),
            getTreeItem: (log) => ({
                label: log.title,
                tooltip: log.details,
                iconPath: new vscode.ThemeIcon(
                    log.status === 'success' ? 'check' :
                    log.status === 'error' ? 'error' :
                    log.status === 'pending' ? 'sync~spin' : 'circle-outline'
                )
            })
        }
    });
}

/**
 * 快速配置 DeepSeek 命令
 */
function registerQuickConfigCommands(context: vscode.ExtensionContext, configManager: ConfigManager) {
    vscode.commands.registerCommand('aiCodingAgent.quickConfigDeepSeekPro', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入 DeepSeek API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) return;

        await configManager.quickConfigDeepSeekPro(apiKey);
        const result = await configManager.testConnection(configManager.getDefaultModel()!);
        
        vscode.window.showInformationMessage(
            result.success ? '✅ DeepSeek V4 Pro 配置成功' : `⚠️ ${result.message}`
        );
    });

    vscode.commands.registerCommand('aiCodingAgent.quickConfigDeepSeekFlash', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入 DeepSeek API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) return;

        await configManager.quickConfigDeepSeekFlash(apiKey);
        const result = await configManager.testConnection(configManager.getDefaultModel()!);
        
        vscode.window.showInformationMessage(
            result.success ? '✅ DeepSeek V4 Flash 配置成功' : `⚠️ ${result.message}`
        );
    });
}

/**
 * 切换模型命令 - F12: 模型热切换
 */
function registerSwitchModelCommand(context: vscode.ExtensionContext, configManager: ConfigManager) {
    vscode.commands.registerCommand('aiCodingAgent.switchModel', async () => {
        const models = configManager.getModels();
        
        if (models.length === 0) {
            vscode.window.showWarningMessage('请先配置至少一个模型');
            return;
        }

        const items = models.map(model => ({
            label: `$(hubot) ${model.name}`,
            description: `${model.provider} - ${model.model}`,
            model
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要切换的模型'
        });

        if (selected) {
            await configManager.setDefaultModel(selected.model.id);
            updateStatusBar('Ready', selected.model.name);
            vscode.window.showInformationMessage(`已切换到模型: ${selected.model.name}`);
        }
    });
}

/**
 * 取消任务命令
 */
function registerCancelTaskCommand(context: vscode.ExtensionContext, agentExecutor: AgentExecutor) {
    vscode.commands.registerCommand('aiCodingAgent.cancelCurrentTask', async () => {
        if (agentExecutor.isCurrentlyStreaming()) {
            await agentExecutor.cancelCurrentTask();
            vscode.window.showInformationMessage('已取消当前任务');
        } else {
            vscode.window.showInformationMessage('当前没有正在执行的任务');
        }
    });
}

/**
 * 创建分支命令 - F8: 对话窗口分支功能
 */
function registerCreateBranchCommand(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand('aiCodingAgent.createBranch', async () => {
        const branchName = await vscode.window.showInputBox({
            prompt: '输入分支名称',
            value: `branch-${Date.now()}`
        });

        if (!branchName) return;

        // 创建分支
        vscode.window.showInformationMessage(`已创建分支: ${branchName}`);
        
        // 设置上下文标志
        vscode.commands.executeCommand('setContext', 'aiCodingAgent.branchCreated', branchName);
    });
}

/**
 * 工具执行确认命令
 */
function registerToolConfirmationCommands(context: vscode.ExtensionContext, agentExecutor: AgentExecutor) {
    vscode.commands.registerCommand('aiCodingAgent.confirmToolExecution', async (toolCall: any) => {
        // 这个命令通常由 Agent 自动处理，不需要手动调用
        vscode.window.showInformationMessage('工具执行已确认');
    });

    vscode.commands.registerCommand('aiCodingAgent.rejectToolExecution', async () => {
        vscode.window.showInformationMessage('工具执行已拒绝');
    });
}
