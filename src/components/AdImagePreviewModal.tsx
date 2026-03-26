import React from 'react';
import Modal from 'react-modal';
import { MapPin, MessageCircle } from 'lucide-react';

Modal.setAppElement('#root');

interface AdImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  storeName?: string;
  hasLocation?: boolean;
  hasWhatsapp?: boolean;
  aspectRatio?: 'landscape' | 'portrait';
}

export default function AdImagePreviewModal({ 
  isOpen, 
  onClose, 
  imageUrl,
  storeName = 'اسم المتجر',
  hasLocation = true,
  hasWhatsapp = true,
  aspectRatio = 'portrait' 
}: AdImagePreviewModalProps) {
  // استخدم فقط خصائص مدعومة من React/CSS للعنصر <img>
  const aspectStyle = aspectRatio === 'landscape' ? {
    width: '100%',
    height: 'auto',
    objectFit: 'contain' as React.CSSProperties['objectFit']
  } : {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as React.CSSProperties['objectFit']
  };
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '95%',
          maxWidth: '450px',
          height: '600px',
          margin: 'auto',
          padding: 0,
          borderRadius: 20,
          background: 'transparent',
          overflow: 'hidden',
          position: 'absolute',
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
          border: 'none',
        },
        overlay: { 
          zIndex: 1000,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          background: '#e11d48',
          color: '#fff',
          borderRadius: '50%',
          padding: 8,
          border: 'none',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
        aria-label="إغلاق"
      >X</button>

      <div style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 10,
        background: 'transparent'
      }}>
        <img
          src={imageUrl}
          alt="معاينة الإعلان"
          style={{
            ...aspectStyle,
            background: 'transparent',
            display: 'block'
          }}
        />

        {/* Store Name */}
        <div style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(255, 215, 0, 0.9)',
          color: '#000',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 1000,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          {storeName}
        </div>

        {/* Action Buttons */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          gap: '10px',
          width: '90%',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          padding: '15px',
          borderRadius: '15px'
        }}>
          <button
            style={{
              background: '#25D366',
              color: '#fff',
              borderRadius: '13px',
              padding: '6px 16px',
              border: 'none',
              minWidth: '80px',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              flex: 1
            }}
          >
            <MessageCircle size={16} style={{marginLeft: 0}} />
            <span>واتساب</span>
          </button>

          {hasLocation && (
            <button
              style={{
                background: '#f3af1d',
                color: '#fff',
                borderRadius: '13px',
                padding: '6px 16px',
                border: 'none',
                minWidth: '80px',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                flex: 1
              }}
            >
              <MapPin size={16} style={{marginLeft: 0}} />
              <span>لوكيشن المحل</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}