/**
 * 工作区上下文工具 - F10: 工作区 RAG 上下文感知
 * 自动获取项目文件结构、关键代码作为上下文
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Tool } from './toolRegistry';

export interface WorkspaceContext {
    projectStructure: ProjectFile[];
    currentFile?: FileContext;
    selectedText?: string;
    recentFiles: string[];
    dependencies: string[];
}

export interface ProjectFile {
    name: string;
    path: string;
    type: 'file' | 'directory';
    extension?: string;
}

export interface FileContext {
    path: string;
    content: string;
    language: string;
    cursorPosition: { line: number; column: number };
}

export class WorkspaceContextTool implements Tool {
    name = 'workspace_context';
    description = '获取工作区上下文信息，包括项目结构、当前文件内容、依赖信息等。用于增强 AI 对项目的理解。';

    parameters = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['get_structure', 'get_current_file', 'get_dependencies', 'get_all'],
                description: '获取上下文的类型'
            },
            depth: {
                type: 'number',
                description: '目录树深度，默认 3'
            }
        },
        required: ['action']
    };

    async execute(args: any): Promise<any> {
        const { action, depth = 3 } = args;

        switch (action) {
            case 'get_structure':
                return await this.getProjectStructure(depth);
            case 'get_current_file':
                return await this.getCurrentFile();
            case 'get_dependencies':
                return await this.getDependencies();
            case 'get_all':
                return await this.getAllContext();
            default:
                throw new Error(`未知的上下文操作: ${action}`);
        }
    }

    /**
     * 获取项目结构
     */
    private async getProjectStructure(maxDepth: number = 3): Promise<any> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return {
                success: false,
                error: '没有打开的工作区'
            };
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const rootPath = workspaceFolder.uri.fsPath;

        const structure = await this.buildDirectoryTree(rootPath, 0, maxDepth);

        return {
            success: true,
            root: workspaceFolder.name,
            structure
        };
    }

    /**
     * 构建目录树
     */
    private async buildDirectoryTree(
        dirPath: string,
        currentDepth: number,
        maxDepth: number
    ): Promise<ProjectFile[]> {
        if (currentDepth >= maxDepth) {
            return [{
                name: path.basename(dirPath),
                path: vscode.workspace.asRelativePath(dirPath),
                type: 'directory'
            }];
        }

        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
        const result: ProjectFile[] = [];

        for (const [name, type] of entries) {
            // 忽略一些常见的不需要显示的目录
            if (['node_modules', '.git', '.vscode', 'dist', 'build'].includes(name)) {
                continue;
            }

            const fullPath = path.join(dirPath, name);
            const relativePath = vscode.workspace.asRelativePath(fullPath);

            if (type === vscode.FileType.Directory) {
                const children = await this.buildDirectoryTree(fullPath, currentDepth + 1, maxDepth);
                result.push({
                    name,
                    path: relativePath,
                    type: 'directory'
                });
                // 只在深度较浅时添加子项
                if (currentDepth < 1) {
                    result.push(...children);
                }
            } else {
                const ext = path.extname(name).slice(1);
                // 只显示代码文件
                if (['', 'ts', 'js', 'tsx', 'jsx', 'json', 'md', 'py', 'go', 'rs', 'java'].includes(ext)) {
                    result.push({
                        name,
                        path: relativePath,
                        type: 'file',
                        extension: ext || undefined
                    });
                }
            }
        }

        return result;
    }

    /**
     * 获取当前文件上下文
     */
    private async getCurrentFile(): Promise<any> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return {
                success: false,
                error: '没有打开的编辑器'
            };
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);

        return {
            success: true,
            file: {
                path: vscode.workspace.asRelativePath(document.uri),
                language: document.languageId,
                cursorPosition: {
                    line: selection.start.line + 1,
                    column: selection.start.character + 1
                },
                content: document.getText(),
                selectedText: selectedText || undefined,
                lineCount: document.lineCount
            }
        };
    }

    /**
     * 获取项目依赖
     */
    private async getDependencies(): Promise<any> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return {
                success: false,
                error: '没有打开的工作区'
            };
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const rootPath = workspaceFolder.uri.fsPath;

        const dependencies: Record<string, any> = {};

        // 读取 package.json
        const packageJsonPath = path.join(rootPath, 'package.json');
        try {
            const packageJsonContent = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
            const packageJson = JSON.parse(packageJsonContent.toString());
            
            dependencies.npm = {
                dependencies: packageJson.dependencies || {},
                devDependencies: packageJson.devDependencies || {}
            };
        } catch (e) {
            // package.json 不存在
        }

        // 读取 requirements.txt (Python)
        const requirementsPath = path.join(rootPath, 'requirements.txt');
        try {
            const requirementsContent = await vscode.workspace.fs.readFile(vscode.Uri.file(requirementsPath));
            dependencies.python = {
                requirements: requirementsContent.toString().split('\n').filter(line => line.trim())
            };
        } catch (e) {
            // requirements.txt 不存在
        }

        // 读取 go.mod (Go)
        const goModPath = path.join(rootPath, 'go.mod');
        try {
            const goModContent = await vscode.workspace.fs.readFile(vscode.Uri.file(goModPath));
            dependencies.go = {
                modules: goModContent.toString().split('\n').filter(line => line.startsWith('require'))
            };
        } catch (e) {
            // go.mod 不存在
        }

        return {
            success: true,
            projectType: this.detectProjectType(dependencies),
            dependencies
        };
    }

    /**
     * 检测项目类型
     */
    private detectProjectType(dependencies: Record<string, any>): string[] {
        const types: string[] = [];
        
        if (dependencies.npm) types.push('Node.js');
        if (dependencies.python) types.push('Python');
        if (dependencies.go) types.push('Go');
        
        return types.length > 0 ? types : ['Unknown'];
    }

    /**
     * 获取所有上下文
     */
    private async getAllContext(): Promise<any> {
        const [structure, currentFile, dependencies] = await Promise.all([
            this.getProjectStructure(),
            this.getCurrentFile(),
            this.getDependencies()
        ]);

        // 获取最近打开的文件
        const recentFiles = vscode.workspace.textDocuments
            .slice(0, 5)
            .map(doc => vscode.workspace.asRelativePath(doc.uri));

        return {
            success: true,
            context: {
                projectStructure: structure.success ? structure.structure : [],
                currentFile: currentFile.success ? currentFile.file : undefined,
                dependencies: dependencies.success ? dependencies : {},
                recentFiles
            }
        };
    }
}
