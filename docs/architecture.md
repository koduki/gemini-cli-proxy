# アーキテクチャ詳細

このドキュメントは、Gemini CLI Proxyの内部アーキテクチャと、`@google/gemini-cli-core`との連携に関する技術的な詳細を説明します。

## コアコンポーネント

1.  **WebSocketサーバー**: リアルタイム双方向通信を担当します。
2.  **セッション管理**: インメモリで会話履歴と各セッションの`Config`を管理します。
3.  **スラッシュコマンドプロセッサー**: TUI版のコマンドをWeb版として解釈・実行します。
4.  **Express Webサーバー**: `Config`の初期化と、動作確認用のテスト画面を提供します。

## 主要機能の実装詳細

### 1. セッション管理

各セッションごとに独立した`Config`インスタンスと履歴を`Map`で管理します。

```typescript
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
```

### 2. スラッシュコマンド

TUI版コマンドをWeb版に移植しています。

-   `/help`: ヘルプメッセージを表示します。
-   `/clear`: `geminiClient.resetChat()`を呼び出し、現在のチャット履歴をクリアします。
-   `/tools`: `toolRegistry.getFunctionDeclarations()`を使い、利用可能なツールの一覧を表示します。
-   `/chat save <tag>`: 簡易的な履歴保存機能です。

### 3. ツール実行

`@google/gemini-cli-core`が提供する`Tool`インターフェースに基づき、以下のツールを実行します。

-   **ファイルシステムツール**: `read_file`, `write_file`, `list_directory`
-   **実行ツール**: `run_shell_command`
-   **Webツール**: `web_fetch`, `google_web_search`
-   **メモリツール**: `save_memory`

## @google/gemini-cli-core との統合

### 1. Config クラス

`@google/gemini-cli-core`の`Config`クラスは、API通信、ツール、認証を統合的に管理します。プロキシでは、セッションごとにこの`Config`インスタンスを生成します。

```typescript
const config = new Config({
  sessionId: sessionId,
  targetDir: workingDir,
  debugMode: false,
  cwd: workingDir,
  model: 'gemini-2.5-pro',  
  embeddingModel: 'gemini-embedding-001',  
  fullContext: false,
  checkpointing: false,
  coreTools: undefined, // undefinedは全てのtoolsの利用を許可
  excludeTools: [],
});
```

### 2. GeminiClient クラス

`GeminiClient`は、Gemini APIとの通信を管理し、以下の主要機能を提供します。

-   **ストリーミング通信**: `sendMessageStream()`によるリアルタイム応答。
-   **チャット履歴管理**: 会話のコンテキストを自動で管理します。
-   **トークン制限対応**: 長い会話履歴を自動的に要約・圧縮します。
-   **認証管理**: `AuthType.USE_GEMINI`によるAPIキー認証を管理します。

### 3. ツールシステム

`ToolRegistry`クラスが、組み込みツールや動的ツール（MCP）の発見と管理を行います。プロキシは、このレジストリを通じてツールを呼び出します。

-   **組み込みツール**: `ReadFileTool`, `WriteFileTool`, `ShellTool`など、標準で提供されるツール群です。
-   **ツール実行フロー**: `executeToolCall`関数を利用し、パラメータ検証、実行管理、結果変換を含む標準のパイプラインを通じてツールを実行します。

```typescript
const toolResponse = await executeToolCall(
  session.config,
  requestInfo,
  toolRegistry,
  new AbortController().signal
);
```

### 4. ストリーミングとイベント処理

`Turn`クラスが提供するイベントベースの処理モデルを活用し、AIの応答をストリーミングで処理します。

-   **ServerGeminiStreamEvent**: `content`や`function_call`など、サーバーからのイベントを型安全に扱います。
-   **関数呼び出し処理**: AIがツールの使用を要求した際に、それを自動で検出して実行します。

### 5. 認証システム

`config.refreshAuth(AuthType.USE_GEMINI)`を呼び出すことで、`GEMINI_API_KEY`環境変数を使用したAPIキー認証を実行します。

## 拡張方法

新しいスラッシュコマンドを追加する場合は、`WebSlashCommandProcessor`クラスを修正します。新しいツールを追加する場合は、`@google/gemini-cli-core`の`Tool`インターフェース定義に従って実装し、`ToolRegistry`に登録する必要があります。

