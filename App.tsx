import React, { useState, useCallback } from 'react';
import type { ProductData, ImageFile } from './types';
import { generateProductContent } from './services/aiService';
import Loader from './components/Loader';

// --- Helper Components (Defined outside App to prevent re-creation on re-renders) ---

const UploadIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);



const compressImageFile = (file: File): Promise<ImageFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('امکان خواندن تصویر وجود ندارد.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر پشتیبانی نشد.'));
      img.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('مرورگر امکان پردازش تصویر را ندارد.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          reject(new Error('فشرده‌سازی تصویر ناموفق بود.'));
          return;
        }
        resolve({
          base64,
          mimeType: 'image/jpeg',
          name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
        });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
};

interface ImageUploaderProps {
  image: ImageFile | null;
  setImage: (image: ImageFile | null) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ image, setImage }) => {
  const processFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const optimizedImage = await compressImageFile(file);
      setImage(optimizedImage);
    } catch (error) {
      console.error('Image optimization failed:', error);
      alert(error instanceof Error ? error.message : 'خطا در پردازش تصویر');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void processFile(event.target.files?.[0]);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void processFile(event.dataTransfer.files?.[0]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };


  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-300 mb-2">تصویر محصول (اختیاری)</label>
      <label 
        htmlFor="file-upload" 
        className="relative cursor-pointer bg-gray-800 rounded-lg border-2 border-dashed border-gray-600 flex flex-col justify-center items-center h-48 w-full hover:border-blue-400 transition-colors"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {image ? (
          <>
            <img src={`data:${image.mimeType};base64,${image.base64}`} alt="Preview" className="h-full w-full object-contain rounded-lg p-2" />
            <button
              onClick={(e) => { e.preventDefault(); setImage(null); }}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 text-xs hover:bg-red-700 transition"
              aria-label="Remove image"
            >
              &#x2715;
            </button>
          </>
        ) : (
          <div className="text-center">
            <UploadIcon />
            <p className="mt-2 text-sm text-gray-400">تصویر را بکشید و رها کنید یا کلیک کنید</p>
            <p className="text-xs text-gray-500">PNG, JPG, WEBP - تصویر قبل از ارسال سبک می‌شود</p>
          </div>
        )}
        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
      </label>
    </div>
  );
};

interface OutputSectionProps {
    label: string;
    content: React.ReactNode;
    isHtml?: boolean;
    copyText?: string;
    children?: React.ReactNode;
}

const OutputSection: React.FC<OutputSectionProps> = ({ label, content, isHtml = false, copyText, children }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const textToCopy = copyText || (typeof content === 'string' ? content : '');
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-blue-300">{label}</h3>
                {copyText && (
                    <button
                        onClick={handleCopy}
                        className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-md transition-colors text-sm"
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                        <span>{copied ? 'کپی شد!' : 'کپی'}</span>
                    </button>
                )}
            </div>
            <div className="text-gray-300 whitespace-pre-wrap font-sans">
                {isHtml && typeof content === 'string' ? (
                    <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
                ) : (
                   content
                )}
            </div>
            {children}
        </div>
    );
};


const AdvancedAnalysisItem: React.FC<{title: string, items: string[]}> = ({ title, items }) => (
    <div>
        <h4 className="font-semibold text-gray-400">{title}</h4>
        {items && items.length > 0 ? (
            <p className="text-gray-200 mt-1">
                {items.join('، ')}
            </p>
        ) : (
            <p className="text-gray-500 text-xs italic">موردی یافت نشد.</p>
        )}
    </div>
);


