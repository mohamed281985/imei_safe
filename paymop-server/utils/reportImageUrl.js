export const getReportImageStorageLocation = (value, defaultBucket) => {
  if (typeof value !== 'string' || !value.trim()) return null;

  let bucket = defaultBucket;
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
    bucket = decodeURIComponent(storageMatch[1]);
    filePath = decodeURIComponent(storageMatch[2]);
  }

  filePath = filePath.split('?')[0].replace(/^\/+/, '');
  for (const knownBucket of ['phone_reports', 'registerphone']) {
    if (filePath.startsWith(`${knownBucket}/`)) {
      bucket = knownBucket;
      filePath = filePath.slice(knownBucket.length + 1);
      break;
    }
  }

  if (filePath.startsWith('reports/')) bucket = 'phone_reports';
  if (!filePath || !bucket) return null;
  return { bucket, filePath };
};

export const createReportImageSignedUrl = async (supabase, value, defaultBucket) => {
  const location = getReportImageStorageLocation(value, defaultBucket);
  if (!location) return null;

  const { data, error } = await supabase.storage
    .from(location.bucket)
    .createSignedUrl(location.filePath, 3600);

  if (error) throw error;
  return data?.signedUrl || data?.signed_url || null;
};