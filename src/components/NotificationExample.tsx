import React, { useState } from 'react';
import { NotificationService } from '../services/notificationService';

const NotificationExample: React.FC = () => {
  const [receiverId, setReceiverId] = useState<string>('');
  const [title, setTitle] = useState<string>('');  
  const [body, setBody] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const handleSendNotification = async () => {
    if (!receiverId || !title || !body) {
      setMessage('يرجى ملء جميع الحقول');
      return;
    }

    setStatus('sending');
    setMessage('جاري إرسال الإشعار...');

    try {
      // في تطبيق حقيقي، يجب الحصول على توكن الجهاز المستقبل من قاعدة البيانات
      // هنا سنستخدم توكن افتراضي للاختبار
      const receiverToken = 'RECEIVER_DEVICE_TOKEN_HERE'; // استبدل هذا بالتوكن الفعلي

      const result = await NotificationService.sendNotification(
        'CURRENT_USER_ID', // معرف المرسل (يجب الحصوله من سياق المستخدم)
        receiverToken,
        title,
        body,
        { type: 'custom_message' }
      );

      if (result.success) {
        setStatus('success');
        setMessage('تم إرسال الإشعار بنجاح');
      } else {
        setStatus('error');
        setMessage(`فشل الإرسال: ${result.error}`);
      }
    } catch (error) {
      setStatus('error');
      setMessage('حدث خطأ أثناء الإرسال');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '500px' }}>
      <h2>إرسال إشعار تجريبي</h2>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>معرف المستلم:</label>
        <input
          type="text"
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>عنوان الإشعار:</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>محتوى الإشعار:</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', height: '100px' }}
        />
      </div>

      <button
        onClick={handleSendNotification}
        disabled={status === 'sending'}
        style={{
          padding: '10px 15px',
          background: status === 'sending' ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: status === 'sending' ? 'not-allowed' : 'pointer'
        }}
      >
        {status === 'sending' ? 'جاري الإرسال...' : 'إرسال الإشعار'}
      </button>

      {message && (
        <div style={{ marginTop: '15px', padding: '10px', borderRadius: '4px', 
                      backgroundColor: status === 'success' ? '#dff0d8' : '#f2dede',
                      color: status === 'success' ? '#3c763d' : '#a94442' }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>ملاحظة: هذا مثال تجريبي. في تطبيق حقيقي:</p>
        <ul>
          <li>يجب الحصول على توكن الجهاز المستقبل من قاعدة البيانات</li>
          <li>يجب الحصول على معرف المستخدم من سياق المصادقة</li>
          <li>يجب التعامل مع الأخطاء بشكل أكثر تفصيلاً</li>
        </ul>
      </div>
    </div>
  );
};

export default NotificationExample;