const AdvancedSeoTabs: React.FC<{ analysis: ProductData['advancedSeoAnalysis'] }> = ({ analysis }) => {
    const [activeTab, setActiveTab] = useState('keywords');

    const tabs = {
        keywords: 'کلیدواژه‌ها',
        intent: 'هدف جستجو',
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'keywords': {
                const allKeywords = [
                    ...(analysis.keyphraseSynonyms || []),
                    ...(analysis.lsiKeywords || []),
                    ...(analysis.longTailKeywords || []),
                    ...(analysis.semanticEntities || []),
                ].filter(Boolean);

                return (
                     <div>
                        <h4 className="font-semibold text-gray-400 mb-2">کلیدواژه های مرتبط</h4>
                        {allKeywords.length > 0 ? (
                            <p className="text-gray-200 bg-gray-700/50 p-3 rounded-md leading-relaxed">
                                {allKeywords.join('، ')}
                            </p>
                        ) : (
                            <p className="text-gray-500 text-xs italic">موردی یافت نشد.</p>
                        )}
                    </div>
                );
            }
            case 'intent':
                return (
                    <div>
                        <h4 className="font-semibold text-gray-400">Search Intent (هدف جستجو)</h4>
                        <p className="text-gray-200 bg-gray-700/50 px-2 py-1 rounded inline-block mt-1">{analysis.searchIntent}</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div>
            <div className="flex border-b border-gray-700 mb-3">
                {Object.entries(tabs).map(([key, title]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`-mb-px px-4 py-2 text-sm font-medium transition-colors focus:outline-none ${
                            activeTab === key
                                ? 'border-b-2 border-blue-400 text-white'
                                : 'border-b-2 border-transparent text-gray-400 hover:text-white hover:border-gray-500'
                        }`}
                        aria-pressed={activeTab === key}
                    >
                        {title}
                    </button>
                ))}
            </div>
            {/* The key attribute forces React to re-mount the component, triggering the animation */}
            <div key={activeTab} className="pt-2 text-sm animate-fade-in-fast">
                {renderContent()}
            </div>
        </div>
    );
};


// --- Main App Component ---

