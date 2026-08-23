export type AdminRole = 'superadmin' | 'admin' | 'staff';
export type AdminStatus = 'active' | 'inactive';

export interface AdminUser {
  uid: string;
  id?: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: AdminStatus;
  avatarUrl?: string;
  createdAt: string;
  permissions: string[];
}

export type UserStatus = 'active' | 'blocked' | 'banned' | 'suspended';

export interface AvatarPreset {
  id: 'avatar_1' | 'avatar_2' | 'avatar_3' | 'avatar_4' | 'avatar_5' | string;
  name: string;
  url: string;
  updatedAt?: string;
}

export interface AppUser {
  id: string;
  uid: string;
  username: string;
  displayName?: string;
  email: string;
  phone: string;
  inGameId: string;
  inGameName: string;
  walletBalance: number;
  depositBalance?: number;
  unclaimedWinnings: number;
  winningBalance?: number;
  bonusBalance?: number;
  totalBalance?: number;
  totalEarnings?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  matchesPlayed: number;
  matchesWon: number;
  totalKills: number;
  status: UserStatus;
  role?: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  deviceInfo?: any;
  createdAt: string;
  lastLogin?: string;
  avatar_id?: string;
  avatarId?: string;
  avatarUrl?: string;
  photoURL?: string;
  profilePic?: string;
  profileImage?: string;
  avatar?: string;
  banReason?: string;
}

export interface UserWallet {
  id?: string;
  userId: string;
  depositBalance: number;
  winningBalance: number;
  bonusBalance: number;
  totalBalance: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MatchCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  imageUrl?: string;
  bannerUrl?: string;
  createdAt?: string;
  displayOrder?: number;
  sortOrder?: number;
  order?: number;
}

export type GameCategory = string;
export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'completed' | 'cancelled';
export type MatchType = string;
export type MapType = string;

export interface Participant {
  userId: string;
  username: string;
  inGameId: string;
  inGameName: string;
  slotNumber: number;
  kills?: number;
  rank?: number;
  prizeWon?: number;
  uid?: string;
  id?: string;
  userUid?: string;
  email?: string;
  avatarUrl?: string;
  photoURL?: string;
  profilePic?: string;
  avatar?: string;
  [key: string]: any;
}

export interface PrizeDistributionItem {
  id?: string;
  rankRange: string; // e.g., "1st", "2nd", "3rd", "4th-10th"
  prize: number;     // e.g., 100
}

export interface SavedImage {
  id: string;
  name: string;
  url: string;
  storagePath?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Tournament {
  id: string;
  title: string;
  game: GameCategory;
  categoryId?: string;
  category?: string;
  bannerUrl: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  cardImage?: string;
  card_image?: string;
  banner_url?: string;
  savedImageId?: string;
  matchType: MatchType;
  map: MapType;
  entryFee: number;
  prizePool: number;
  perKillReward: number;
  perKillPrize?: number;
  startTime: string;
  matchSchedule?: string;
  schedule?: string;
  maxSlots: number;
  filledSlots: number;
  maxParticipants?: number;
  joinedParticipants?: number;
  status: MatchStatus;
  results_published?: boolean;
  resultsPublished?: boolean;
  is_results_published?: boolean;
  roomId?: string;
  roomPassword?: string;
  accessCode?: string;
  access_code?: string;
  isRoomReleased: boolean;
  roomDetailsVisible?: boolean;
  isRoomCredentialsVisible?: boolean;
  rules: string;
  participants: Participant[];
  isFeatured?: boolean;
  tags?: string[];
  version?: string;
  organizer?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  completed_at?: string;
  finishedAt?: string;
  finished_at?: string;
  participantResults?: Participant[];
  participant_results?: Participant[];
  matchResults?: Participant[];
  match_results?: Participant[];
  results?: Participant[];
  isPlaceholder?: boolean;
  matchDate?: string;
  match_date?: string;
  match_time?: string;
  dayOfWeek?: string;
  formattedTime?: string;
  prizeDistribution?: PrizeDistributionItem[];
  prize_distribution?: PrizeDistributionItem[];
}

export type TransactionType = 'deposit' | 'withdrawal' | 'entry_fee' | 'winning' | 'kill_bonus' | 'refund' | 'admin_adjustment';
export type TransactionStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface WalletTransaction {
  id: string;
  userId: string;
  username: string;
  userEmail?: string;
  userPhone?: string;
  fullName?: string;
  senderName?: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  title?: string;
  description?: string;
  paymentMethod: 'UPI' | 'Paytm' | 'Bank Transfer' | 'Crypto' | 'Wallet';
  referenceId: string;
  withdrawalRequestId?: string;
  utr?: string;
  payoutReference?: string;
  proofImageUrl?: string;
  upiId?: string;
  bankDetails?: string;
  adminNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  processedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  processedBy?: string;
  isCredit?: boolean;
  walletType?: 'main' | 'winning';
  isRefunded?: boolean;
  refundedAt?: string;
  refundTxId?: string;
  refundNotes?: string;
  _sourceCollection?: string;
}

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  actionUrl?: string;
  isActive: boolean;
  displayOrder: number;
  category?: string;
  createdAt: string;
}

