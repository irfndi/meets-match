export interface User {
  id: string;
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  bio?: string;
  location?: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
  };
  photos: string[];
  preferences: {
    min_age?: number;
    max_age?: number;
    gender?: 'male' | 'female' | 'other' | 'any';
    max_distance?: number;
  };
  is_active: boolean;
  state: 'idle' | 'editing_profile' | 'browsing' | 'chatting';
  created_at: Date;
  updated_at: Date;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  user1_liked: boolean;
  user2_liked: boolean;
  is_mutual: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  match_id: string;
  created_at: Date;
  updated_at: Date;
  last_message_at?: Date;
  is_active: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'photo' | 'video' | 'audio' | 'document';
  media_url?: string;
  is_read: boolean;
  created_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_data: Record<string, any>;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Analytics {
  id: string;
  user_id?: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: Date;
}

// API Request/Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface AuthRequest {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  bio?: string;
  location?: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
  };
  preferences?: {
    min_age?: number;
    max_age?: number;
    gender?: 'male' | 'female' | 'other' | 'any';
    max_distance?: number;
  };
}

export interface MatchRequest {
  target_user_id: string;
  liked: boolean;
}

export interface SendMessageRequest {
  conversation_id: string;
  content: string;
  message_type?: 'text' | 'photo' | 'video' | 'audio' | 'document';
  media_url?: string;
}

export interface GetMessagesQuery extends PaginationQuery {
  conversation_id: string;
  since?: string; // ISO date string
}

export interface GetMatchesQuery extends PaginationQuery {
  mutual_only?: boolean;
  user_id?: string;
}

export interface GetUsersQuery extends PaginationQuery {
  active_only?: boolean;
  gender?: 'male' | 'female' | 'other';
  min_age?: number;
  max_age?: number;
  location?: {
    latitude: number;
    longitude: number;
    radius?: number; // in kilometers
  };
}

export interface AnalyticsQuery extends PaginationQuery {
  user_id?: string;
  event_type?: string;
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  telegramId: number;
  username?: string;
  iat: number;
  exp: number;
}

// File upload types
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface PhotoUploadResponse {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
  };
  uptime: number;
  version: string;
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}