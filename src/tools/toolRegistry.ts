/**
 * 工具注册中心 - 管理所有可用工具
 */

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    execute(args: any): Promise<any>;
}

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    /**
     * 注册工具
     */
    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * 获取工具
     */
    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * 获取所有工具
     */
    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * 获取 LLM 格式的工具定义
     */
    getToolsForLLM(): any[] {
        return this.getAllTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    /**
     * 执行工具
     */
    async executeTool(name: string, args: any): Promise<any> {
        const tool = this.getTool(name);
        if (!tool) {
            throw new Error(`未找到工具: ${name}`);
        }
        return await tool.execute(args);
    }

    /**
     * 移除工具
     */
    removeTool(name: string): boolean {
        return this.tools.delete(name);
    }

    /**
     * 清空所有工具
     */
    clear(): void {
        this.tools.clear();
    }
}
