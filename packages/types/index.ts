export type Plan = "FREE" | "STANDARD" | "PRO";

export type SubStatus = "ACTIVE" | "CANCELLED" | "EXPIRED";

export interface UserProfile {
  id: string;
  supabaseId: string;
  email: string;
  plan: Plan;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: Plan;
  portoneOrderId?: string;
  portonePaymentId?: string;
  status: SubStatus;
  currentPeriodEnd: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: number;
  deadline: string;
  category: string;
  region: string;
  createdAt: string;
}

export interface BidResult {
  id: string;
  annId: string;
  bidRate: number;
  finalPrice: number;
  numBidders: number;
  createdAt: string;
}


export type QualResult = "PASS" | "UNCERTAIN" | "FAIL";

export interface NumberComboResult {
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
  freqMap: Record<number, number>;
  sampleSize: number;
  modelVersion: string;
  isEstimated: boolean;
  used: number;
  limit: number;
}
