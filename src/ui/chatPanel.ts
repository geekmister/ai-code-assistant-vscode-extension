import * as vscode from 'vscode';
import { AgentExecutor, ChatMessage, ToolCall } from '../agent/agentExecutor';
import { ConfigManager } from '../config/configManager';
import { MetricsCollector } from '../metrics/metricsCollector';

interface ChatMessageUI {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ChatPanel {
    private panel: vscode.WebviewPanel | undefined;
    private messages: ChatMessageUI[] = [];
    private agentExecutor: AgentExecutor;
    private configManager: ConfigManager;

    constructor(
        context: vscode.ExtensionContext,
        agentExecutor: AgentExecutor,
        configManager: ConfigManager,
        _metricsCollector: MetricsCollector
    ) {
        this.agentExecutor = agentExecutor;
        this.configManager = configManager;

        vscode.commands.registerCommand('aiCodingAgent.openChat', () => {
            this.show(context);
        });
    }

    public show(context: vscode.ExtensionContext): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'aiCodingAgentChat',
            'AI Coding Agent',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHtmlContent();
        
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'sendMessage') {
                await this.handleUserMessage(message.content);
            } else if (message.type === 'clearChat') {
                this.messages = [];
                this.sendMessagesToWebview();
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private async handleUserMessage(content: string): Promise<void> {
        const userMessage: ChatMessageUI = {
            id: this.generateId(),
            role: 'user',
            content,
            timestamp: Date.now()
        };
        this.messages.push(userMessage);
        this.sendMessagesToWebview();

        const models = this.configManager.getModels();
        if (models.length === 0) {
            this.messages.push({
                id: this.generateId(),
                role: 'assistant',
                content: '请先配置 AI 模型。运行命令: "AI Agent: Quick Config DeepSeek V4 Pro"',
                timestamp: Date.now()
            });
            this.sendMessagesToWebview();
            return;
        }

        this.panel?.webview.postMessage({ type: 'streamingStart' });

        try {
            let fullResponse = '';
            await this.agentExecutor.execute(
                [{ role: 'user', content }],
                (chunk: string) => {
                    fullResponse += chunk;
                    this.panel?.webview.postMessage({ type: 'streamingChunk', content: fullResponse });
                },
                async (toolCall: ToolCall) => {
                    this.panel?.webview.postMessage({ type: 'toolCall', content: '执行中: ' + toolCall.function.name });
                },
                () => {
                    this.panel?.webview.postMessage({ type: 'streamingEnd' });
                    this.messages.push({ id: this.generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() });
                    this.sendMessagesToWebview();
                },
                (error: Error) => {
                    this.panel?.webview.postMessage({ type: 'streamingEnd' });
                    this.messages.push({ id: this.generateId(), role: 'assistant', content: '错误: ' + error.message, timestamp: Date.now() });
                    this.sendMessagesToWebview();
                }
            );
        } catch {
            this.panel?.webview.postMessage({ type: 'streamingEnd' });
        }
    }

    private sendMessagesToWebview(): void {
        this.panel?.webview.postMessage({ type: 'updateMessages', messages: this.messages });
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--surface:#161b22;--overlay:#21262d;--border:#30363d;--fg:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--accent2:#1f6feb}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:var(--bg);color:var(--fg);height:100vh;display:flex;flex-direction:column}
.header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);min-height:56px}
.header-left{display:flex;align-items:center;gap:12px}
.logo{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:16px}
.title{font-size:16px;font-weight:600}
.btn{padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--overlay);color:var(--fg);border-radius:6px;cursor:pointer}
.btn:hover{background:var(--border)}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.chat{flex:1;overflow-y:auto;padding:16px}
.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px}
.welcome h1{font-size:28px;margin:16px 0;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.welcome p{color:var(--muted);max-width:400px}
.suggestions{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:600px;margin-top:24px}
.suggestion{padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:left}
.suggestion:hover{border-color:var(--accent2)}
.suggestion-text{font-size:13px;color:var(--fg)}
.suggestion-desc{font-size:12px;color:var(--muted);margin-top:4px}
.message{display:flex;gap:12px;margin-bottom:20px;animation:fadeIn .3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.avatar.user{background:var(--overlay)}
.content{flex:1}
.header-row{display:flex;gap:8px;align-items:center;margin-bottom:4px}
.author{font-size:13px;font-weight:600}
.time{font-size:12px;color:var(--muted)}
.body{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.message.user .body{background:rgba(56,139,253,.15);border-color:var(--accent2)}
.typing{display:flex;gap:4px;padding:8px 0}
.typing span{width:8px;height:8px;background:var(--muted);border-radius:50%;animation:typing 1.4s infinite ease-in-out}
.typing span:nth-child(1){animation-delay:-.32s}
.typing span:nth-child(2){animation-delay:-.16s}
@keyframes typing{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
.input-area{padding:16px;background:var(--surface);border-top:1px solid var(--border)}
.input-wrap{display:flex;gap:12px;background:var(--overlay);border:1px solid var(--border);border-radius:10px;padding:8px 12px}
.input-wrap:focus-within{border-color:var(--accent2)}
.input-box{flex:1;background:transparent;border:none;color:var(--fg);font-size:14px;font-family:inherit;resize:none;min-height:24px;max-height:200px;outline:none}
.input::placeholder{color:var(--muted)}
.send{width:32px;height:32px;background:var(--accent2);border:none;border-radius:6px;color:#fff;font-size:16px;cursor:pointer}
.send:disabled{background:var(--border);cursor:not-allowed}
.tool-call{display:inline-flex;gap:6px;padding:4px 10px;background:var(--overlay);border:1px solid var(--border);border-radius:20px;font-size:12px;color:var(--muted);margin-top:8px}
.tool-dot{width:6px;height:6px;background:#3fb950;border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
::-webkit-scrollbar{width:8px}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.hint{display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--muted)}
kbd{padding:2px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:11px}
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <div class="logo">🤖</div>
    <span class="title">AI Coding Agent</span>
  </div>
  <button class="btn" id="newChatBtn">新对话</button>
</div>
<div class="main">
  <div class="chat" id="chatContainer">
    <div class="welcome" id="welcomeScreen">
      <div class="logo" style="width:80px;height:80px;font-size:40px;">💬</div>
      <h1>有什么我可以帮你的？</h1>
      <p>AI Coding Agent 可以帮你分析代码、调试问题、解释代码逻辑...</p>
      <div class="suggestions">
        <div class="suggestion" data-action="分析这个项目的代码结构"><span class="suggestion-text">📂 分析项目结构</span></div>
        <div class="suggestion" data-action="帮我写一个 TypeScript 函数"><span class="suggestion-text">💻 写代码</span></div>
        <div class="suggestion" data-action="解释这段代码的作用"><span class="suggestion-text">📖 解释代码</span></div>
        <div class="suggestion" data-action="优化这段代码的性能"><span class="suggestion-text">⚡ 优化代码</span></div>
      </div>
    </div>
  </div>
  <div class="input-area">
    <div class="input-wrap">
      <textarea class="input-box" id="inputBox" placeholder="输入消息..." rows="1"></textarea>
      <button class="send" id="sendBtn" disabled>➤</button>
    </div>
    <div class="hint"><span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发送</span></div>
  </div>
</div>
<script>
const vscode=acquireVsCodeApi();
let msgs=[];
let streaming=false;
let streamId=null;

const inp=document.getElementById('inputBox');
const btn=document.getElementById('sendBtn');
const cont=document.getElementById('chatContainer');
const welcome=document.getElementById('welcomeScreen');

inp.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}
});
inp.addEventListener('input',()=>{
  inp.style.height='auto';
  inp.style.height=Math.min(inp.scrollHeight,200)+'px';
  btn.disabled=!inp.value.trim();
});
btn.addEventListener('click',send);

document.querySelectorAll('.suggestion').forEach(el=>{
  el.addEventListener('click',()=>{
    vscode.postMessage({type:'sendMessage',content:el.dataset.action});
  });
});

document.getElementById('newChatBtn').addEventListener('click',()=>{
  msgs=[];
  render();
});

function send(){
  const c=inp.value.trim();
  if(c&&!streaming){
    vscode.postMessage({type:'sendMessage',content:c});
    inp.value='';
    inp.style.height='auto';
    btn.disabled=true;
  }
}

function fmt(t){return new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function md(t){
  if(!t)return'';
  t=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  t=t.replace(/\n/g,'<br>');
  return t;
}

function render(){
  if(msgs.length===0){
    welcome.style.display='flex';
    cont.innerHTML='';
    cont.appendChild(welcome);
    return;
  }
  welcome.style.display='none';
  let h='';
  msgs.forEach(m=>{
    const av=m.role==='assistant'?'🤖':'👤';
    const nm=m.role==='assistant'?'AI Coding Agent':'你';
    h+='<div class="message '+m.role+'">'+
      '<div class="avatar '+m.role+'">'+av+'</div>'+
      '<div class="content"><div class="header-row"><span class="author">'+nm+'</span><span class="time">'+fmt(m.timestamp)+'</span></div>'+
      '<div class="body">'+md(m.content)+'</div></div></div>';
  });
  cont.innerHTML=h;
  cont.scrollTop=cont.scrollHeight;
}

window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='updateMessages'){
    msgs=m.messages;
    render();
  }else if(m.type==='streamingStart'){
    streaming=true;
    welcome.style.display='none';
    streamId='s'+Date.now();
    msgs.push({id:streamId,role:'assistant',content:'',timestamp:Date.now()});
    cont.innerHTML='<div class="message assistant"><div class="avatar">🤖</div><div class="content"><div class="header-row"><span class="author">AI Coding Agent</span></div><div class="body" id="sBody"><div class="typing"><span></span><span></span><span></span></div></div></div></div>';
    cont.scrollTop=cont.scrollHeight;
  }else if(m.type==='streamingChunk'){
    const b=document.getElementById('sBody');
    if(b){b.innerHTML=md(m.content);cont.scrollTop=cont.scrollHeight;}
  }else if(m.type==='toolCall'){
    const b=document.getElementById('sBody');
    if(b){b.innerHTML+='<div class="tool-call"><span class="tool-dot"></span>'+esc(m.content)+'</div>';}
  }else if(m.type==='streamingEnd'){
    streaming=false;
    const el=document.getElementById(streamId);
    if(el)el.remove();
    render();
  }
});

inp.focus();
</script>
</body>
</html>`;
    }
}
