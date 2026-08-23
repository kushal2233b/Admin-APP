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

export const initialCategories: MatchCategory[] = [];

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