function App() {
  const [productName, setProductName] = useState<string>('');
  const [briefDescription, setBriefDescription] = useState<string>('');
  const [isNutsOrDriedFruit, setIsNutsOrDriedFruit] = useState<boolean>(false);
  const [productImage, setProductImage] = useState<ImageFile | null>(null);
  const [generatedContent, setGeneratedContent] = useState<ProductData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!productName) {
      setError('لطفاً نام محصول را وارد کنید.');
      return;
    }
    
    setError(null);
    setIsLoading(true);
    setGeneratedContent(null);

    try {
      const content = await generateProductContent(productName, productImage, briefDescription, isNutsOrDriedFruit);
      setGeneratedContent(content);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("یک خطای ناشناخته رخ داد.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [productName, productImage, briefDescription, isNutsOrDriedFruit]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
            Mohannad 4o
          </h1>
          <p className="mt-4 text-lg text-gray-400">
           دستیار هوشمند شما برای تولید و بهینه‌سازی محتوای محصول در وردپرس
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="bg-gray-800/50 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-200">۱. اطلاعات محصول را وارد کنید</h2>
            <div className="space-y-6">
              <div>
                <label htmlFor="product-name" className="block text-sm font-medium text-gray-300 mb-2">نام محصول (یا یک توصیف کلی)</label>
                <input
                  type="text"
                  id="product-name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="مثال: کافی میت نستله"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="brief-description" className="block text-sm font-medium text-gray-300 mb-2">توضیحات مختصر محصول (اختیاری)</label>
                <textarea
                  id="brief-description"
                  rows={5}
                  value={briefDescription}
                  onChange={(e) => setBriefDescription(e.target.value)}
                  placeholder="هر اطلاعاتی که به تولید محتوای بهتر کمک می‌کند را اینجا وارد کنید. مثال:
طعم: نمکی
خاستگاه: دامغان
روش نگهداری: در محیط خشک و خنک"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center gap-x-3">
                <input
                    id="is-nuts-checkbox"
                    name="is-nuts-checkbox"
                    type="checkbox"
                    checked={isNutsOrDriedFruit}
                    onChange={(e) => setIsNutsOrDriedFruit(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                 <label htmlFor="is-nuts-checkbox" className="block text-sm font-medium leading-6 text-gray-300">
                    این محصول آجیل یا خشکبار است؟ (برای تولید توضیحات متفاوت)
                </label>
              </div>

              <ImageUploader image={productImage} setImage={setProductImage} />
              
              <button
                onClick={handleSubmit}
                disabled={isLoading || !productName}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg flex justify-center items-center transition-all duration-300 transform hover:scale-105"
              >
                {isLoading ? <Loader /> : '✨ تولید محتوای بهینه'}
              </button>
              {error && <p className="text-red-400 text-center mt-4">{error}</p>}
            </div>
          </div>

          {/* Output Section */}
          <div className="bg-gray-800/50 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-200">۲. محتوای تولید شده</h2>
            <div className="h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <Loader />
                      <p className="mt-4 animate-pulse">در حال تولید محتوا طبق اصول Yoast SEO... این فرآیند ممکن است کمی طول بکشد.</p>
                  </div>
              )}
              {!isLoading && !generatedContent && (
                 <div className="flex items-center justify-center h-full text-gray-500">
                    <p>خروجی در اینجا نمایش داده می‌شود.</p>
                 </div>
              )}
              {generatedContent && (
                <div className="space-y-4 animate-fade-in">
                    {/* 1. Product Name */}
                    <OutputSection
                        label="نام محصول"
                        content={
                            <p>
                                <strong className="font-bold text-xl text-white">{generatedContent.correctedProductName}</strong>
                                <span className="block text-gray-400">{generatedContent.englishProductName}</span>
                            </p>
                        }
                        copyText={`${generatedContent.correctedProductName}\n${generatedContent.englishProductName}`}
                    />
                    {/* 2. Full Description */}
                    <OutputSection label="توضیحات کامل محصول" content={generatedContent.fullDescription} isHtml={true} copyText={generatedContent.fullDescription} />
                    {/* 3. Short Description */}
                     <OutputSection label="توضیحات کوتاه (Short Description)" content={generatedContent.shortDescription} copyText={generatedContent.shortDescription} />
                    {/* 4. Focus Keyphrase */}
                    <OutputSection label="کلیدواژه کانونی (Focus Keyphrase)" content={generatedContent.focusKeyword} copyText={generatedContent.focusKeyword} />
                    {/* 5. SEO Title */}
                    <OutputSection label="عنوان سئو (SEO Title)" content={generatedContent.seoTitle} copyText={generatedContent.seoTitle} />
                    {/* 6. Slug */}
                    <OutputSection label="نامک (Slug)" content={generatedContent.slug} copyText={generatedContent.slug} />
                    {/* 7. Meta Description */}
                    <OutputSection label="توضیحات متا (Meta Description)" content={generatedContent.metaDescription} copyText={generatedContent.metaDescription} />
                     {/* 8. Alt Image Text */}
                    <OutputSection label="متن جایگزین تصویر (Alt Text)" content={generatedContent.altImageText} copyText={generatedContent.altImageText} />
                    {/* 9. Advanced SEO Analysis */}
                    <OutputSection 
                        label="Advanced SEO Analysis (تجزیه و تحلیل سئو برتر)"
                        content={<AdvancedSeoTabs analysis={generatedContent.advancedSeoAnalysis} />}
                        copyText={
                           `Keywords: ${[
                                ...(generatedContent.advancedSeoAnalysis.keyphraseSynonyms || []),
                                ...(generatedContent.advancedSeoAnalysis.lsiKeywords || []),
                                ...(generatedContent.advancedSeoAnalysis.longTailKeywords || []),
                                ...(generatedContent.advancedSeoAnalysis.semanticEntities || []),
                            ].filter(Boolean).join(', ')}\n` +
                            `Search Intent: ${generatedContent.advancedSeoAnalysis.searchIntent}\n` +
                            `Internal Linking Suggestions: ${generatedContent.advancedSeoAnalysis.internalLinkingSuggestions.join(', ')}`
                        }
                    />
                </div>
              )}
            </div>
          </div>
        </div>
        <footer className="text-center mt-10 text-gray-500 text-sm">
            <p>ساخته شده با 🧠 و ❤️ توسط Mohannad</p>
        </footer>
      </div>
       <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #2d3748; /* gray-800 */
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #4a5568; /* gray-600 */
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #718096; /* gray-500 */
          }
          .prose strong {
            font-weight: 700;
            color: #fafafa;
          }
          .prose h4, .prose h5 {
            font-size: 1em; /* Same size as surrounding text */
            font-weight: 700;
            color: #fafafa; /* Same as strong tag */
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
            padding-bottom: 0;
            border-bottom: none;
          }
          .prose h4:first-of-type, .prose h5:first-of-type {
              margin-top: 0.75rem;
          }
          .prose p, .prose ul {
            margin-bottom: 0.75rem;
          }
          .prose ul {
            padding-right: 1.5rem;
          }
           .prose li {
            margin-bottom: 0.25rem;
           }
           .prose hr {
            border-top-color: #4a5568; /* gray-600 */
            margin-top: 1.5rem;
            margin-bottom: 1.5rem;
           }
           .direction-ltr {
            direction: ltr;
            text-align: left;
           }
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.5s ease-out forwards;
          }
          @keyframes fade-in-fast {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-fast {
            animation: fade-in-fast 0.3s ease-out forwards;
          }
      `}</style>
    </div>
  );
}

export default App;
