"use client";

import { useEffect, useState } from "react";

interface Stats {
  startTime: number;
  firstTokenTime: number;
  firstResponseTokenTime?: number;
  endTime: number;
  thinkingStartTime: number;
  thinkingEndTime: number;
  totalTokens: number;
  thinkingTokens: number;
  responseTokens: number;
  stopReason: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string; // For thinking content
  stats?: Stats; // Statistics
}

interface Model {
  id: string;
  object: string;
  owned_by: string;
}

interface ModelsResponse {
  data: Model[];
  object: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string>("");
  const [openThinkingIndices, setOpenThinkingIndices] = useState<number[]>([]);
  const [openStatsIndices, setOpenStatsIndices] = useState<number[]>([]);
  
  // State for server URL settings
  const [serverUrl, setServerUrl] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState("");

  // Load server URL from localStorage and fetch models
  useEffect(() => {
    const initializeApp = async () => {
      let storedUrl = localStorage.getItem('aiServerUrl');
      
      if (storedUrl && storedUrl.trim() !== "") { // A non-empty URL is stored, use it
        setServerUrl(storedUrl);
        setTempServerUrl(storedUrl); // Initialize temp URL for settings modal

        try {
          setIsLoadingModels(true);
          setModelError("");
          console.log('Fetching models, URL:', storedUrl);
          
          const response = await fetch("/api/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverUrl: storedUrl })
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Handle non-JSON error response
            let errorMessage = `Failed to fetch model list (HTTP ${response.status})`;
            if (response.status === 0 || response.status === 503 || response.status === 504) { // Common for network errors / server down
                 errorMessage = `Could not connect to server: ${storedUrl}. Please check the server address and ensure your AI server is running.`;
            } else if (errorData.error) {
                errorMessage = errorData.error;
            } else if (typeof errorData === 'string') {
                errorMessage = errorData;
            }
            throw new Error(errorMessage);
          }
          
          const data = await response.json() as ModelsResponse;
          if (data.data && data.data.length > 0) {
            setModels(data.data);
            setSelectedModel(data.data[0].id);
          } else {
            setModels([]);
            setSelectedModel("");
            setModelError("No available models found on the server or the model list is empty. Please check your AI server.");
          }
        } catch (error: any) {
          console.error("Error loading models:", error);
          setModelError(error.message || "Models could not be loaded");
          setModels([]);
          setSelectedModel("");
        } finally {
          setIsLoadingModels(false);
        }
      } else { // No URL stored in localStorage or it's empty
        setModelError("Server URL is not set. Please click the gear icon above to configure it.");
        setServerUrl(""); 
        setTempServerUrl("http://localhost:1234"); // Pre-fill settings modal with default
        setModels([]);
        setSelectedModel("");
        setIsLoadingModels(false);
      }
    };

    initializeApp();
  }, []);  // Run only once
  
  // Reload models when server URL changes
  useEffect(() => {
    // Check to prevent running on initial load
    if (serverUrl && serverUrl !== localStorage.getItem('aiServerUrl')) {
      refreshModels();
    }
  }, [serverUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Show warning if no model is selected
    if (!selectedModel) {
      alert("Please select a model!");
      return;
    }

    // Add user message
    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    // Add empty assistant message (for streaming)
    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      thinking: ""
    };
    const newMessageIndex = updatedMessages.length;
    setMessages([...updatedMessages, assistantMessage]);
    
    // Open stats window by default for new message
    setOpenStatsIndices(prev => [...prev, newMessageIndex]);

    try {
      // Send request to API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          selectedModel: selectedModel, // Send selected model
          serverUrl: serverUrl, // Send server URL
        }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      // Process stream response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Could not read response");
      }

      // Variables for streaming response
      let currentContent = "";
      let currentThinking = "";
      let isInThinkingMode = false;
      let messageIndex = updatedMessages.length; // Index of assistant message

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Convert chunk to text
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const { content, isThinking, stats, completed } = JSON.parse(line);
              
