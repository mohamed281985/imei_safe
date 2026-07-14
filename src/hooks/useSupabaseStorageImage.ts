import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Configurações do serviço
const BUCKET_NAME = 'upgrade-offer';
const FOLDER_NAME = 'upgrade-offer';
const CACHE_KEY = 'supabase_storage_image_cache';
const CACHE_DURATION = 3600000; // 1 hora em ms
const FALLBACK_IMAGE = '/placeholder.svg';
const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

interface CacheEntry {
  url: string;
  timestamp: number;
}

/**
 * Hook para carregar dinamicamente a imagem mais recente de uma pasta Supabase Storage
 * @param folder - Caminho da pasta no bucket
 * @param fallbackImage - Imagem padrão se nenhuma for encontrada
 * @returns URL da imagem e estado de carregamento
 */
export const useSupabaseStorageImage = (
  folder: string = FOLDER_NAME,
  fallbackImage: string = FALLBACK_IMAGE
) => {
  const [imageUrl, setImageUrl] = useState<string>(fallbackImage);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestImage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Verificar cache
        const cached = getFromCache();
        if (cached) {
          setImageUrl(cached);
          setLoading(false);
          return;
        }

        // Listar arquivos da pasta
        const { data: files, error: listError } = await supabase.storage
          .from(BUCKET_NAME)
          .list(folder, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' }
          });

        if (listError) {
          throw new Error(`Erro ao listar arquivos: ${listError.message}`);
        }

        if (!files || files.length === 0) {
          setImageUrl(fallbackImage);
          setLoading(false);
          return;
        }

        // Filtrar apenas arquivos de imagem (excluir pastas)
        const imageFiles = files.filter(file => {
          if (file.metadata?.mimetype?.startsWith('image/')) {
            return true;
          }
          // Fallback: verificar extensão se mimetype não estiver disponível
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          return SUPPORTED_FORMATS.includes(ext);
        });

        if (imageFiles.length === 0) {
          setImageUrl(fallbackImage);
          setLoading(false);
          return;
        }

        // Pegar a primeira imagem (mais recente, já que está ordenada por data)
        const latestImage = imageFiles[0];

        // Gerar URL pública
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(`${folder}/${latestImage.name}`);

        if (!publicUrlData?.publicUrl) {
          throw new Error('Não foi possível gerar URL pública');
        }

        const publicUrl = publicUrlData.publicUrl;

        // Armazenar no cache
        saveToCache(publicUrl);

        setImageUrl(publicUrl);
        setError(null);
      } catch (err) {
        console.error('Erro ao buscar imagem:', err);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        setImageUrl(fallbackImage);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestImage();
  }, [folder, fallbackImage]);

  return { imageUrl, loading, error };
};

/**
 * Obter URL da imagem do cache local
 */
const getFromCache = (): string | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);
    const now = Date.now();

    // Verificar se o cache ainda é válido
    if (now - entry.timestamp < CACHE_DURATION) {
      return entry.url;
    }

    // Cache expirado, remover
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch (err) {
    console.warn('Erro ao ler cache:', err);
    return null;
  }
};

/**
 * Armazenar URL da imagem no cache local
 */
const saveToCache = (url: string): void => {
  try {
    const entry: CacheEntry = {
      url,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (err) {
    console.warn('Erro ao salvar cache:', err);
  }
};

/**
 * Limpar cache manualmente
 */
export const clearStorageImageCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('Erro ao limpar cache:', err);
  }
};

/**
 * Ferramenta alternativa: Carregar imagem diretamente sem React Hook
 * Útil para componentes que não usam React Hooks
 */
export const getSupabaseStorageImageUrl = async (
  folder: string = FOLDER_NAME,
  fallbackImage: string = FALLBACK_IMAGE
): Promise<string> => {
  try {
    // Verificar cache
    const cached = getFromCache();
    if (cached) {
      return cached;
    }

    // Listar arquivos
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError || !files || files.length === 0) {
      return fallbackImage;
    }

    // Filtrar imagens
    const imageFiles = files.filter(file => {
      if (file.metadata?.mimetype?.startsWith('image/')) {
        return true;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return SUPPORTED_FORMATS.includes(ext);
    });

    if (imageFiles.length === 0) {
      return fallbackImage;
    }

    // Gerar URL pública
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`${folder}/${imageFiles[0].name}`);

    const publicUrl = publicUrlData?.publicUrl || fallbackImage;

    // Salvar no cache
    if (publicUrl !== fallbackImage) {
      saveToCache(publicUrl);
    }

    return publicUrl;
  } catch (err) {
    console.error('Erro ao buscar imagem:', err);
    return fallbackImage;
  }
};
