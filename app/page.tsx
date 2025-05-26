"use client";

import { useEffect, useState } from "react";

interface Stats {
  startTime: number;
  firstTokenTime: number;
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
  thinking?: string; // Düşünme içeriği için
  stats?: Stats; // İstatistikler
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
  
  // Sunucu URL ayarları için state'ler
  const [serverUrl, setServerUrl] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState("");

  // localStorage'dan sunucu URL'sini yükle ve modelleri getir
  useEffect(() => {
    const initializeApp = async () => {
      // Önce localStorage'dan URL'yi al
      let url = localStorage.getItem('lmStudioServerUrl');
      if (!url) {
        // Varsayılan URL
        url = 'http://localhost:1234';
        localStorage.setItem('lmStudioServerUrl', url);
      }
      
      // State'leri güncelle
      setServerUrl(url);
      setTempServerUrl(url);
      
      // Modelleri yükle
      try {
        setIsLoadingModels(true);
        setModelError("");
        
        console.log('Modelleri yükleme isteği gönderiliyor, URL:', url);
        
        const response = await fetch("/api/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ serverUrl: url })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Model listesi alınamadı: ${response.status}`);
        }
        
        const data = await response.json() as ModelsResponse;
        setModels(data.data);
        
        // Eğer model varsa ilkini seç
        if (data.data && data.data.length > 0) {
          setSelectedModel(data.data[0].id);
        }
      } catch (error: any) {
        console.error("Modeller yüklenirken hata:", error);
        setModelError(error.message || "Modeller yüklenemedi");
        setModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    };

    initializeApp();
  }, []);  // Sadece bir kez çalıştır
  
  // Sunucu URL'si değiştiğinde modelleri yeniden yükle
  useEffect(() => {
    // İlk yüklemede çalışmaması için kontrol
    if (serverUrl && serverUrl !== localStorage.getItem('lmStudioServerUrl')) {
      refreshModels();
    }
  }, [serverUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Model seçilmemişse uyarı göster
    if (!selectedModel) {
      alert("Lütfen bir model seçin!");
      return;
    }

    // Kullanıcı mesajını ekle
    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    // Boş asistan mesajı ekle (streaming için)
    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      thinking: ""
    };
    const newMessageIndex = updatedMessages.length;
    setMessages([...updatedMessages, assistantMessage]);
    
    // Yeni mesaj için istatistik penceresini varsayılan olarak aç
    setOpenStatsIndices(prev => [...prev, newMessageIndex]);

    try {
      // API'ye istek gönder
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
          selectedModel: selectedModel, // Seçilen modeli gönder
          serverUrl: serverUrl, // Sunucu URL'sini gönder
        }),
      });

      if (!response.ok) {
        throw new Error("API isteği başarısız oldu");
      }

      // Stream yanıtı işle
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Yanıt okunamadı");
      }

      // Streaming yanıt için değişkenler
      let currentContent = "";
      let currentThinking = "";
      let isInThinkingMode = false;
      let messageIndex = updatedMessages.length; // Asistan mesajının indeksi

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Chunk'u metin olarak dönüştür
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const { content, isThinking, stats, completed } = JSON.parse(line);
              
              // Yanıt tamamlandıysa işlem yapma
              if (completed) {
                // Son istatistikleri güncelle
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
              
              // Düşünme modunu kontrol et
              if (isThinking) {
                isInThinkingMode = true;
                // Düşünme modundayken düşünme penceresini aç
                if (!openThinkingIndices.includes(messageIndex)) {
                  setOpenThinkingIndices(prev => [...prev, messageIndex]);
                }
              } else if (isInThinkingMode && !isThinking) {
                // Düşünme modu bittiğinde düşünme penceresini kapat
                isInThinkingMode = false;
                setOpenThinkingIndices(prev => prev.filter(i => i !== messageIndex));
              }
              
              // İçeriği uygun yere ekle
              if (isThinking || isInThinkingMode) {
                // Düşünme içeriğini güncelle
                currentThinking += content;
              } else {
                // Normal içeriği güncelle
                currentContent += content;
              }
              
              // Mesajları güncelle
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === "assistant") {
                  // <think> etiketlerini temizle
                  const cleanedThinking = currentThinking
                    .replace(/<think>/g, '')
                    .replace(/<\/think>/g, '');
                  
                  // Asistan mesajını güncelle
                  lastMessage.content = currentContent;
                  lastMessage.thinking = cleanedThinking;
                  lastMessage.stats = stats;
                }
                return newMessages;
              });
            } catch (e) {
              console.error("Chunk işleme hatası:", e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Hata:", error);
      // Hata mesajını ekle
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          lastMessage.content = "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.";
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Ayarları kaydetme fonksiyonu
  const saveSettings = () => {
    setServerUrl(tempServerUrl);
    localStorage.setItem('lmStudioServerUrl', tempServerUrl);
    setIsSettingsOpen(false);
  };

  // Modelleri yeniden yükleme fonksiyonu
  const refreshModels = async () => {
    try {
      // Önce state'leri sıfırla
      setIsLoadingModels(true);
      setModelError("");
      setModels([]);
      setSelectedModel("");
      
      console.log('Modelleri yeniden yükleme isteği gönderiliyor, URL:', serverUrl);
      
      try {
        const response = await fetch("/api/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ serverUrl })
        });
        
        console.log('API yanıtı alındı, durum kodu:', response.status);
        
        // Yanıtı JSON olarak çözmeyi dene
        const responseText = await response.text();
        console.log('API yanıt metni:', responseText);
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON ayrıştırma hatası:', parseError);
          throw new Error(`Yanıt JSON olarak ayrıştırılamadı: ${responseText}`);
        }
        
        if (!response.ok) {
          throw new Error(data.error || `Model listesi alınamadı: ${response.status}`);
        }
        
        if (!data.data || !Array.isArray(data.data)) {
          console.error('Beklenmeyen API yanıt formatı:', data);
          throw new Error('API yanıtı beklenen formatta değil');
        }
        
        setModels(data.data);
        
        // Eğer model varsa ilkini seç
        if (data.data && data.data.length > 0) {
          setSelectedModel(data.data[0].id);
        }
      } catch (fetchError: any) {
        // Ağ hatası veya bağlantı hatası durumunda
        if (fetchError.name === 'TypeError' || fetchError.message.includes('fetch failed')) {
          throw new Error(`LM Studio Server'a bağlanılamadı. Lütfen sunucunun çalıştığından ve URL'nin doğru olduğundan emin olun: ${serverUrl}`);
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error("Modeller yüklenirken hata:", error);
      setModelError(error.message || "Modeller yüklenemedi");
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
            <h1 className="text-xl font-bold">LM Studio Chat</h1>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Ayarlar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          
          {/* Model seçimi */}
          <div className="w-full sm:w-auto">
            {isLoadingModels ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Modeller yükleniyor...</div>
            ) : modelError ? (
              <div className="flex items-center gap-2">
                <div className="text-sm text-red-500">{modelError}</div>
                <button 
                  onClick={refreshModels}
                  className="p-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                >
                  Yenile
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
                    <option value="">Model bulunamadı</option>
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
      
      {/* Ayarlar Modalı */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Sunucu Ayarları</h2>
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
                LM Studio Server URL
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
                LM Studio Server'ın çalıştığı IP adresi ve port numarasını girin.
                <br />
                Örnek: http://192.168.1.100:1234
              </p>
            </div>
            
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                İptal
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 my-8">
              <p>LM Studio Server ile sohbete başlayın!</p>
              <p className="text-sm mt-2">Modelinize bir soru sorun veya bir görev verin.</p>
              {models.length > 0 && (
                <p className="text-sm mt-4 font-medium">
                  Seçili model: <span className="text-blue-500">{selectedModel}</span>
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
                  {/* Düşünme içeriği varsa göster/gizle butonu */}
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
                          Düşünme sürecini gizle
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Düşünme sürecini göster
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* İstatistik butonu */}
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
                          İstatistikleri gizle
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          İstatistikleri göster
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                {/* Düşünme içeriği açıksa göster */}
                {message.thinking && message.thinking.trim() !== "" && openThinkingIndices.includes(index) && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-600 rounded border-l-4 border-yellow-500">
                    <div className="flex items-center mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">Düşünme Süreci</span>
                      
                      {message.stats && message.stats.thinkingTokens > 0 && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          ({message.stats.thinkingTokens} token | {((message.stats.thinkingEndTime - message.stats.thinkingStartTime) / 1000).toFixed(2)} sn)
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-300">{message.thinking}</p>
                  </div>
                )}
                
                {/* İstatistikler açıksa göster */}
                {message.stats && message.role === "assistant" && openStatsIndices.includes(index) && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-600 rounded border-l-4 border-green-500">
                    <div className="flex items-center mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">İstatistikler</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">Toplam Token:</span>
                        <span>{message.stats.totalTokens}</span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="font-medium">Yanıt Token:</span>
                        <span>{message.stats.responseTokens}</span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="font-medium">Tok/sn:</span>
                        <span>
                          {message.stats.endTime && message.stats.startTime ? 
                            (message.stats.totalTokens / ((message.stats.endTime - message.stats.startTime) / 1000)).toFixed(2) : 
                            "N/A"}
                        </span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="font-medium">TTF:</span>
                        <span>
                          {message.stats.firstTokenTime && message.stats.startTime ? 
                            ((message.stats.firstTokenTime - message.stats.startTime) / 1000).toFixed(2) + " sn" : 
                            "N/A"}
                        </span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="font-medium">Toplam Süre:</span>
                        <span>
                          {message.stats.endTime && message.stats.startTime ? 
                            ((message.stats.endTime - message.stats.startTime) / 1000).toFixed(2) + " sn" : 
                            "N/A"}
                        </span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="font-medium">Duruş Nedeni:</span>
                        <span>{message.stats.stopReason || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="p-4 rounded-lg bg-gray-200 dark:bg-gray-700 mr-auto max-w-[80%]">
              <p>Düşünüyor...</p>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white dark:bg-gray-800 p-4 shadow-inner">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Bir mesaj yazın..."
            className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isLoading || !selectedModel}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !selectedModel}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Gönder
          </button>
        </form>
      </footer>
    </div>
  );
}