              // Don't process if response is completed
              if (completed) {
                // Update final statistics
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    lastMessage.stats = stats;
                  }
                  return newMessages;
                });
                continue;
              }
              
              // Check thinking mode
              if (isThinking) {
                isInThinkingMode = true;
                // Open thinking window when in thinking mode
                if (!openThinkingIndices.includes(messageIndex)) {
                  setOpenThinkingIndices(prev => [...prev, messageIndex]);
                }
              } else if (isInThinkingMode && !isThinking) {
                // Close thinking window when thinking mode ends
                isInThinkingMode = false;
                setOpenThinkingIndices(prev => prev.filter(i => i !== messageIndex));
              }
              
              // Add content to the appropriate place
              if (isThinking || isInThinkingMode) {
                // Update thinking content
                currentThinking += content;
              } else {
                // Update normal content
                currentContent += content;
              }
              
              // Update messages
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === "assistant") {
                  // Clean <think> tags
                  const cleanedThinking = currentThinking
                    .replace(/<think>/g, '')
                    .replace(/<\/think>/g, '');
                  
                  // Update assistant message
                  lastMessage.content = currentContent;
                  lastMessage.thinking = cleanedThinking;
                  lastMessage.stats = stats;
                }
                return newMessages;
              });
            } catch (e) {
              console.error("Chunk processing error:", e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Error:", error);
      // Add error message
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          lastMessage.content = "Sorry, an error occurred. Please try again.";
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save settings function
  const saveSettings = () => {
    setServerUrl(tempServerUrl);
    localStorage.setItem('aiServerUrl', tempServerUrl);
    setIsSettingsOpen(false);
  };

  // Reload models function
  const refreshModels = async () => {
    try {
      // Reset states first
      setIsLoadingModels(true);
      setModelError("");
      setModels([]);
      setSelectedModel("");
      
      console.log('Reloading models, URL:', serverUrl);
      
      try {
        const response = await fetch("/api/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ serverUrl })
        });
        
        console.log('API response received, status code:', response.status);
        
        // Try to parse response as JSON
        const responseText = await response.text();
        console.log('API response text:', responseText);
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON parsing error:', parseError);
          throw new Error(`Response could not be parsed as JSON: ${responseText}`);
        }
        
        if (!response.ok) {
          throw new Error(data.error || `Failed to fetch model list: ${response.status}`);
        }
        
        if (!data.data || !Array.isArray(data.data)) {
          console.error('Unexpected API response format:', data);
          throw new Error('API response is not in the expected format');
        }
        
        setModels(data.data);
        
        // If models exist, select the first one
        if (data.data && data.data.length > 0) {
          setSelectedModel(data.data[0].id);
        }
      } catch (fetchError: any) {
        // In case of network error or connection error
        if (fetchError.name === 'TypeError' || fetchError.message.includes('fetch failed')) {
          throw new Error(`Could not connect to the AI Server. Please ensure the server is running and the URL is correct: ${serverUrl}`);
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error("Error loading models:", error);
      setModelError(error.message || "Models could not be loaded");
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow p-4">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">ChatBoat</h1>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          
          {/* Model Selection */}
          <div className="w-full sm:w-auto">
            {isLoadingModels ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading models...</div>
            ) : modelError ? (
              <div className="flex items-center gap-2">
                <div className="text-sm text-red-500">{modelError}</div>
                <button 
                  onClick={refreshModels}
                  className="p-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-sm font-medium">
                  Model:
                </label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="p-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm w-full sm:w-auto"
                  disabled={isLoading || models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">No models found</option>
                  ) : (
                    models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Server Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4">
              <label htmlFor="server-url" className="block text-sm font-medium mb-1">
                Server URL
              </label>
              <input
                id="server-url"
                type="text"
                value={tempServerUrl}
                onChange={(e) => setTempServerUrl(e.target.value)}
                placeholder="http://localhost:1234"
                className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the IP address and port of your AI model server.
                <br />
                Example: http://192.168.1.100:1234
              </p>
            </div>
            
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 my-8">
              <p>Start chatting with your local AI server!</p>
              <p className="text-sm mt-2">Ask your model a question or give it a task.</p>
              {models.length > 0 && (
                <p className="text-sm mt-4 font-medium">
                  Selected model: <span className="text-blue-500">{selectedModel}</span>
                </p>
              )}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg ${message.role === "user" ? "bg-blue-100 dark:bg-blue-900 ml-auto" : "bg-gray-200 dark:bg-gray-700 mr-auto"} max-w-[80%]`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* Show/hide button if thinking content exists */}
                  {message.thinking && message.thinking.trim() !== "" && (
                    <button 
                      onClick={() => {
                        setOpenThinkingIndices(prev => {
                          if (prev.includes(index)) {
                            return prev.filter(i => i !== index);
                          } else {
                            return [...prev, index];
                          }
                        });
                      }}
                      className="flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {openThinkingIndices.includes(index) ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          Hide thinking process
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Show thinking process
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Statistics button */}
                  {message.stats && message.role === "assistant" && (
                    <button 
                      onClick={() => {
                        setOpenStatsIndices(prev => {
                          if (prev.includes(index)) {
                            return prev.filter(i => i !== index);
                          } else {
                            return [...prev, index];
                          }
                        });
                      }}
                      className="flex items-center text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
                    >
                      {openStatsIndices.includes(index) ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          Hide statistics
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Show statistics
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                {/* Show if thinking content is open */}
                {message.thinking && message.thinking.trim() !== "" && openThinkingIndices.includes(index) && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-600 rounded border-l-4 border-yellow-500">
                    <p className="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Thinking Process:</p>
                    <pre className="text-xs whitespace-pre-wrap text-gray-600 dark:text-gray-400">{message.thinking}</pre>
                  </div>
                )}

                {/* Show if statistics are open */}
                {message.stats && openStatsIndices.includes(index) && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-600 rounded border-l-4 border-green-500">
                    <p className="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Statistics:</p>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                      {message.stats.thinkingStartTime > 0 && message.stats.thinkingEndTime > 0 && (
                        <li>Thinking Time: {((message.stats.thinkingEndTime - message.stats.thinkingStartTime) / 1000).toFixed(2)} seconds</li>
                      )}
                      {message.stats.thinkingTokens > 0 && <li>Thinking Tokens: {message.stats.thinkingTokens}</li>}
                      <li>Response Time: {message.stats.endTime > (message.stats.firstResponseTokenTime || message.stats.firstTokenTime) ? ((message.stats.endTime - (message.stats.firstResponseTokenTime || message.stats.firstTokenTime)) / 1000).toFixed(2) : (0).toFixed(2)} seconds ({message.stats.responseTokens} tokens)</li>
                      {message.stats.responseTokens > 1 && (message.stats.firstResponseTokenTime && message.stats.firstResponseTokenTime > 0 ? message.stats.endTime > message.stats.firstResponseTokenTime : message.stats.endTime > message.stats.firstTokenTime) && (
                        <li>Token Speed: {
                          (() => {
                            const firstEffectiveTokenTime = message.stats.firstResponseTokenTime && message.stats.firstResponseTokenTime > 0 ? message.stats.firstResponseTokenTime : message.stats.firstTokenTime;
                            if (message.stats.endTime > firstEffectiveTokenTime && message.stats.responseTokens > 1) {
                              return ((message.stats.responseTokens -1) / ((message.stats.endTime - firstEffectiveTokenTime) / 1000)).toFixed(2) + " tokens/second";
                            }                          
                            return "N/A";
                          })()
                        }</li>
                      )}
                      <li>Total Time: {((message.stats.endTime - message.stats.startTime) / 1000).toFixed(2)} seconds ({message.stats.totalTokens} tokens)</li>
                      {message.stats.stopReason && <li>Stop Reason: {message.stats.stopReason}</li>}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      <footer className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isLoading || isLoadingModels || models.length === 0}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            disabled={isLoading || isLoadingModels || !input.trim() || models.length === 0}
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
