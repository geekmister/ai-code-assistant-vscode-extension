/**
 * 分支管理器 - F8: 对话窗口分支功能
 * 支持在对话历史的任意节点创建新会话副本
 */

import { ChatMessage } from './agentExecutor';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationBranch {
    id: string;
    name: string;
    parentId?: string;
    messages: ChatMessage[];
    createdAt: Date;
    isActive: boolean;
}

export class BranchManager {
    private branches: Map<string, ConversationBranch> = new Map();
    private activeBranchId: string | undefined;

    constructor() {
        // 创建主分支
        this.createBranch('main');
    }

    /**
     * 创建新分支
     */
    createBranch(name: string, parentId?: string): ConversationBranch {
        const branch: ConversationBranch = {
            id: uuidv4(),
            name,
            parentId,
            messages: [],
            createdAt: new Date(),
            isActive: false
        };

        this.branches.set(branch.id, branch);

        // 如果有父分支，复制父分支的消息
        if (parentId) {
            const parentBranch = this.branches.get(parentId);
            if (parentBranch) {
                branch.messages = [...parentBranch.messages];
            }
        }

        return branch;
    }

    /**
     * 切换到指定分支
     */
    switchToBranch(branchId: string): boolean {
        const branch = this.branches.get(branchId);
        if (!branch) {
            return false;
        }

        // 取消当前活跃分支的活跃状态
        if (this.activeBranchId) {
            const currentBranch = this.branches.get(this.activeBranchId);
            if (currentBranch) {
                currentBranch.isActive = false;
            }
        }

        // 设置新分支为活跃
        branch.isActive = true;
        this.activeBranchId = branchId;

        return true;
    }

    /**
     * 从指定消息位置创建分支
     */
    createBranchFromMessage(
        name: string,
        messageIndex: number,
        parentBranchId?: string
    ): ConversationBranch | undefined {
        const parentId = parentBranchId || this.activeBranchId;
        if (!parentId) return undefined;

        const parentBranch = this.branches.get(parentId);
        if (!parentBranch) return undefined;

        // 创建新分支并复制到指定位置的消息
        const branch = this.createBranch(name, parentId);
        branch.messages = parentBranch.messages.slice(0, messageIndex + 1);

        return branch;
    }

    /**
     * 添加消息到当前分支
     */
    addMessage(message: ChatMessage): void {
        if (!this.activeBranchId) return;

        const branch = this.branches.get(this.activeBranchId);
        if (!branch) return;

        branch.messages.push(message);
    }

    /**
     * 获取当前分支的消息
     */
    getCurrentMessages(): ChatMessage[] {
        if (!this.activeBranchId) return [];

        const branch = this.branches.get(this.activeBranchId);
        return branch?.messages || [];
    }

    /**
     * 获取当前分支
     */
    getActiveBranch(): ConversationBranch | undefined {
        if (!this.activeBranchId) return undefined;
        return this.branches.get(this.activeBranchId);
    }

    /**
     * 获取所有分支
     */
    getAllBranches(): ConversationBranch[] {
        return Array.from(this.branches.values());
    }

    /**
     * 获取分支
     */
    getBranch(branchId: string): ConversationBranch | undefined {
        return this.branches.get(branchId);
    }

    /**
     * 删除分支
     */
    deleteBranch(branchId: string): boolean {
        if (branchId === this.activeBranchId) {
            return false; // 不能删除当前活跃分支
        }

        return this.branches.delete(branchId);
    }

    /**
     * 重命名分支
     */
    renameBranch(branchId: string, newName: string): boolean {
        const branch = this.branches.get(branchId);
        if (!branch) return false;

        branch.name = newName;
        return true;
    }

    /**
     * 合并分支
     */
    mergeBranch(sourceBranchId: string, targetBranchId: string): boolean {
        const sourceBranch = this.branches.get(sourceBranchId);
        const targetBranch = this.branches.get(targetBranchId);

        if (!sourceBranch || !targetBranch) {
            return false;
        }

        // 将源分支的消息追加到目标分支
        targetBranch.messages.push(...sourceBranch.messages);

        // 删除源分支
        this.branches.delete(sourceBranchId);

        return true;
    }

    /**
     * 获取分支树结构
     */
    getBranchTree(): BranchTreeNode[] {
        const roots: BranchTreeNode[] = [];

        for (const branch of this.branches.values()) {
            const node: BranchTreeNode = {
                id: branch.id,
                name: branch.name,
                isActive: branch.isActive,
                children: []
            };

            if (branch.parentId) {
                const parentNode = this.findNode(roots, branch.parentId);
                if (parentNode) {
                    parentNode.children.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        return roots;
    }

    /**
     * 查找节点
     */
    private findNode(nodes: BranchTreeNode[], id: string): BranchTreeNode | undefined {
        for (const node of nodes) {
            if (node.id === id) return node;
            const found = this.findNode(node.children, id);
            if (found) return found;
        }
        return undefined;
    }
}

export interface BranchTreeNode {
    id: string;
    name: string;
    isActive: boolean;
    children: BranchTreeNode[];
}
