# LM Studio Chat

A simple chat interface for interacting with LM Studio Server. This application allows you to select from available models and engage in conversations with streaming responses and detailed performance statistics.

## Features

- **Model Selection**: Choose from available models in your LM Studio Server
- **Streaming Responses**: Get real-time responses as they're generated
- **Thinking Process**: View the model's thinking process with `<think>...</think>` tags
- **Performance Statistics**: Monitor token counts, generation speed, and other metrics

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [LM Studio](https://lmstudio.ai/) with Server mode enabled

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory with your LM Studio Server URL:

```
LM_STUDIO_URL=http://your-lm-studio-server:1234
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser

## Usage

1. Ensure your LM Studio Server is running and serving models
2. Select a model from the dropdown menu
3. Type your message and send
4. View the streaming response with statistics

## Statistics

The application provides detailed statistics for each response:

- **Thinking Process**: Duration and token count for the thinking phase
- **Token Speed**: Tokens per second generation rate
- **Total Tokens**: Count of all tokens in the response
- **Time to First Token**: Latency before the first token appears
- **Total Duration**: Complete response generation time
- **Stop Reason**: Why the model stopped generating (e.g., EOS token)

## Built With

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [LM Studio](https://lmstudio.ai/) for the local model server
