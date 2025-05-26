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

export async function POST(request: Request) {
  try {
    // İstek gövdesinden sunucu URL'sini al
    const body = await request.json();
    console.log('Alınan istek gövdesi:', body);
    
    const { serverUrl } = body;
    
    if (!serverUrl) {
      throw new Error('Sunucu URL\'si belirtilmedi');
    }
    
    // LM Studio Server URL'si
    const lmStudioUrl = serverUrl;
    console.log('LM Studio URL:', lmStudioUrl);

    const response = await fetch(`${lmStudioUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer lm-studio'
      }
    });

    if (!response.ok) {
      console.error('Model listesi alınamadı:', response.statusText);
      return NextResponse.json(
        { error: 'Model listesi alınamadı', details: response.statusText },
        { status: response.status }
      );
    }

    const data = await response.json() as ModelsResponse;
    console.log('Kullanılabilir modeller:', data.data);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LM Studio API hatası:', error);
    console.error('Hata detayları:', JSON.stringify(error, null, 2));
    
    // Daha detaylı hata mesajı oluştur
    let errorMessage = 'LM Studio API hatası';
    
    if (error.message) {
      errorMessage += `: ${error.message}`;
    }
    
    if (error.cause) {
      errorMessage += ` (Neden: ${error.cause})`;
    }
    
    if (error.code) {
      errorMessage += ` [Kod: ${error.code}]`;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
