export interface AdvancedSeoAnalysis {
  keyphraseSynonyms: string[];
  lsiKeywords: string[];
  longTailKeywords: string[];
  semanticEntities: string[];
  searchIntent: string;
  internalLinkingSuggestions: string[];
}

export interface RelatedInternalLink {
  title: string;
  url: string;
  type: 'category' | 'product' | 'page' | 'search';
  reason: string;
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
  relatedInternalLinks?: RelatedInternalLink[];
}

export interface ImageFile {
  base64: string;
  mimeType: string;
  name: string;
}