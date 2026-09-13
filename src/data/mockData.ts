import {
  AppUser,
  Tournament,
  WalletTransaction,
  Banner,
  AppNotification,
  AdminUser,
  SystemSettings,
  AuditLog,
  MatchCategory
} from '../types';

export const initialAdminUser: AdminUser | null = null;

export const initialUsers: AppUser[] = [];

export const initialTournaments: Tournament[] = [];

export const initialCategories: MatchCategory[] = [
  {
    id: 'cat-survivor',
    name: 'SURVIVOR',
    description: 'Survivor & Battle Royale matches',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    sortOrder: 1,
    displayOrder: 1,
    order: 1
  },
  {
    id: 'cat-arena',
    name: 'ARENA',
    description: 'Arena & TDM matches',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80',
    sortOrder: 2,
    displayOrder: 2,
    order: 2
  },
  {
    id: 'cat-lone-wolf',
    name: 'LONE WOLF',
    description: '1v1 & 2v2 Lone Wolf combat matches',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    sortOrder: 3,
    displayOrder: 3,
    order: 3
  }
];

export const initialTransactions: WalletTransaction[] = [];

export const initialBanners: Banner[] = [];

export const initialNotifications: AppNotification[] = [];

export const initialStaffUsers: AdminUser[] = [];

export const initialSystemSettings: SystemSettings = {
  appName: '',
  contactEmail: '',
  supportPhone: '',
  whatsappGroup: '',
  telegramChannel: '',
  telegramGroup: '',
  telegramSupport: '',
  instagramUrl: '',
  youtubeChannel: '',
  discordServer: '',
  websiteUrl: '',
  directChatUrl: '',
  supportLinks: [],
  telegramSupportUrl: '',
  telegramEnabled: false,
  telegramName: 'Telegram Customer Support',
  telegramDescription: 'Instant 24/7 support & match query resolution',
  whatsappChannelUrl: '',
  whatsappEnabled: false,
  whatsappName: 'WhatsApp Official Update Channel',
  whatsappDescription: 'Get official match announcements & room ID updates',
  instagramEnabled: false,
  instagramName: 'Instagram Official Page',
  instagramDescription: 'Follow for tournament highlights, giveaways & news',
  youtubeUrl: '',
  youtubeEnabled: false,
  youtubeName: 'YouTube Official Channel',
  youtubeDescription: 'Watch live streamings & official match replays',
  upiId: '',
  upiName: '',
  depositQrImageUrl: '',
  customQrLink: '',
  depositInstructions: '',
  minDeposit: 10,
  minWithdrawal: 100,
  maxDeposit: 50000,
  maxWithdrawal: 25000,
  maintenanceMode: false,
  maintenanceMessage: '',
  aboutUs: '',
  faqList: [],
  termsAndFairPlayRulesText: '',
  privacyPolicyText: '',
  privacyPolicy: '',
  firebaseConfigured: true,
  firebaseProjectId: 'winx7-bc'
};

export const initialAuditLogs: AuditLog[] = [];

