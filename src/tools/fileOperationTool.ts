/**
 * 文件操作工具 - F5: 自主文件系统操作
 * 支持读取、创建、修改、删除文件，带 diff 预览
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Tool } from './toolRegistry';

export interface FileDiff {
    path: string;
    oldContent?: string;
    newContent: string;
    isNew: boolean;
    isDeleted: boolean;
}

export class FileOperationTool implements Tool {
    name = 'file_operation';
    description = '文件系统操作工具，可以读取、创建、修改文件内容。返回文件的 diff 预览。';

    parameters = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['read', 'write', 'delete', 'list', 'search'],
                description: '操作类型'
            },
            path: {
                type: 'string',
                description: '文件路径（相对于工作区）'
            },
            content: {
                type: 'string',
                description: '文件内容（用于写入操作）'
            },
            overwrite: {
                type: 'boolean',
                description: '是否覆盖已存在的文件'
            },
            pattern: {
                type: 'string',
                description: '搜索模式（用于 search 操作）'
            }
        },
        required: ['action']
    };

    async execute(args: any): Promise<any> {
        const { action, path: filePath, content, overwrite, pattern } = args;

        switch (action) {
            case 'read':
                return await this.readFile(filePath);
            case 'write':
                return await this.writeFile(filePath, content, overwrite);
            case 'delete':
                return await this.deleteFile(filePath);
            case 'list':
                return await this.listFiles(filePath);
            case 'search':
                return await this.searchFiles(filePath, pattern);
            default:
                throw new Error(`未知的文件操作: ${action}`);
        }
    }

    /**
     * 读取文件
     */
    private async readFile(relativePath: string): Promise<any> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const fullPath = path.join(workspaceFolder, relativePath);
        
        if (!fs.existsSync(fullPath)) {
            return {
                success: false,
                error: `文件不存在: ${relativePath}`
            };
        }

        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const stat = fs.statSync(fullPath);

            return {
                success: true,
                path: relativePath,
                content,
                size: stat.size,
                lines: content.split('\n').length,
                lastModified: stat.mtime.toISOString()
            };
        } catch (error: any) {
            return {
                success: false,
                error: `读取文件失败: ${error.message}`
            };
        }
    }

    /**
     * 写入文件
     */
    private async writeFile(relativePath: string, content: string, overwrite?: boolean): Promise<any> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const fullPath = path.join(workspaceFolder, relativePath);
        const dirPath = path.dirname(fullPath);

        // 检查文件是否存在
        if (fs.existsSync(fullPath) && !overwrite) {
            return {
                success: false,
                error: `文件已存在（设置 overwrite=true 可覆盖）`,
                existingContent: fs.readFileSync(fullPath, 'utf-8')
            };
        }

        try {
            // 确保目录存在
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // 获取旧内容（用于 diff）
            let oldContent: string | undefined;
            if (fs.existsSync(fullPath)) {
                oldContent = fs.readFileSync(fullPath, 'utf-8');
            }

            // 生成 diff
            const diff = this.generateDiff(relativePath, oldContent, content);

            // 写入文件
            fs.writeFileSync(fullPath, content, 'utf-8');

            return {
                success: true,
                path: relativePath,
                diff,
                isNew: !oldContent,
                bytesWritten: Buffer.byteLength(content, 'utf-8')
            };
        } catch (error: any) {
            return {
                success: false,
                error: `写入文件失败: ${error.message}`
            };
        }
    }

    /**
     * 删除文件
     */
    private async deleteFile(relativePath: string): Promise<any> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const fullPath = path.join(workspaceFolder, relativePath);

        if (!fs.existsSync(fullPath)) {
            return {
                success: false,
                error: `文件不存在: ${relativePath}`
            };
        }

        try {
            // 获取删除前的内容
            const oldContent = fs.readFileSync(fullPath, 'utf-8');

            // 删除文件
            fs.unlinkSync(fullPath);

            return {
                success: true,
                path: relativePath,
                deletedContent: oldContent,
                message: `已删除文件: ${relativePath}`
            };
        } catch (error: any) {
            return {
                success: false,
                error: `删除文件失败: ${error.message}`
            };
        }
    }

    /**
     * 列出目录中的文件
     */
    private async listFiles(relativePath: string): Promise<any> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const fullPath = path.join(workspaceFolder, relativePath || '.');

        if (!fs.existsSync(fullPath)) {
            return {
                success: false,
                error: `目录不存在: ${relativePath || '.'}`
            };
        }

        try {
            const entries = fs.readdirSync(fullPath, { withFileTypes: true });
            const files = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                path: path.join(relativePath || '.', entry.name)
            }));

            return {
                success: true,
                path: relativePath || '.',
                files
            };
        } catch (error: any) {
            return {
                success: false,
                error: `列出文件失败: ${error.message}`
            };
        }
    }

    /**
     * 搜索文件
     */
    private async searchFiles(relativePath: string, pattern?: string): Promise<any> {
        if (!vscode.workspace.workspaceFolders) {
            return {
                success: false,
                error: '没有打开的工作区'
            };
        }

        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return {
                success: false,
                error: '没有打开的工作区'
            };
        }

        try {
            // 使用 VSCode 的文件搜索
            const searchPattern = new vscode.RelativePattern(
                workspaceFolder,
                pattern || '**/*'
            );

            const files = await vscode.workspace.findFiles(
                searchPattern,
                '**/node_modules/**',
                100
            );

            const result = files.map(file => ({
                name: path.basename(file.fsPath),
                path: vscode.workspace.asRelativePath(file),
                fullPath: file.fsPath
            }));

            return {
                success: true,
                pattern: pattern || '**/*',
                matches: result
            };
        } catch (error: any) {
            return {
                success: false,
                error: `搜索文件失败: ${error.message}`
            };
        }
    }

    /**
     * 生成 diff
     */
    private generateDiff(path: string, oldContent: string | undefined, newContent: string): string {
        if (!oldContent) {
            return `--- /dev/null\n+++ ${path}\n${newContent.split('\n').map((line, i) => `+ ${line}`).join('\n')}`;
        }

        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const diffLines: string[] = [`--- ${path} (original)`, `+++ ${path} (modified)`];

        // 简单的行对比
        const maxLines = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLines; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];

            if (oldLine === newLine) {
                diffLines.push(`  ${newLine || ''}`);
            } else {
                if (oldLine !== undefined) {
                    diffLines.push(`- ${oldLine}`);
                }
                if (newLine !== undefined) {
                    diffLines.push(`+ ${newLine}`);
                }
            }
        }

        return diffLines.join('\n');
    }

    /**
     * 获取工作区文件夹
     */
    private getWorkspaceFolder(): string | undefined {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }
}
