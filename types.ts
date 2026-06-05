export interface AdvancedSeoAnalysis {
  keyphraseSynonyms: string[];
  lsiKeywords: string[];
  longTailKeywords: string[];
  semanticEntities: string[];
  searchIntent: string;
  internalLinkingSuggestions: string[];
}

export interface ProductData {
  correctedProductName: string;
  englishProductName: string;
  fullDescription: string;
  shortDescription: string;
  seoTitle: string;
  slug: string;
  focusKeyword: string;
  metaDescription: string;
  altImageText: string;
  advancedSeoAnalysis: AdvancedSeoAnalysis;
}

export interface ImageFile {
  base64: string;
  mimeType: string;
  name: string;
}