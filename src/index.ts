import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { Config, AuthType } from '@google/gemini-cli-core';
import { GenerateContentResponse } from '@google/genai';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

// Define incoming message structure for type safety
interface WebSocketMessage {
  type: 'init' | 'message';
  sessionId?: string;
  content?: string;
}

// TUI版のgetResponseText関数をWeb版に移植
function getResponseText(response: GenerateContentResponse): string | undefined {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return undefined;
  }
  const textSegments = parts
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string');

  if (textSegments.length === 0) {
    return undefined;
  }
  return textSegments.join('');
}

const app = express();
const server = new Server(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// TUI版のセッション管理をWeb版に適応
const sessions = new Map<string, {
  sessionId: string;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  config: Config;
  workingDir: string;
}>();

// TUI版のスラッシュコマンド処理をWeb版に移植
class WebSlashCommandProcessor {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async processCommand(command: string): Promise<{
    type: 'handled' | 'message' | 'tool' | 'dialog';
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>; // Replaced any
    dialog?: string;
  } | null> {
    const trimmed = command.trim();

    if (trimmed === '/help') {
      return {
        type: 'dialog',
        dialog: 'help'
      };
    }

    if (trimmed === '/clear') {
      const geminiClient = this.config.getGeminiClient();
      if (geminiClient) {
        await geminiClient.resetChat();
      }
      return {
        type: 'message',
        content: 'チャット履歴をクリアしました。'
      };
    }

    if (trimmed === '/tools') {
      const toolRegistry = await this.config.getToolRegistry();
      const tools = toolRegistry.getFunctionDeclarations();
      const toolList = tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');
      return {
        type: 'message',
        content: `利用可能なツール:\n${toolList}`
      };
    }

    if (trimmed.startsWith('/chat save ')) {
      const tag = trimmed.substring(11).trim();
      if (!tag) {
        return {
          type: 'message',
          content: 'エラー: タグを指定してください。使用方法: /chat save <tag>'
        };
      }

      // チャット履歴の保存（簡易実装）
      return {
        type: 'message',
        content: `チャット履歴を "${tag}" として保存しました。`
      };
    }

    return null;
  }
}

// セッション作成エンドポイント
app.post('/api/chat', async (_req, res) => {
  try {
    const sessionId = generateSessionId();
    console.log('Creating new session:', sessionId);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key not configured. Please set GEMINI_API_KEY environment variable.'
      });
    }

    const workingDir = process.cwd();
    mkdirSync(workingDir, { recursive: true });

    const config = new Config({
      sessionId: sessionId,
      targetDir: workingDir,
      debugMode: false,
      cwd: workingDir,
      model: 'gemini-2.5-pro',
      embeddingModel: 'gemini-embedding-001',
      fullContext: false,
      checkpointing: false,
      coreTools: undefined,
      excludeTools: [],
    });

    await config.initialize();
    await config.refreshAuth(AuthType.USE_GEMINI);

    sessions.set(sessionId, {
      sessionId,
      history: [],
      config,
      workingDir
    });

    console.log('Session stored. Total sessions:', sessions.size);
    res.json({ sessionId });
  } catch (error: unknown) { // Replaced any
    console.error('Session creation error:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ error: message });
  }
});

