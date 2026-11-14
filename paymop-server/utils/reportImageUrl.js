export const getReportImageStorageLocation = (value, defaultBucket) => {
  if (typeof value !== 'string' || !value.trim()) return null;

  let filePath = value.trim();

  if (/^https?:\/\//i.test(filePath)) {
    let pathname;
    try {
      pathname = new URL(filePath).pathname;
    } catch {
      return null;
    }

    const storageMatch = pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
    if (!storageMatch) return null;
    filePath = decodeURIComponent(storageMatch[2]);
  }

  filePath = filePath.split('?')[0].replace(/^\/+/, '');
  for (const knownBucket of ['registerphone', 'phone_reports']) {
    if (filePath.startsWith(`${knownBucket}/`)) {
      filePath = filePath.slice(knownBucket.length + 1);
      break;
    }
  }

  if (!filePath) return null;
  return {
    filePath,
    buckets: ['registerphone', 'phone_reports'],
  };
};

export const createReportImageSignedUrl = async (supabase, value, defaultBucket) => {
  const location = getReportImageStorageLocation(value, defaultBucket);
  if (!location) return null;

  let lastError = null;
  for (const bucket of location.buckets) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(location.filePath, 3600);

    if (error) {
      lastError = error;
      continue;
    }
    const signedUrl = data?.signedUrl || data?.signed_url;
    if (signedUrl) return signedUrl;
  }

  if (lastError) throw lastError;
  return null;
};