// Mock data for our application

export interface PhoneReport {
  isLost: any;
  id: string;
  ownerName: string;
  phoneNumber: string;
  imei: string;
  lossLocation: string;
  lossTime: string;
  phoneImage?: string;
  reportImage?: string;
  invoiceImage?: string;
  reportDate: string;
  status: 'active' | 'resolved' | 'pending';
  password?: string;
}

export interface Advertisement {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
}

// Mock phone reports
export const mockPhoneReports: PhoneReport[] = [
  {
    id: '1',
    ownerName: 'Mohammed Ali',
    phoneNumber: '+966501234567',
    imei: '123456789012345',
    lossLocation: 'Riyadh Mall',
    lossTime: '2025-04-10T18:30:00',
    phoneImage: '/placeholder.svg',
    reportDate: '2025-04-11T10:15:00',
    status: 'active',
    isLost: true
  },
  {
    id: '2',
    ownerName: 'Sara Ahmed',
    phoneNumber: '+966512345678',
    imei: '234567890123456',
    lossLocation: 'Jeddah Beach',
    lossTime: '2025-04-09T15:45:00',
    phoneImage: '/placeholder.svg',
    reportDate: '2025-04-09T19:20:00',
    status: 'active',
    isLost: true
  },
  {
    id: '3',
    ownerName: 'Khalid Omar',
    phoneNumber: '+966523456789',
    imei: '345678901234567',
    lossLocation: 'Dammam University',
    lossTime: '2025-04-08T09:15:00',
    phoneImage: '/placeholder.svg',
    reportDate: '2025-04-08T11:30:00',
    status: 'resolved',
    isLost: false
  }
];

// Mock advertisements
export const mockAdvertisements: Advertisement[] = [
  {
    id: '1',
    title: 'Phone Protection Services',
    content: 'Protect your phone against theft and loss with our premium services.',
    imageUrl: '/placeholder.svg'
  },
  {
    id: '2',
    title: 'New Security Features',
    content: 'Track your device with advanced security features now available.',
    imageUrl: '/placeholder.svg'
  },
  {
    id: '3',
    title: 'Report Recovery Success',
    content: 'Over 500 phones returned to their owners through our platform!',
    imageUrl: '/placeholder.svg'
  }
];
