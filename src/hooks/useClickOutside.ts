import { useEffect, useRef } from 'react';

/**
 * مخصص Hook للتعامل مع النقر خارج عنصر معين
 * @param callback الدالة التي يتم استدعاؤها عند النقر خارج العنصر
 * @param العناصر التي يجب تجاهل النقر عليها (اختياري)
 * @returns ref يجب تطبيقه على العنصر الذي تريد مراقبة النقرات خارجه
 */
export const useClickOutside = (
  callback: () => void,
  ignoreElements: HTMLElement[] = []
) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        // التحقق مما إذا كان العنصر الذي تم النقر عليه في قائمة العناصر التي يجب تجاهلها
        const isIgnored = ignoreElements.some(element => 
          element.contains(event.target as Node)
        );

        if (!isIgnored) {
          callback();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [callback, ignoreElements]);

  return ref;
};
