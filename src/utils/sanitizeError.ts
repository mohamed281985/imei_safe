export function sanitizeError(err: any): string {
  try {
    if (import.meta.env.MODE === 'production') return 'An error occurred';
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err.message) return String(err.message);
    return JSON.stringify(err);
  } catch (e) {
    return 'An error occurred';
  }
}

export default sanitizeError;
