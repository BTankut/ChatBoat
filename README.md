# ChatBoat

A simple and universal chat interface for interacting with local AI model servers that are compatible with the OpenAI API standard. This application allows you to select from available models on your configured server and engage in conversations with streaming responses and detailed performance statistics.

## Features

- **Model Selection**: Choose from available models on your local AI server.
- **Server Configuration**: Easily set the URL for your local AI server.
- **Streaming Responses**: Get real-time responses as they're generated.
- **Thinking Process**: View the model's thinking process (if supported by the model and server).
- **Performance Statistics**: Monitor token counts, generation speed, and other metrics.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- A local AI model server (e.g., LM Studio, Ollama, Jan) running and accessible via an API endpoint (OpenAI API compatible).

### Installation

1. Clone this repository (replace with the new repository URL once created):

```bash
git clone <your-chatboat-repository-url>
cd chatboat
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser.

### Cross-Platform Support

This application works on any platform where Node.js and your chosen local AI server can run (e.g., Windows, macOS, Linux).

### Server Configuration

The application includes a settings modal (gear icon) to configure your Local AI Server URL:
- Click the gear icon in the header.
- Enter the full URL of your AI server (e.g., `http://localhost:1234`).
- The application will attempt to load models from the `/v1/models` endpoint (or a similar standard endpoint) of your server.

## How It Works

The application sends requests to your local AI server's API endpoints:
- `/api/models`: Fetches the list of available models from your server (expects a POST request with `serverUrl` in the body, and returns a list of models in OpenAI API format).
- `/api/chat`: Sends chat messages to your server for processing (expects a POST request with `messages`, `selectedModel`, and `serverUrl`, and streams back the response).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Acknowledgments

- [LM Studio](https://lmstudio.ai/) for inspiration and compatibility testing.

## Built With

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
