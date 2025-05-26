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

export async function GET() {
  try {
    // LM Studio Server URL'si
    const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://192.168.1.183:1234';
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
    console.error('Model listesi alınırken hata:', error);
    
    return NextResponse.json(
      { 
        error: 'Model listesi alınırken bir hata oluştu',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