// TUI版のWebSocket処理をWeb版に移植
wss.on('connection', (ws) => {
  let sessionId: string | null = null;
  let slashCommandProcessor: WebSlashCommandProcessor | null = null;

  ws.on('message', async (data) => {
    try {
      const parsedData = JSON.parse(data.toString());

      // Basic type guard for the parsed message
      if (typeof parsedData !== 'object' || parsedData === null || !('type' in parsedData)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
        return;
      }
      const message: WebSocketMessage = parsedData;

      if (message.type === 'init') {
        if (!message.sessionId || typeof message.sessionId !== 'string') {
          ws.send(JSON.stringify({ type: 'error', error: 'Session ID is required' }));
          return;
        }

        const session = sessions.get(message.sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
          return;
        }

        sessionId = message.sessionId;
        slashCommandProcessor = new WebSlashCommandProcessor(session.config);
        console.log('Session initialized:', sessionId);
        ws.send(JSON.stringify({ type: 'ready' }));

      } else if (message.type === 'message') {
        if (!sessionId || !slashCommandProcessor) {
          ws.send(JSON.stringify({ type: 'error', error: 'Session not initialized' }));
          return;
        }

        const session = sessions.get(sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
          return;
        }

        try {
          const userMessage = message.content?.trim() ?? '';

          // スラッシュコマンドの処理
          if (userMessage.startsWith('/')) {
            const commandResult = await slashCommandProcessor.processCommand(userMessage);
            if (commandResult) {
              switch (commandResult.type) {
              case 'message':
                ws.send(JSON.stringify({
                  type: 'stream_chunk',
                  data: { type: 'content', data: commandResult.content }
                }));
                ws.send(JSON.stringify({ type: 'stream_end' }));
                return;
              case 'dialog':
                if (commandResult.dialog === 'help') {
                  const helpMessage = '\n利用可能なコマンド:\n/help - このヘルプを表示\n/clear - チャット履歴をクリア\n/tools - 利用可能なツールを表示\n/chat save <tag> - チャット履歴を保存\n                    ';
                  ws.send(JSON.stringify({
                    type: 'stream_chunk',
                    data: { type: 'content', data: helpMessage }
                  }));
                  ws.send(JSON.stringify({ type: 'stream_end' }));
                  return;
                }
                break;
              case 'handled':
                ws.send(JSON.stringify({ type: 'stream_end' }));
                return;
              }
            }
          }

          // 通常のメッセージ処理
          session.history.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date()
          });

          const geminiClient = session.config.getGeminiClient();
          if (!geminiClient) {
            ws.send(JSON.stringify({ type: 'error', error: 'Gemini client not initialized' }));
            return;
          }

          const chat = await geminiClient.getChat();
          if (!chat) {
            ws.send(JSON.stringify({ type: 'error', error: 'Failed to get chat instance' }));
            return;
          }

          // TUI版のストリーミング処理をWeb版に移植
          const toolRegistry = await session.config.getToolRegistry();
          let currentMessages = [{ role: 'user', parts: [{ text: userMessage }] }];
          let turnCount = 0;

          while (true) {
            turnCount++;
            if (turnCount > 10) {
              console.warn('Maximum turn count reached');
              break;
            }

            const functionCalls = [];

            const responseStream = await chat.sendMessageStream(
              {
                message: currentMessages[0]?.parts || [],
                config: {
                  tools: [
                    { functionDeclarations: toolRegistry.getFunctionDeclarations() }
                  ]
                }
              },
              generatePromptId()
            );

            for await (const resp of responseStream) {
              const textPart = getResponseText(resp);
              if (textPart) {
                ws.send(JSON.stringify({
                  type: 'stream_chunk',
                  data: { type: 'content', data: textPart }
                }));
              }
              if (resp.functionCalls) {
                functionCalls.push(...resp.functionCalls);
              }
            }

            if (functionCalls.length > 0) {
              const toolResponseParts: Array<{ text: string }> = [];

              for (const fc of functionCalls) {
                try {
                  if (!fc.name) {
                    console.error('Function call missing name');
                    continue;
                  }
                  const tool = toolRegistry.getTool(fc.name);
                  if (tool) {
                    const result = await tool.execute(fc.args || {}, new AbortController().signal);

                    if (typeof result.llmContent === 'string') {
                      toolResponseParts.push({ text: result.llmContent });
                    } else if (result.llmContent && 'text' in result.llmContent && result.llmContent.text) {
                      toolResponseParts.push({ text: result.llmContent.text });
                    }

                    if (fc.name) {
                      ws.send(JSON.stringify({
                        type: 'tool_result',
                        data: {
                          toolName: fc.name,
                          result: result.returnDisplay
                        }
                      }));
                    }
                  }
                } catch (toolError: unknown) { // Replaced any
                  console.error('Tool execution error:', toolError);
                  if (fc.name) {
                    const message = toolError instanceof Error ? toolError.message : 'An unknown tool error occurred';
                    ws.send(JSON.stringify({
                      type: 'tool_error',
                      data: {
                        toolName: fc.name,
                        error: message
                      }
                    }));
                  }
                }
              }

              currentMessages = [{ role: 'user', parts: toolResponseParts }];
            } else {
              break;
            }
          }

          // 最終的な応答を履歴に保存
          const finalResponse = chat.getHistory().slice(-1)[0];
          if (finalResponse && finalResponse.role === 'model') {
            const responseContent = finalResponse.parts
              ?.map(part => part.text)
              .filter(Boolean)
              .join('') || '';

            session.history.push({
              role: 'assistant',
              content: responseContent,
              timestamp: new Date()
            });
          }

          ws.send(JSON.stringify({ type: 'stream_end' }));

        } catch (error: unknown) { // Replaced any
          console.error('WebSocket message error:', error);
          const message = error instanceof Error ? error.message : 'An unknown error occurred';
          ws.send(JSON.stringify({ type: 'error', error: `Failed to send message: ${message}` }));
        }
      }
    } catch (error: unknown) { // Replaced any
      console.error('WebSocket error:', error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      ws.send(JSON.stringify({ type: 'error', error: message }));
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      console.log('WebSocket connection closed for session:', sessionId);
    }
  });
});

export function generateSessionId(): string {
  return randomUUID();
}

function generatePromptId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Start the server only if this file is run directly
if (import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === process.argv[1]) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Gemini CLI Proxy running on port ${PORT}`);
  });
}
