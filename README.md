# Gemini CLI Proxy

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

A WebSocket-based proxy for the Gemini CLI that enables stateful and agentic interactions through a web interface, powered by `@google/gemini-cli-core`.

This project aims to provide flexible integration with various environments, including chats like Slack, IDEs, and CI/CD pipelines.

## Overview

This proxy mirrors the architecture of the Gemini CLI's interactive TUI mode, enabling real-time, bidirectional communication over WebSockets. This approach allows for continuous, context-aware conversations, moving beyond stateless, one-off command execution.

### Key Features

-   **Real-time Interaction**: Streaming responses over WebSockets for a fluid user experience.
-   **Stateful Session Management**: Maintains independent conversation histories for multiple sessions.
-   **Tool Execution**: Supports standard Gemini CLI tools, including file system operations, shell commands, and web searches.
-   **Slash Commands**: Implements familiar TUI commands like `/help` and `/clear` for the web.
-   **Container Ready**: Simplified setup with Docker Compose.

## Architecture

The core components consist of a WebSocket server, a session manager, and an Express web server for handling initial setup and serving a demo client.

### Data Flow

```mermaid
graph TB
    A[Client (Web Browser)] -- "1. Create session (REST API)" --> B[Proxy Server]
    B -- "2. Initialize GeminiClient" --> C[Gemini API]
    A -- "3. Connect (WebSocket)" --> B
    A -- "4. Send/Receive messages" --> B
    B -- "5. Execute tools/API calls" --> C
```

## Getting Started

You can get the proxy up and running quickly using Docker and Docker Compose.

### Prerequisites

-   Docker and Docker Compose
-   A Gemini API Key

### Installation

1.  **Set up environment variables**

    Create a `.env` file in the project root and add your Gemini API key.

    ```.env
    GEMINI_API_KEY=your-api-key-here
    ```

2.  **Build and run the container**

    ```bash
    docker compose up -d --build
    ```

3.  **Access the service**

    The server will be available at `http://localhost:3000`. A simple test client is served at this address.

### Development Commands

-   **View logs**:
    ```bash
    docker compose logs -f
    ```
-   **Debug container**:
    ```bash
    docker exec -it gemini-cli-proxy-gemini-cli-proxy-1 bash
    ```
## Deploy for GCE

Deploy both `gemini-cli-proxy` and `openvscode-server` to GCE.

### Preparation: Create Secrets in Secret Manager

```powershell
Write-Output -NoNewline "YOUR_GEMINI_KEY" | gcloud secrets create gemini-api-key `
    --data-file=- `
    --labels="service=gemini-cli-proxy"

Write-Output -NoNewline "YOUR_GITAPP_ID" | gcloud secrets create github-app-id `
    --data-file=- `
    --labels="service=gemini-cli-proxy"

Write-Output -NoNewline "YOUR_GITAPP_INSTALLRION_ID"" | gcloud secrets create github-app-installation-id `
    --data-file=- `
    --labels="service=gemini-cli-proxy"

gcloud secrets create github-app-private-key `
    --data-file=emini-cli-proxy.2025-07-28.private-key.pem `
    --labels="service=gemini-cli-proxy"
```

### Preparation: Firewall

To allow access from your IP address to ports 3000 and 8000 on instances with the `session-node` tag, run the following commands:

```bash
# Allow access to ports 3000 and 8000
gcloud compute firewall-rules create allow-session-node \
    --network=default \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:3000,tcp:8000 \
    --source-ranges=${MY_IP}/32 \
    --target-tags=session-node \
    --description="Allow gemini-cli-proxy and openvscode-server to access from your IP to instances with session-node tag"
```

### Deploying to GCP (Using Container-Optimized OS)


```bash
# Get secrets
GEMINI_API_KEY="$(gcloud secrets versions access latest --secret='gemini-api-key')"
GITHUB_APP_ID="$(gcloud secrets versions access latest --secret='github-app-id')"
GITHUB_APP_INSTALLATION_ID="$(gcloud secrets versions access latest --secret='github-app-installation-id')"
GITHUB_APP_PRIVATE_KEY="$(gcloud secrets versions access latest --secret='github-app-private-key')"

# VM Configurations
ZONE="us-central1-f"
INSTANCE_NAME="vm-endpoint01"
MACHINE_TYPE="e2-medium"

# Create an instance
gcloud compute instances create-with-container "${INSTANCE_NAME}" \
    --zone "${ZONE}" \
    --machine-type "${MACHINE_TYPE}" \
    --container-image "docker.io/koduki/gemini-cli-proxy" \
    --container-restart-policy "always" \
    --container-env "GEMINI_API_KEY=${GEMINI_API_KEY},GITHUB_APP_ID=${GITHUB_APP_ID},GITHUB_APP_INSTALLATION_ID=${GITHUB_APP_INSTALLATION_ID},GITHUB_APP_PRIVATE_KEY=${GITHUB_APP_PRIVATE_KEY}" \
    --container-mount-host-path "host-path=/home/chronos/workspace,mount-path=/home/workspace" \
    --metadata-from-file user-data=cloud-init.yaml \
    --boot-disk-size "10GB" \
    --image-project "cos-cloud" \
    --image-family "cos-stable" \
    --provisioning-model "SPOT" \
    --network-interface "network=default,subnet=default" \
    --scopes "https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/trace.append" \
    --metadata "enable-oslogin=true,google-logging-enabled=true,google-monitoring-enabled=true" \
    --labels "container-vm=${INSTANCE_NAME}" \
    --tags "session-node" 
```

## API Reference

### REST API

#### `POST /api/chat`

Initializes a new chat session.

**Response:**

```json
{
  "sessionId": "unique-session-id"
}
```

### WebSocket API

After creating a session, connect to the WebSocket endpoint.

1.  **Initialize Connection**

    Send the `sessionId` to associate the connection with a session.

    ```json
    {
      "type": "init",
      "sessionId": "unique-session-id"
    }
    ```

2.  **Send a Message**

    ```json
    {
      "type": "message",
      "content": "Your message here"
    }
    ```

3.  **Receive Responses**

    Responses from the AI are streamed as `stream_chunk` events.

    ```json
    {
      "type": "stream_chunk",
      "data": {
        "type": "content", // or "tool_code", "tool_result", etc.
        "data": "AI response text"
      }
    }
    ```

## Tech Stack

-   **Backend**: Node.js, Express
-   **Real-time Communication**: WebSocket (`ws`)
-   **Core Logic**: `@google/gemini-cli-core`
-   **Language**: TypeScript
-   **Containerization**: Docker

## Limitations

-   **Session Persistence**: Sessions are currently stored in-memory and will be lost on server restart.
-   **Scalability**: The proxy runs as a single process and is not designed for large-scale deployments without further modification.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
