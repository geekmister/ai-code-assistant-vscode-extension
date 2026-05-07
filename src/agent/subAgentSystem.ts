/**
 * 子代理系统 - F4: 多步推理与子代理系统
 * 实现任务拆解和子代理互相调用
 */

import { AgentExecutor, ChatMessage } from './agentExecutor';
import { v4 as uuidv4 } from 'uuid';

export interface SubAgentTask {
    id: string;
    name: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    dependencies: string[];
    result?: any;
    error?: string;
}

export interface SubAgentResult {
    taskId: string;
    success: boolean;
    result?: any;
    error?: string;
}

export class SubAgentSystem {
    private parentExecutor: AgentExecutor;
    private tasks: Map<string, SubAgentTask> = new Map();
    private taskQueue: string[] = [];
    private completedTasks: Map<string, SubAgentResult> = new Map();

    constructor(parentExecutor: AgentExecutor) {
        this.parentExecutor = parentExecutor;
    }

    /**
     * 解析用户任务为子任务
     */
    async decomposeTask(userRequest: string): Promise<SubAgentTask[]> {
        const model = this.parentExecutor.getCurrentModel();
        if (!model) {
            throw new Error('未配置模型');
        }

        // 使用模型进行任务分解
        const decompositionPrompt = `请将以下用户请求分解为可执行的子任务列表。

用户请求: "${userRequest}"

请按以下 JSON 格式返回任务列表（每个任务必须是一个独立的、可执行的步骤）:
{
  "tasks": [
    {
      "name": "任务名称",
      "description": "任务描述",
      "dependencies": ["依赖的任务ID，如果没有则为空数组"]
    }
  ]
}

要求:
1. 每个子任务应该是独立的步骤
2. 明确标注任务之间的依赖关系
3. 任务粒度适中，不要过细或过粗
4. 返回有效的 JSON 格式`;

        try {
            const response = await fetch(`${model.apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${model.apiKey}`
                },
                body: JSON.stringify({
                    model: model.model,
                    messages: [
                        { role: 'system', content: '你是一个任务分解专家。请将复杂任务分解为简单的子任务。' },
                        { role: 'user', content: decompositionPrompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || '';

            // 解析 JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('无法解析任务分解结果');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            const tasks: SubAgentTask[] = parsed.tasks.map((task: any, index: number) => ({
                id: `task-${index + 1}`,
                name: task.name,
                description: task.description,
                status: 'pending' as const,
                dependencies: task.dependencies || []
            }));

            // 存储任务
            tasks.forEach(task => this.tasks.set(task.id, task));

            return tasks;
        } catch (error: any) {
            // 如果 API 调用失败，使用简单的默认分解
            return this.defaultDecomposition(userRequest);
        }
    }

    /**
     * 默认任务分解（API 失败时使用）
     */
    private defaultDecomposition(userRequest: string): SubAgentTask[] {
        // 简单的关键词匹配分解
        const tasks: SubAgentTask[] = [];
        let taskIndex = 1;

        // 检测文件操作
        if (userRequest.includes('创建') || userRequest.includes('新建')) {
            tasks.push({
                id: `task-${taskIndex++}`,
                name: '创建文件',
                description: '根据需求创建相应的文件',
                status: 'pending',
                dependencies: []
            });
        }

        // 检测配置任务
        if (userRequest.includes('配置') || userRequest.includes('设置')) {
            tasks.push({
                id: `task-${taskIndex++}`,
                name: '配置环境',
                description: '配置项目所需的环境和依赖',
                status: 'pending',
                dependencies: []
            });
        }

        // 检测运行任务
        if (userRequest.includes('运行') || userRequest.includes('执行')) {
            const lastTask = tasks[tasks.length - 1];
            tasks.push({
                id: `task-${taskIndex++}`,
                name: '执行命令',
                description: '运行相应的命令',
                status: 'pending',
                dependencies: lastTask ? [lastTask.id] : []
            });
        }

        // 默认任务
        if (tasks.length === 0) {
            tasks.push({
                id: 'task-1',
                name: '处理请求',
                description: userRequest,
                status: 'pending',
                dependencies: []
            });
        }

        tasks.forEach(task => this.tasks.set(task.id, task));
        return tasks;
    }

    /**
     * 执行任务队列
     */
    async executeTasks(
        tasks: SubAgentTask[],
        onTaskStart: (task: SubAgentTask) => void,
        onTaskComplete: (result: SubAgentResult) => void,
        onTaskError: (taskId: string, error: Error) => void
    ): Promise<void> {
        // 构建执行顺序
        this.taskQueue = this.buildExecutionOrder(tasks);

        for (const taskId of this.taskQueue) {
            const task = this.tasks.get(taskId);
            if (!task) continue;

            // 检查依赖是否完成
            const dependenciesMet = task.dependencies.every(
                depId => this.completedTasks.get(depId)?.success
            );

            if (!dependenciesMet) {
                task.status = 'failed';
                task.error = '依赖任务未完成';
                onTaskError(taskId, new Error('依赖任务未完成'));
                continue;
            }

            // 执行任务
            task.status = 'running';
            onTaskStart(task);

            try {
                const result = await this.executeSingleTask(task);
                task.status = 'completed';
                task.result = result;
                
                this.completedTasks.set(taskId, {
                    taskId,
                    success: true,
                    result
                });

                onTaskComplete({
                    taskId,
                    success: true,
                    result
                });
            } catch (error: any) {
                task.status = 'failed';
                task.error = error.message;
                
                this.completedTasks.set(taskId, {
                    taskId,
                    success: false,
                    error: error.message
                });

                onTaskError(taskId, error);
            }
        }
    }

    /**
     * 构建执行顺序（拓扑排序）
     */
    private buildExecutionOrder(tasks: SubAgentTask[]): string[] {
        const order: string[] = [];
        const visited = new Set<string>();
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        const visit = (taskId: string) => {
            if (visited.has(taskId)) return;
            visited.add(taskId);

            const task = taskMap.get(taskId);
            if (task) {
                // 先访问依赖
                for (const depId of task.dependencies) {
                    visit(depId);
                }
                order.push(taskId);
            }
        };

        for (const task of tasks) {
            visit(task.id);
        }

        return order;
    }

    /**
     * 执行单个任务
     */
    private async executeSingleTask(task: SubAgentTask): Promise<any> {
        // 获取依赖任务的结果
        const dependencyResults = task.dependencies.map(depId => ({
            taskId: depId,
            result: this.tasks.get(depId)?.result
        }));

        // 根据任务名称选择执行方式
        if (task.name.includes('创建文件') || task.name.includes('修改文件')) {
            return this.executeFileTask(task, dependencyResults);
        } else if (task.name.includes('配置') || task.name.includes('安装')) {
            return this.executeConfigTask(task, dependencyResults);
        } else if (task.name.includes('运行') || task.name.includes('执行')) {
            return this.executeCommandTask(task, dependencyResults);
        } else {
            return this.executeGeneralTask(task, dependencyResults);
        }
    }

    /**
     * 执行文件任务
     */
    private async executeFileTask(task: SubAgentTask, dependencies: any[]): Promise<any> {
        // 返回文件操作指令
        return {
            type: 'file_operation',
            task: task.name,
            instruction: task.description,
            dependsOn: dependencies.map(d => d.taskId)
        };
    }

    /**
     * 执行配置任务
     */
    private async executeConfigTask(task: SubAgentTask, dependencies: any[]): Promise<any> {
        return {
            type: 'config',
            task: task.name,
            instruction: task.description,
            dependsOn: dependencies.map(d => d.taskId)
        };
    }

    /**
     * 执行命令任务
     */
    private async executeCommandTask(task: SubAgentTask, dependencies: any[]): Promise<any> {
        return {
            type: 'command',
            task: task.name,
            instruction: task.description,
            dependsOn: dependencies.map(d => d.taskId)
        };
    }

    /**
     * 执行通用任务
     */
    private async executeGeneralTask(task: SubAgentTask, dependencies: any[]): Promise<any> {
        return {
            type: 'general',
            task: task.name,
            instruction: task.description,
            dependsOn: dependencies.map(d => d.taskId)
        };
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(taskId: string): SubAgentTask | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * 获取所有任务
     */
    getAllTasks(): SubAgentTask[] {
        return Array.from(this.tasks.values());
    }

    /**
     * 获取已完成的任务结果
     */
    getCompletedResults(): Map<string, SubAgentResult> {
        return new Map(this.completedTasks);
    }

    /**
     * 重置子代理系统
     */
    reset(): void {
        this.tasks.clear();
        this.taskQueue = [];
        this.completedTasks.clear();
    }
}
