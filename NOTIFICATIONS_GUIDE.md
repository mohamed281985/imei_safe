# دليل إعداد وإرسال الإشعارات الخارجية من هاتف لآخر

## نظرة عامة

هذا الدليل يشرح كيفية إعداد واستخدام نظام الإشعارات في تطبيقك للسماح بإرسال الإشعارات من هاتف لآخر باستخدام Firebase Cloud Messaging (FCM).

## الإعدادات المطلوبة

### 1. إعدادات الخادم (paymop-server)

تم إعداد الخادم بالفعل مع الدعم الكامل لنظام الإشعارات. تمت إضافة المتغيرات التالية إلى ملف `.env`:

```env
# Firebase configuration
FIREBASE_PROJECT_ID=imeisafe-b2dd8
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@imeisafe-b2dd8.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
... (المفتاح الخاص هنا)
-----END PRIVATE KEY-----
```

### 2. نقاط النهاية المتاحة في الخادم

- `/api/send-fcm-v1`: نقطة نهاية عامة لإرسال إشعارات FCM
- `/api/send-notification`: نقطة نهاية خاصة لإرسال الإشعارات من هاتف لآخر

### 3. استخدام نقطة النهاية `/api/send-notification`

لإرسال إشعار من هاتف لآخر، أرسل طلب POST إلى `/api/send-notification` مع البيانات التالية:

```json
{
  "senderId": "معرف المرسل",
  "receiverToken": "توكن جهاز المستلم",
  "title": "عنوان الإشعار",
  "body": "محتوى الإشعار",
  "data": {
    "type": "custom_message",
    "additional_data": "أي بيانات إضافية"
  }
}
```

## استخدام خدمة الإشعارات في التطبيق

### 1. استيراد الخدمة

```typescript
import { NotificationService } from '../services/notificationService';
```

### 2. إرسال إشعار

```typescript
const result = await NotificationService.sendNotification(
  'معرف المرسل',
  'توكن جهاز المستلم',
  'عنوان الإشعار',
  'محتوى الإشعار',
  { type: 'custom_message' }
);

if (result.success) {
  console.log('تم إرسال الإشعار بنجاح');
} else {
  console.error('فشل في إرسال الإشعار:', result.error);
}
```

### 3. تسجيل توكن الجهاز

عند بدء التطبيق، يجب تسجيل توكن الجهاز لتلقي الإشعارات:

```typescript
const result = await NotificationService.registerDeviceToken(
  'معرف المستخدم',
  'توكن الجهاز'
);
```

### 4. الحصول على الإشعارات

لجلب الإشعارات الخاصة بالمستخدم:

```typescript
const result = await NotificationService.getUserNotifications('معرف المستخدم');
if (result.success) {
  // التعامل مع قائمة الإشعارات
  const notifications = result.notifications;
}
```

## خطوات إضافية مطلوبة للتطبيق الكامل

### 1. الحصول على توكن الجهاز (FCM Token)

في تطبيقك، تحتاج إلى الحصول على توكن FCM من جهاز المستخدم:

```typescript
// في مكون التطبيق الرئيسي
import { getMessaging, getToken } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';

// إعداد Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// الحصول على توكن الجهاز
getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' }).then((currentToken) => {
  if (currentToken) {
    // إرسال التوكن إلى الخادم لتسجيله
    NotificationService.registerDeviceToken(userId, currentToken);
  } else {
    console.log('لا يوجد توكن متاح. يجب طلب الإذن أولاً.');
  }
}).catch((err) => {
  console.log('An error occurred while retrieving token. ', err);
});
```

### 2. استقبال الإشعارات

لإعداد مستقبل الإشعارات في التطبيق:

```typescript
// في مكون التطبيق الرئيسي
import { onMessage } from 'firebase/messaging';

onMessage(messaging, (payload) => {
  console.log('Message received. ', payload);
  // عرض الإشعار للمستخدم
  // يمكن استخدام مكتبة مثل react-native-push-notification أو أي حل آخر
});
```

### 3. إدارة صلاحيات الإشعارات

يجب طلب صلاحية إرسال الإشعارات من المستخدم:

```typescript
// طلب الإذن
Notification.requestPermission().then((permission) => {
  if (permission === 'granted') {
    console.log('Permission granted.');
    // الحصول على توكن الجهاز وإرساله للخادم
  } else {
    console.log('Permission denied.');
    // التعامل مع رفض المستخدم
  }
});
```

## ملاحظات هامة

1. تأكد من أن بيانات Firebase Service Account صحيحة في ملف `.env`
2. في التطبيق الفعلي، يجب الحصول على توكن الجهاز من مكتبة FCM الرسمية
3. يجب التعامل مع حالة عدم وجود توكن (قد يكون المستخدم قد رفض الإشعارات)
4. يجب تسجيل توكن الجهاز في كل مرة يقوم فيها المستخدم بتسجيل الدخول

## اختبار النظام

يمكنك استخدام مكون `NotificationExample` الذي تم إنشاؤه لاختبار إرسال الإشعارات:

```jsx
import NotificationExample from '../components/NotificationExample';

// استخدامه في أي مكان في التطبيق
<NotificationExample />
```

## استنتاجات

لقد قمنا بإعداد نظام كامل لإرسال الإشعارات من هاتف لآخر باستخدام FCM. يتضمن ذلك:

1. إعدادات الخادم اللازمة
2. نقاط نهاية API لإرسال الإشعارات
3. خدمة TypeScript للتعامل مع الإشعارات في التطبيق
4. مثال لمكون React لإرسال الإشعارات
5. دليل شامل للاستخدام

يمكن الآن للمستخدمين إرسال الإشعارات إلى بعضهم البعض عبر التطبيق.