export type NotificationType = 'all' | 'match' | 'deposit' | 'withdrawal' | 'announcement';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  targetUserId?: string;
  targetMatchId?: string;
  sentAt: string;
  sentBy: string;
  userId?: string;
  userUid?: string;
  createdAt?: string;
  isRead?: boolean;
  read?: boolean;
  imageUrl?: string;
  link?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minDeposit: number;
  minDepositAmount?: number;
  maxDiscount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  timesUsed?: number;
  usedCount?: number;
  expiryDate?: string;
  validUntil?: string;
  isActive: boolean;
  createdAt: string;
  description?: string;
}

export interface SupportLinkItem {
  id: string;
  title: string;
  type: 'telegram_channel' | 'telegram_group' | 'telegram_support' | 'whatsapp' | 'instagram' | 'youtube' | 'discord' | 'email' | 'phone' | 'website' | 'other';
  url: string;
  icon?: string;
  description?: string;
  isActive: boolean;
}

export interface OfficialLinkConfig {
  telegramContact: string;
  telegramEnabled: boolean;
  telegramName: string;
  telegramDescription: string;

  whatsappContact: string;
  whatsappEnabled: boolean;
  whatsappName: string;
  whatsappDescription: string;

  instagramContact: string;
  instagramEnabled: boolean;
  instagramName: string;
  instagramDescription: string;

  youtubeContact: string;
  youtubeEnabled: boolean;
  youtubeName: string;
  youtubeDescription: string;

  updatedAt?: string;
  updatedBy?: string;
}

export interface SystemSettings {
  appName: string;
  logoUrl?: string;
  splashScreenUrl?: string;
  contactEmail: string;
  supportPhone: string;
  whatsappGroup?: string;
  telegramChannel?: string;
  telegramGroup?: string;
  telegramSupport?: string;
  youtubeChannel?: string;
  discordServer?: string;
  websiteUrl?: string;
  directChatUrl?: string;
  supportLinks?: SupportLinkItem[];

  // Centralized Official Links using exact DB fields
  telegramContact?: string;
  telegramEnabled?: boolean;
  telegramName?: string;
  telegramDescription?: string;

  whatsappContact?: string;
  whatsappEnabled?: boolean;
  whatsappName?: string;
  whatsappDescription?: string;

  instagramContact?: string;
  instagramEnabled?: boolean;
  instagramName?: string;
  instagramDescription?: string;

  youtubeContact?: string;
  youtubeEnabled?: boolean;
  youtubeName?: string;
  youtubeDescription?: string;

  upiId: string;
  upiName: string;
  depositQrImageUrl?: string;
  customQrLink?: string;
  depositInstructions?: string;
  manualUpiId?: string;
  manualUpiName?: string;
  manualQrUrl?: string;
  manualQrInstruction?: string;
  depositMode?: string;
  gatewayProvider?: string;
  discordContact?: string;
  supportEmail?: string;
  helpDeskPhone?: string;
  referralBonus?: number;
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
  tournamentsEnabled?: boolean;
  registrationEnabled?: boolean;
  referralEnabled?: boolean;
  minAppVersion?: string;
  dailyWithdrawalLimit?: number;
  autoApproveWithdrawals?: boolean;
  autoApprovalMaxAmount?: number;
  minDeposit: number;
  minWithdrawal: number;
  maxDeposit?: number;
  maxWithdrawal?: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  aboutUs?: string;
  faqList?: { question: string; answer: string }[];
  termsAndConditions?: string;
  privacyPolicy?: string;
  fairPlayRules?: string;
  termsAndFairPlayRulesText?: string;
  privacyPolicyText?: string;
  appVersion?: string;
  firebaseConfigured?: boolean;
  firebaseProjectId?: string;
  [key: string]: any;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  timestamp: string;
  details?: string;
}

export interface MatchRulesPreset {
  id: string;
  name: string;
  rules: string;
  createdAt: string;
}
