/**
 * 上下文构建器 - F10: 工作区 RAG 上下文感知
 * 支持 #file 快速指定文件参考
 */

import * as vscode from 'vscode';
import { ChatMessage } from '../agent/agentExecutor';

export class ContextBuilder {
    /**
     * 从消息中提取 #file 引用
     */
    extractFileReferences(message: string): string[] {
        const references: string[] = [];
        const regex = /#file:([^\s]+)/g;
        let match;

        while ((match = regex.exec(message)) !== null) {
            references.push(match[1]);
        }

        return references;
    }

    /**
     * 构建用户消息（处理 #file 引用）
     */
    async buildUserMessage(
        userMessage: string,
        workspaceFolder?: string
    ): Promise<{ message: string; context: string | null }> {
        const references = this.extractFileReferences(userMessage);
        
        if (references.length === 0) {
            return { message: userMessage, context: null };
        }

        // 移除 #file 引用
        const cleanMessage = userMessage.replace(/#file:[^\s]+/g, '').trim();

        // 获取引用的文件内容
        const contextParts: string[] = [];

        for (const ref of references) {
            try {
                const filePath = this.resolveFilePath(ref, workspaceFolder);
                const document = await vscode.workspace.openTextDocument(filePath);
                const content = document.getText();
                const lineCount = document.lineCount;
                const language = document.languageId;

                contextParts.push(
                    `【文件: ${ref}】\n` +
                    `语言: ${language}\n` +
                    `行数: ${lineCount}\n` +
                    `内容:\n\`\`\`${language}\n${content}\n\`\`\``
                );
            } catch (error) {
                contextParts.push(`【文件: ${ref}】\n无法读取此文件`);
            }
        }

        const context = contextParts.join('\n\n');

        return {
            message: cleanMessage,
            context
        };
    }

    /**
     * 解析文件路径
     */
    private resolveFilePath(ref: string, workspaceFolder?: string): string {
        // 如果是绝对路径，直接使用
        if (vscode.Uri.parse(ref).scheme) {
            return ref;
        }

        // 解析工作区相对路径
        if (workspaceFolder) {
            return vscode.Uri.joinPath(vscode.Uri.file(workspaceFolder), ref).fsPath;
        }

        // 使用第一个工作区文件夹
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.Uri.joinPath(
                vscode.workspace.workspaceFolders[0].uri,
                ref
            ).fsPath;
        }

        return ref;
    }

    /**
     * 获取工作区结构上下文
     */
    async getWorkspaceStructure(depth: number = 2): Promise<string | null> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null;
        }

        const folder = vscode.workspace.workspaceFolders[0];
        const structure = await this.buildTree(folder.uri, depth);

        return `【工作区: ${folder.name}】\n${structure}`;
    }

    /**
     * 构建目录树
     */
    private async buildTree(uri: vscode.Uri, depth: number, prefix: string = ''): Promise<string> {
        if (depth <= 0) {
            return `${prefix}...\n`;
        }

        let result = '';
        const entries = await vscode.workspace.fs.readDirectory(uri);

        // 排序：目录在前，文件在后
        entries.sort((a, b) => {
            if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
            if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
            return a[0].localeCompare(b[0]);
        });

        const maxItems = 20; // 限制显示数量
        const displayEntries = entries.slice(0, maxItems);

        for (let i = 0; i < displayEntries.length; i++) {
            const [name, type] = displayEntries[i];
            const isLast = i === displayEntries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = prefix + (isLast ? '    ' : '│   ');

            result += `${prefix}${connector}${name}${type === vscode.FileType.Directory ? '/' : ''}\n`;

            if (type === vscode.FileType.Directory && depth > 1) {
                const childUri = vscode.Uri.joinPath(uri, name);
                result += await this.buildTree(childUri, depth - 1, childPrefix);
            }
        }

        if (entries.length > maxItems) {
            result += `${prefix}... 还有 ${entries.length - maxItems} 个项目\n`;
        }

        return result;
    }

    /**
     * 获取当前光标位置的代码上下文
     */
    async getCurrentCodeContext(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        const document = editor.document;
        const position = editor.selection.active;
        const currentLine = document.lineAt(position);

        // 获取当前函数或类
        const functionContext = await this.getSurroundingCode(document, position, 20);

        return `【当前文件: ${vscode.workspace.asRelativePath(document.uri)}】\n` +
               `【行 ${position.line + 1}, 列 ${position.character + 1}】\n\n` +
               `【周围代码】:\n\`\`\`${document.languageId}\n${functionContext}\n\`\`\``;
    }

    /**
     * 获取周围的代码
     */
    private async getSurroundingCode(
        document: vscode.TextDocument,
        position: vscode.Position,
        aroundLines: number
    ): Promise<string> {
        const startLine = Math.max(0, position.line - aroundLines);
        const endLine = Math.min(document.lineCount - 1, position.line + aroundLines);

        const lines: string[] = [];
        
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i);
            const prefix = i === position.line ? '>>> ' : '    ';
            lines.push(`${prefix}${line.text}`);
        }

        return lines.join('\n');
    }

    /**
     * 搜索代码中的符号
     */
    async searchSymbol(symbolName: string): Promise<string | null> {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            symbolName
        );

        if (!symbols || symbols.length === 0) {
            return null;
        }

        const results = symbols.slice(0, 10).map(sym => {
            const location = sym.location;
            return `【${sym.kind.toString()}】 ${sym.name}\n` +
                   `位置: ${vscode.workspace.asRelativePath(location.uri)}:${location.range.start.line + 1}`;
        });

        return `【符号搜索: ${symbolName}】\n\n${results.join('\n\n')}`;
    }
}
