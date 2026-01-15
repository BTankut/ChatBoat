import { NextResponse } from 'next/server';

interface Model {
  id: string;
  object: string;
  owned_by: string;
}

interface ModelsResponse {
  data: Model[];
  object: string;
}

// LM Studio'dan aktif modelleri getiren fonksiyon
async function getAvailableModels(lmStudioUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${lmStudioUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer lm-studio'
      }
    });

    if (!response.ok) {
      console.error('Model listesi alınamadı:', response.statusText);
      return null;
    }

    const data = await response.json() as ModelsResponse;
    console.log('Kullanılabilir modeller:', data.data);
    
    // Aktif modeli döndür (ilk model genellikle aktif olan)
    if (data.data && data.data.length > 0) {
      return data.data[0].id; // İlk modeli döndür
    }
    
    return null;
  } catch (error) {
    console.error('Model listesi alınırken hata:', error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    // İstek gövdesinden mesajları, seçilen modeli, sunucu URL'sini ve thinking özelliği tercihini al
    const { messages, selectedModel, serverUrl, enableThinking } = await request.json();
    
    // Thinking özelliği tercihini konsola yazdır
    console.log(`Thinking modu: ${enableThinking === true ? 'AÇİK' : 'KAPALI'}`);

    // Mesajları kontrol et
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Geçerli mesaj dizisi gerekli');
    }

    // Seçilen modeli kontrol et
    if (!selectedModel) {
      throw new Error('Lütfen bir model seçin.');
    }
    
    // Sunucu URL'sini kontrol et
    if (!serverUrl) {
      throw new Error('Sunucu URL\'si belirtilmedi');
    }

    // Kullanıcının girdiği sunucu URL'sini kullan
    const lmStudioUrl = serverUrl;
    console.log('LM Studio URL:', lmStudioUrl);

    if (!selectedModel) {
      throw new Error('Lütfen bir model seçin.');
    }

    // Streaming yanıt için ReadableStream oluştur
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Streaming yanıt için ReadableStream oluştur
    const stream = new ReadableStream({
      async start(controller) {
        // Doğrudan fetch API'sini kullanarak istek gönderelim
        const response = await fetch(`${lmStudioUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer lm-studio'
          },
          body: JSON.stringify(
            enableThinking === true
              ? {
                  // Thinking modu açıksa
                  model: selectedModel,
                  messages: messages,
                  temperature: 0.6, // Thinking mode için önerilen
                  top_p: 0.95,
                  top_k: 20,
                  min_p: 0,
                  max_tokens: 2000,
                  stream: true,
                  thinking: true // Önemli: Thinking parametresi açık
                }
              : {
                  // Thinking modu kapalıysa
                  model: selectedModel,
                  messages: messages,
                  temperature: 0.7, // Non-thinking mode için önerilen
                  top_p: 0.8,
                  top_k: 20,
                  min_p: 0,
                  max_tokens: 2000,
                  stream: true
                  // thinking parametresi yok - bu önemli
                }
          )
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('LM Studio Server hatası:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          controller.error(`LM Studio Server hatası: ${response.status} ${response.statusText}`);
          return;
        }

        // Stream yanıtı işle
        const reader = response.body?.getReader();
        if (!reader) {
          controller.error('Stream okunamadı');
          return;
        }

        let isInsideThinkingBlock = false;
        let buffer = '';
        let completeResponse = '';
        let isControllerClosed = false;
        
        // İstatistikler için değişkenler
        const stats = {
          startTime: Date.now(),
          firstTokenTime: 0, // Time of any first token
          firstResponseTokenTime: 0, // Time of the first actual response token
          endTime: 0,
          thinkingStartTime: 0,
          thinkingEndTime: 0,
          totalTokens: 0,
          thinkingTokens: 0,
          responseTokens: 0,
          stopReason: '',
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Yanıt tamamlandığında son istatistikleri güncelle
              stats.endTime = Date.now();
              
              // Son istatistikleri gönder
              if (!isControllerClosed) {
                try {
                  controller.enqueue(encoder.encode(JSON.stringify({
                    content: "",
                    isThinking: false,
                    stats,
                    completed: true
                  }) + '\n'));
                } catch (error) {
                  console.error('Controller enqueue hatası (tamamlandı):', error);
                  isControllerClosed = true;
                }
              }
              
              break;
            }
            
            // Veriyi metin olarak dönüştür
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Satır satır işle (SSE formatı)
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                // Stop reason kontrolü
                if (data === '[DONE]') continue;
                
                try {
                  const json = JSON.parse(data);
                  let contentChunk = json.choices[0]?.delta?.content || '';
                  
                  // Stop reason kontrolü
                  if (json.choices[0]?.finish_reason) {
                    stats.stopReason = json.choices[0].finish_reason;
                  }
                  
                  if (contentChunk) {
                    // İlk genel token zamanını kaydet
                    if (stats.totalTokens === 0) {
                      stats.firstTokenTime = Date.now();
                    }
                    stats.totalTokens++;
                    completeResponse += contentChunk;

                    // Token tipini belirle ve sayaçları güncelle
                    // isInsideThinkingBlock, bir önceki chunk'tan gelen durumu yansıtır.
                    let chunkIsCurrentlyConsideredThinking = isInsideThinkingBlock;

                    if (contentChunk.includes('<think>')) {
                      if (!isInsideThinkingBlock) { // Yeni bir düşünme bloğu başlıyor
                        stats.thinkingStartTime = Date.now();
                      }
                      isInsideThinkingBlock = true;
                      chunkIsCurrentlyConsideredThinking = true; // Bu chunk kesinlikle düşünme ile ilgili
                    }

                    if (chunkIsCurrentlyConsideredThinking) {
                      stats.thinkingTokens++;
                    } else {
                      stats.responseTokens++;
                      if (stats.firstResponseTokenTime === 0) {
                        stats.firstResponseTokenTime = Date.now();
                      }
                    }

                    if (contentChunk.includes('</think>')) {
                      if (isInsideThinkingBlock) { // Düşünme bloğu bitiyor
                        stats.thinkingEndTime = Date.now();
                      }
                      isInsideThinkingBlock = false;
                      // Eğer chunk </think> ile bitiyorsa ve düşünme olarak işaretlenmediyse,
                      // bir sonraki chunk kesinlikle response olacak.
                    }
                    
                    // Frontend'e gönderilecek içeriği temizle
                    const cleanedContent = contentChunk.replace(/<think>|<\/think>/g, '');
                    
                    // Thinking modu kapalıysa ve bu chunk thinking içeriği ise, frontend'e gönderme
                    if (enableThinking === false && chunkIsCurrentlyConsideredThinking) {
                      // Thinking içeriğini sessizce atla
                    } else if (!isControllerClosed) {
                      try {
                        // İstatistikleri ve içeriği gönder
                        controller.enqueue(encoder.encode(JSON.stringify({
                          content: cleanedContent,
                          isThinking: chunkIsCurrentlyConsideredThinking, // Bu chunk'ın düşünme durumu
                          stats,
                          completed: false
                        }) + '\n'));
                      } catch (error) {
                        console.error('Controller enqueue hatası:', error);
                        isControllerClosed = true;
                      }
                    }
                  }
                } catch (e) {
                  console.error('JSON parse hatası:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream okuma hatası:', error);
          if (!isControllerClosed) {
            try {
              controller.error(error);
            } catch (e) {
              console.error('Controller error hatası:', e);
            }
          }
        } finally {
          reader.releaseLock();
          if (!isControllerClosed) {
            try {
              controller.close();
              isControllerClosed = true;
            } catch (e) {
              console.error('Controller close hatası:', e);
            }
          }
        }
      }
    });
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    console.error('LM Studio API hatası:', error);
    // Hata detaylarını göster
    console.error('Hata detayları:', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
    
    return NextResponse.json(
      { 
        error: 'LM Studio Server\'a bağlanırken bir hata oluştu.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
