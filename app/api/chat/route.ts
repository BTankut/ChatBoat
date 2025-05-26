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
    const { messages, selectedModel } = await request.json();
    console.log('Gelen mesajlar:', messages);
    console.log('Seçilen model:', selectedModel);

    // LM Studio Server URL'si
    const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.183:1234';
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
          body: JSON.stringify({
            model: selectedModel, // Kullanıcının seçtiği modeli kullan
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: true // Streaming yanıt için true olarak ayarla
          })
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

        let isThinking = false;
        let buffer = '';
        let completeResponse = '';
        
        // İstatistikler için değişkenler
        const stats = {
          startTime: Date.now(),
          firstTokenTime: 0,
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
              controller.enqueue(encoder.encode(JSON.stringify({
                content: "",
                isThinking: false,
                stats,
                completed: true
              }) + '\n'));
              
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
                  let content = json.choices[0]?.delta?.content || '';
                  
                  // Stop reason kontrolü
                  if (json.choices[0]?.finish_reason) {
                    stats.stopReason = json.choices[0].finish_reason;
                  }
                  
                  if (content) {
                    // İlk token zamanını kaydet
                    if (stats.totalTokens === 0) {
                      stats.firstTokenTime = Date.now();
                    }
                    
                    completeResponse += content;
                    stats.totalTokens++;
                    
                    // <think> etiketlerini işle
                    if (content.includes('<think>')) {
                      isThinking = true;
                      // Düşünme başlangıç zamanını kaydet
                      if (stats.thinkingStartTime === 0) {
                        stats.thinkingStartTime = Date.now();
                      }
                      // </think> etiketini içerikten temizle
                      content = content.replace('</think>', '');
                    }
                    
                    if (content.includes('</think>')) {
                      isThinking = false;
                      // Düşünme bitiş zamanını kaydet
                      stats.thinkingEndTime = Date.now();
                      // </think> etiketini içerikten temizle
                      content = content.replace('</think>', '');
                    }
                    
                    // <think> etiketini içerikten temizle
                    content = content.replace('<think>', '');
                    
                    // Token sayısını güncelle
                    if (isThinking) {
                      stats.thinkingTokens++;
                    } else {
                      stats.responseTokens++;
                    }
                    
                    // Düşünme modu dışındaki içeriği gönder
                    controller.enqueue(encoder.encode(JSON.stringify({ 
                      content,
                      isThinking,
                      stats
                    }) + '\n'));
                  }
                } catch (e) {
                  console.error('JSON parse hatası:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream okuma hatası:', error);
          controller.error(error);
        } finally {
          reader.releaseLock();
          controller.close();
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
