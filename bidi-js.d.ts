declare module 'bidi-js' {
  interface BidiJs {
    getBidiText(text: string, direction?: 'RTL' | 'LTR'): string;
    getEmbeddingLevels(text: string, explicitDirection?: string): any;
    getReorderSegments(text: string, embeddingLevels: any): any[];
    getMirroredCharactersMap(text: string, embeddingLevels: any): Map<number, string>;
    getBidiCharTypeName(char: string): string;
  }

  const bidiFactory: () => BidiJs;
  export default bidiFactory;
}